package main

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"strings"
	"sync"
	"sync/atomic"
	"time"
)

type jsonMap map[string]any

func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}

func decodeJSON(r *http.Request, dst any) error {
	dec := json.NewDecoder(r.Body)
	dec.DisallowUnknownFields()
	return dec.Decode(dst)
}

type Client struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

type Chat struct {
	ID             string    `json:"id"`
	ClientID       string    `json:"client_id"`
	Title          string    `json:"title"`
	Persona        string    `json:"persona"`
	UnreadForAdmin int       `json:"unread_for_admin"`
	LastMessageAt  time.Time `json:"last_message_at"`
}

type Message struct {
	ID        string    `json:"id"`
	ChatID    string    `json:"chat_id"`
	Sender    string    `json:"sender"`
	Content   string    `json:"content"`
	CreatedAt time.Time `json:"created_at"`
}

type Store struct {
	mu       sync.Mutex
	clients  map[string]*Client
	emailIdx map[string]string
	chats    map[string]*Chat
	messages map[string][]*Message
}

var (
	store     = newStore()
	idCounter int64

	googleStateMu sync.Mutex
	googleStates  = make(map[string]googleStateEntry)
)

type googleStateEntry struct {
	RedirectURL string
	CreatedAt   time.Time
}

func newStore() *Store {
	s := &Store{
		clients:  make(map[string]*Client),
		emailIdx: make(map[string]string),
		chats:    make(map[string]*Chat),
		messages: make(map[string][]*Message),
	}
	seedStore(s)
	return s
}

func seedStore(s *Store) {
	c1 := &Client{ID: "client_1", Name: "alex.johnson@example.com"}
	c2 := &Client{ID: "client_2", Name: "maria.lopez@example.com"}
	s.clients[c1.ID] = c1
	s.clients[c2.ID] = c2
	s.emailIdx[c1.Name] = c1.ID
	s.emailIdx[c2.Name] = c2.ID

	chat1 := &Chat{
		ID:             "chat_1",
		ClientID:       c1.ID,
		Title:          "Привет! Нужна помощь с регистрацией.",
		Persona:        "Donald Trump",
		UnreadForAdmin: 1,
		LastMessageAt:  time.Now().Add(-15 * time.Minute),
	}
	chat2 := &Chat{
		ID:             "chat_2",
		ClientID:       c2.ID,
		Title:          "Хочу узнать про тарифы.",
		Persona:        "Barack Obama",
		UnreadForAdmin: 0,
		LastMessageAt:  time.Now().Add(-1 * time.Hour),
	}
	s.chats[chat1.ID] = chat1
	s.chats[chat2.ID] = chat2

	s.messages[chat1.ID] = []*Message{
		{
			ID:        nextID("msg"),
			ChatID:    chat1.ID,
			Sender:    "client",
			Content:   "Привет! Нужна помощь с **регистрацией**.\n\n- Не приходит код\n- Не открывается экран",
			CreatedAt: time.Now().Add(-16 * time.Minute),
		},
		{
			ID:        nextID("msg"),
			ChatID:    chat1.ID,
			Sender:    "admin",
			Content:   "Сейчас проверю. 👍",
			CreatedAt: time.Now().Add(-14 * time.Minute),
		},
		{
			ID:        nextID("msg"),
			ChatID:    chat1.ID,
			Sender:    "client",
			Content:   "Спасибо!",
			CreatedAt: time.Now().Add(-12 * time.Minute),
		},
	}
	s.messages[chat2.ID] = []*Message{
		{
			ID:        nextID("msg"),
			ChatID:    chat2.ID,
			Sender:    "client",
			Content:   "Хочу узнать про тарифы.",
			CreatedAt: time.Now().Add(-2 * time.Hour),
		},
	}
}

func (s *Store) getOrCreateClientByEmail(email string) *Client {
	s.mu.Lock()
	defer s.mu.Unlock()

	if id, ok := s.emailIdx[email]; ok {
		if client, exists := s.clients[id]; exists {
			return client
		}
	}

	id := nextID("client")
	client := &Client{ID: id, Name: email}
	s.clients[id] = client
	s.emailIdx[email] = id
	return client
}

func nextID(prefix string) string {
	n := atomic.AddInt64(&idCounter, 1)
	return fmt.Sprintf("%s_%d", prefix, n)
}

func withCORS(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next(w, r)
	}
}

func requireAdminAuth(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		token := strings.TrimSpace(strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer"))
		if token != "admin-token" {
			writeJSON(w, http.StatusUnauthorized, jsonMap{"error": "unauthorized"})
			return
		}
		next(w, r)
	}
}

type googleConfig struct {
	ClientID     string
	ClientSecret string
	CallbackURL  string
}

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8000"
	}

	googleCfg := googleConfig{
		ClientID:     os.Getenv("GOOGLE_CLIENT_ID"),
		ClientSecret: os.Getenv("GOOGLE_CLIENT_SECRET"),
		CallbackURL:  os.Getenv("GOOGLE_OAUTH_CALLBACK_URL"),
	}

	mux := http.NewServeMux()

	mux.HandleFunc("/health", withCORS(func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, jsonMap{"ok": true})
	}))

	// Auth stubs
	mux.HandleFunc("/api/v1/auth/login", withCORS(func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, jsonMap{"token": "stub", "refresh": "stub"})
	}))
	mux.HandleFunc("/api/v1/auth/register", withCORS(func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, jsonMap{"id": "stub"})
	}))
	mux.HandleFunc("/api/v1/auth/forgot-password", withCORS(func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, jsonMap{"sent": true})
	}))
	mux.HandleFunc("/api/v1/auth/google/start", handleGoogleStart(googleCfg))
	mux.HandleFunc("/api/v1/auth/google/callback", handleGoogleCallback(googleCfg))

	mux.HandleFunc("/api/v1/admin/login", withCORS(handleAdminLogin))
	mux.HandleFunc("/api/v1/admin/clients", withCORS(requireAdminAuth(handleAdminClients)))
	mux.HandleFunc("/api/v1/admin/chats", withCORS(requireAdminAuth(handleAdminChats)))
	mux.HandleFunc("/api/v1/admin/chats/", withCORS(requireAdminAuth(handleAdminChatRoutes)))

	mux.HandleFunc("/api/v1/clients/", withCORS(handleClientRoutes))
	mux.HandleFunc("/api/v1/chats/", withCORS(handleChatRoutes))

	srv := &http.Server{
		Addr:    ":" + port,
		Handler: mux,
	}

	log.Printf("listening on :%s", port)
	log.Fatal(srv.ListenAndServe())
}

func handleGoogleStart(cfg googleConfig) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if cfg.ClientID == "" || cfg.ClientSecret == "" || cfg.CallbackURL == "" {
			writeJSON(w, http.StatusBadRequest, jsonMap{"error": "google oauth not configured"})
			return
		}

		redirect := r.URL.Query().Get("redirect")
		if redirect == "" {
			writeJSON(w, http.StatusBadRequest, jsonMap{"error": "redirect required"})
			return
		}

		state := nextID("state")
		googleStateMu.Lock()
		googleStates[state] = googleStateEntry{RedirectURL: redirect, CreatedAt: time.Now()}
		googleStateMu.Unlock()

		q := url.Values{}
		q.Set("client_id", cfg.ClientID)
		q.Set("redirect_uri", cfg.CallbackURL)
		q.Set("response_type", "code")
		q.Set("scope", "openid email profile")
		q.Set("access_type", "offline")
		q.Set("prompt", "consent")
		q.Set("state", state)

		authURL := "https://accounts.google.com/o/oauth2/v2/auth?" + q.Encode()
		http.Redirect(w, r, authURL, http.StatusFound)
	}
}

type googleTokenResponse struct {
	AccessToken  string `json:"access_token"`
	IDToken      string `json:"id_token"`
	ExpiresIn    int    `json:"expires_in"`
	RefreshToken string `json:"refresh_token"`
	TokenType    string `json:"token_type"`
}

type googleUserInfo struct {
	Email string `json:"email"`
	Name  string `json:"name"`
}

func handleGoogleCallback(cfg googleConfig) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if cfg.ClientID == "" || cfg.ClientSecret == "" || cfg.CallbackURL == "" {
			writeJSON(w, http.StatusBadRequest, jsonMap{"error": "google oauth not configured"})
			return
		}

		code := r.URL.Query().Get("code")
		state := r.URL.Query().Get("state")
		if code == "" || state == "" {
			writeJSON(w, http.StatusBadRequest, jsonMap{"error": "missing code/state"})
			return
		}

		googleStateMu.Lock()
		stateEntry, ok := googleStates[state]
		if ok {
			delete(googleStates, state)
		}
		googleStateMu.Unlock()
		if !ok {
			writeJSON(w, http.StatusBadRequest, jsonMap{"error": "invalid state"})
			return
		}

		tokenData, err := exchangeGoogleCode(code, cfg)
		if err != nil {
			writeJSON(w, http.StatusBadRequest, jsonMap{"error": err.Error()})
			return
		}

		userInfo, err := fetchGoogleUserInfo(tokenData.AccessToken)
		if err != nil {
			writeJSON(w, http.StatusBadRequest, jsonMap{"error": err.Error()})
			return
		}

		client := store.getOrCreateClientByEmail(userInfo.Email)

		// For now issue a stub token for the client app.
		redirectURL, err := url.Parse(stateEntry.RedirectURL)
		if err != nil {
			writeJSON(w, http.StatusBadRequest, jsonMap{"error": "invalid redirect"})
			return
		}
		q := redirectURL.Query()
		q.Set("token", "client-token")
		q.Set("email", userInfo.Email)
		q.Set("client_id", client.ID)
		redirectURL.RawQuery = q.Encode()
		http.Redirect(w, r, redirectURL.String(), http.StatusFound)
	}
}

func exchangeGoogleCode(code string, cfg googleConfig) (*googleTokenResponse, error) {
	form := url.Values{}
	form.Set("code", code)
	form.Set("client_id", cfg.ClientID)
	form.Set("client_secret", cfg.ClientSecret)
	form.Set("redirect_uri", cfg.CallbackURL)
	form.Set("grant_type", "authorization_code")

	req, err := http.NewRequest(http.MethodPost, "https://oauth2.googleapis.com/token", strings.NewReader(form.Encode()))
	if err != nil {
		return nil, fmt.Errorf("token request failed")
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	res, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("token request failed")
	}
	defer res.Body.Close()

	body, _ := io.ReadAll(res.Body)
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		return nil, fmt.Errorf("token exchange failed")
	}

	var token googleTokenResponse
	if err := json.Unmarshal(body, &token); err != nil {
		return nil, fmt.Errorf("token parse failed")
	}
	return &token, nil
}

func fetchGoogleUserInfo(accessToken string) (*googleUserInfo, error) {
	req, err := http.NewRequest(http.MethodGet, "https://openidconnect.googleapis.com/v1/userinfo", nil)
	if err != nil {
		return nil, fmt.Errorf("userinfo request failed")
	}
	req.Header.Set("Authorization", "Bearer "+accessToken)

	res, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("userinfo request failed")
	}
	defer res.Body.Close()

	body, _ := io.ReadAll(res.Body)
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		return nil, fmt.Errorf("userinfo failed")
	}

	var info googleUserInfo
	if err := json.Unmarshal(body, &info); err != nil {
		return nil, fmt.Errorf("userinfo parse failed")
	}
	return &info, nil
}

func handleAdminLogin(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, jsonMap{"error": "method not allowed"})
		return
	}

	var req struct {
		Username string `json:"username"`
		Password string `json:"password"`
	}
	if err := decodeJSON(r, &req); err != nil {
		writeJSON(w, http.StatusBadRequest, jsonMap{"error": "invalid json"})
		return
	}

	if req.Username != "admin" || req.Password != "showme123" {
		writeJSON(w, http.StatusUnauthorized, jsonMap{"error": "invalid credentials"})
		return
	}

	writeJSON(w, http.StatusOK, jsonMap{"token": "admin-token"})
}

func handleAdminClients(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSON(w, http.StatusMethodNotAllowed, jsonMap{"error": "method not allowed"})
		return
	}

	store.mu.Lock()
	defer store.mu.Unlock()

	type chatSummary struct {
		ID             string `json:"id"`
		Title          string `json:"title"`
		Persona        string `json:"persona"`
		UnreadForAdmin int    `json:"unread_for_admin"`
	}
	type clientSummary struct {
		ID    string        `json:"id"`
		Name  string        `json:"name"`
		Chats []chatSummary `json:"chats"`
	}

	items := make([]clientSummary, 0, len(store.clients))
	for _, client := range store.clients {
		summary := clientSummary{ID: client.ID, Name: client.Name}
		for _, chat := range store.chats {
			if chat.ClientID != client.ID {
				continue
			}
			summary.Chats = append(summary.Chats, chatSummary{
				ID:             chat.ID,
				Title:          chat.Title,
				Persona:        chat.Persona,
				UnreadForAdmin: chat.UnreadForAdmin,
			})
		}
		items = append(items, summary)
	}

	writeJSON(w, http.StatusOK, jsonMap{"items": items})
}

func handleAdminChats(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSON(w, http.StatusMethodNotAllowed, jsonMap{"error": "method not allowed"})
		return
	}

	store.mu.Lock()
	defer store.mu.Unlock()

	type chatItem struct {
		ID             string `json:"id"`
		ClientID       string `json:"client_id"`
		ClientName     string `json:"client_name"`
		Title          string `json:"title"`
		Persona        string `json:"persona"`
		UnreadForAdmin int    `json:"unread_for_admin"`
		LastMessageAt  string `json:"last_message_at"`
	}

	items := make([]chatItem, 0, len(store.chats))
	for _, chat := range store.chats {
		clientName := ""
		if client, ok := store.clients[chat.ClientID]; ok {
			clientName = client.Name
		}
		items = append(items, chatItem{
			ID:             chat.ID,
			ClientID:       chat.ClientID,
			ClientName:     clientName,
			Title:          chat.Title,
			Persona:        chat.Persona,
			UnreadForAdmin: chat.UnreadForAdmin,
			LastMessageAt:  chat.LastMessageAt.Format(time.RFC3339),
		})
	}

	writeJSON(w, http.StatusOK, jsonMap{"items": items})
}

func handleAdminChatRoutes(w http.ResponseWriter, r *http.Request) {
	path := strings.TrimPrefix(r.URL.Path, "/api/v1/admin/chats/")
	if path == "" {
		writeJSON(w, http.StatusNotFound, jsonMap{"error": "not found"})
		return
	}
	parts := strings.Split(path, "/")
	chatID := parts[0]
	if len(parts) == 1 {
		writeJSON(w, http.StatusNotFound, jsonMap{"error": "not found"})
		return
	}
	switch parts[1] {
	case "messages":
		if r.Method == http.MethodGet {
			handleAdminChatMessages(w, r, chatID)
			return
		}
		if r.Method == http.MethodPost {
			handleAdminSendMessage(w, r, chatID)
			return
		}
	case "read":
		if r.Method == http.MethodPost {
			handleAdminMarkRead(w, r, chatID)
			return
		}
	}
	writeJSON(w, http.StatusMethodNotAllowed, jsonMap{"error": "method not allowed"})
}

func handleAdminChatMessages(w http.ResponseWriter, r *http.Request, chatID string) {
	store.mu.Lock()
	defer store.mu.Unlock()

	chat, ok := store.chats[chatID]
	if !ok {
		writeJSON(w, http.StatusNotFound, jsonMap{"error": "chat not found"})
		return
	}

	client := store.clients[chat.ClientID]
	clientName := ""
	if client != nil {
		clientName = client.Name
	}

	writeJSON(w, http.StatusOK, jsonMap{
		"chat": jsonMap{
			"id":               chat.ID,
			"title":            chat.Title,
			"persona":          chat.Persona,
			"client_id":        chat.ClientID,
			"client_name":      clientName,
			"unread_for_admin": chat.UnreadForAdmin,
		},
		"messages": store.messages[chatID],
	})
}

func handleAdminSendMessage(w http.ResponseWriter, r *http.Request, chatID string) {
	var req struct {
		Content string `json:"content"`
	}
	if err := decodeJSON(r, &req); err != nil || strings.TrimSpace(req.Content) == "" {
		writeJSON(w, http.StatusBadRequest, jsonMap{"error": "content required"})
		return
	}

	store.mu.Lock()
	defer store.mu.Unlock()

	chat, ok := store.chats[chatID]
	if !ok {
		writeJSON(w, http.StatusNotFound, jsonMap{"error": "chat not found"})
		return
	}

	msg := &Message{
		ID:        nextID("msg"),
		ChatID:    chatID,
		Sender:    "admin",
		Content:   req.Content,
		CreatedAt: time.Now(),
	}
	store.messages[chatID] = append(store.messages[chatID], msg)
	chat.LastMessageAt = msg.CreatedAt

	writeJSON(w, http.StatusCreated, msg)
}

func handleAdminMarkRead(w http.ResponseWriter, r *http.Request, chatID string) {
	store.mu.Lock()
	defer store.mu.Unlock()

	chat, ok := store.chats[chatID]
	if !ok {
		writeJSON(w, http.StatusNotFound, jsonMap{"error": "chat not found"})
		return
	}
	chat.UnreadForAdmin = 0
	writeJSON(w, http.StatusOK, jsonMap{"ok": true})
}

func handleClientRoutes(w http.ResponseWriter, r *http.Request) {
	path := strings.TrimPrefix(r.URL.Path, "/api/v1/clients/")
	parts := strings.Split(strings.Trim(path, "/"), "/")
	if len(parts) < 2 {
		writeJSON(w, http.StatusNotFound, jsonMap{"error": "not found"})
		return
	}
	clientID := parts[0]
	if parts[1] == "chats" {
		if r.Method == http.MethodGet {
			handleClientChatsList(w, r, clientID)
			return
		}
		if r.Method == http.MethodPost {
			handleClientChatCreate(w, r, clientID)
			return
		}
	}
	writeJSON(w, http.StatusMethodNotAllowed, jsonMap{"error": "method not allowed"})
}

func handleClientChatsList(w http.ResponseWriter, r *http.Request, clientID string) {
	store.mu.Lock()
	defer store.mu.Unlock()

	if _, ok := store.clients[clientID]; !ok {
		writeJSON(w, http.StatusNotFound, jsonMap{"error": "client not found"})
		return
	}

	items := make([]*Chat, 0)
	for _, chat := range store.chats {
		if chat.ClientID == clientID {
			items = append(items, chat)
		}
	}
	writeJSON(w, http.StatusOK, jsonMap{"items": items})
}

func handleClientChatCreate(w http.ResponseWriter, r *http.Request, clientID string) {
	var req struct {
		Title   string `json:"title"`
		Persona string `json:"persona"`
	}
	if err := decodeJSON(r, &req); err != nil {
		writeJSON(w, http.StatusBadRequest, jsonMap{"error": "invalid json"})
		return
	}

	store.mu.Lock()
	defer store.mu.Unlock()

	if _, ok := store.clients[clientID]; !ok {
		writeJSON(w, http.StatusNotFound, jsonMap{"error": "client not found"})
		return
	}

	chat := &Chat{
		ID:            nextID("chat"),
		ClientID:      clientID,
		Title:         strings.TrimSpace(req.Title),
		Persona:       strings.TrimSpace(req.Persona),
		LastMessageAt: time.Now(),
	}
	if chat.Title == "" {
		chat.Title = "New chat"
	}
	store.chats[chat.ID] = chat
	store.messages[chat.ID] = []*Message{}

	writeJSON(w, http.StatusCreated, chat)
}

func handleChatRoutes(w http.ResponseWriter, r *http.Request) {
	path := strings.TrimPrefix(r.URL.Path, "/api/v1/chats/")
	parts := strings.Split(strings.Trim(path, "/"), "/")
	if len(parts) < 2 {
		writeJSON(w, http.StatusNotFound, jsonMap{"error": "not found"})
		return
	}
	chatID := parts[0]
	if parts[1] == "messages" {
		if r.Method == http.MethodGet {
			handleChatMessagesList(w, r, chatID)
			return
		}
		if r.Method == http.MethodPost {
			handleChatSendMessage(w, r, chatID)
			return
		}
	}
	writeJSON(w, http.StatusMethodNotAllowed, jsonMap{"error": "method not allowed"})
}

func handleChatMessagesList(w http.ResponseWriter, r *http.Request, chatID string) {
	store.mu.Lock()
	defer store.mu.Unlock()

	if _, ok := store.chats[chatID]; !ok {
		writeJSON(w, http.StatusNotFound, jsonMap{"error": "chat not found"})
		return
	}
	writeJSON(w, http.StatusOK, jsonMap{"items": store.messages[chatID]})
}

func handleChatSendMessage(w http.ResponseWriter, r *http.Request, chatID string) {
	var req struct {
		Content string `json:"content"`
	}
	if err := decodeJSON(r, &req); err != nil || strings.TrimSpace(req.Content) == "" {
		writeJSON(w, http.StatusBadRequest, jsonMap{"error": "content required"})
		return
	}

	store.mu.Lock()
	defer store.mu.Unlock()

	chat, ok := store.chats[chatID]
	if !ok {
		writeJSON(w, http.StatusNotFound, jsonMap{"error": "chat not found"})
		return
	}

	msg := &Message{
		ID:        nextID("msg"),
		ChatID:    chatID,
		Sender:    "client",
		Content:   req.Content,
		CreatedAt: time.Now(),
	}
	store.messages[chatID] = append(store.messages[chatID], msg)
	chat.UnreadForAdmin++
	chat.LastMessageAt = msg.CreatedAt

	writeJSON(w, http.StatusCreated, msg)
}
