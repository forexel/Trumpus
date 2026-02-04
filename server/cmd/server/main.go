package main

import (
	"database/sql"
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

	_ "github.com/lib/pq"
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

type llmResponse struct {
	Content string `json:"content"`
}

type User struct {
	Email    string `json:"email"`
	Password string `json:"-"`
}

type Store struct {
	db *sql.DB
}

var (
	store     *Store
	idCounter int64

	googleStateMu sync.Mutex
	googleStates  = make(map[string]googleStateEntry)
)

type googleStateEntry struct {
	RedirectURL string
	CreatedAt   time.Time
}

func newStore(dsn string) (*Store, error) {
	db, err := sql.Open("postgres", dsn)
	if err != nil {
		return nil, err
	}
	if err := db.Ping(); err != nil {
		return nil, err
	}
	s := &Store{db: db}
	if err := s.migrate(); err != nil {
		return nil, err
	}
	return s, nil
}

func (s *Store) migrate() error {
	stmts := []string{
		`CREATE TABLE IF NOT EXISTS clients (
			id TEXT PRIMARY KEY,
			name TEXT UNIQUE NOT NULL,
			created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
		)`,
		`CREATE TABLE IF NOT EXISTS users (
			email TEXT PRIMARY KEY,
			password TEXT NOT NULL
		)`,
		`CREATE TABLE IF NOT EXISTS chats (
			id TEXT PRIMARY KEY,
			client_id TEXT NOT NULL REFERENCES clients(id),
			title TEXT NOT NULL DEFAULT '',
			persona TEXT NOT NULL,
			unread_for_admin INT NOT NULL DEFAULT 0,
			last_message_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
		)`,
		`CREATE INDEX IF NOT EXISTS idx_chats_client_id ON chats(client_id)`,
		`CREATE TABLE IF NOT EXISTS messages (
			id TEXT PRIMARY KEY,
			chat_id TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
			sender TEXT NOT NULL,
			content TEXT NOT NULL,
			created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
		)`,
		`CREATE INDEX IF NOT EXISTS idx_messages_chat_id ON messages(chat_id)`,
		`CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at)`,
	}
	for _, stmt := range stmts {
		if _, err := s.db.Exec(stmt); err != nil {
			return err
		}
	}
	return nil
}

func (s *Store) getOrCreateClientByEmail(email string) (*Client, error) {
	var client Client
	err := s.db.QueryRow(`SELECT id, name FROM clients WHERE name=$1`, email).Scan(&client.ID, &client.Name)
	if err == nil {
		return &client, nil
	}
	if err != sql.ErrNoRows {
		return nil, err
	}
	id := nextID("client")
	_, err = s.db.Exec(`INSERT INTO clients (id, name) VALUES ($1, $2)`, id, email)
	if err != nil {
		return nil, err
	}
	return &Client{ID: id, Name: email}, nil
}

func (s *Store) registerUser(email, password string) (*Client, bool, error) {
	_, err := s.db.Exec(`INSERT INTO users (email, password) VALUES ($1, $2)`, email, password)
	if err != nil {
		if strings.Contains(err.Error(), "duplicate") {
			return nil, false, nil
		}
		return nil, false, err
	}
	client, err := s.getOrCreateClientByEmail(email)
	if err != nil {
		return nil, false, err
	}
	return client, true, nil
}

func (s *Store) authenticateUser(email, password string) (*Client, bool, error) {
	var stored string
	if err := s.db.QueryRow(`SELECT password FROM users WHERE email=$1`, email).Scan(&stored); err != nil {
		if err == sql.ErrNoRows {
			return nil, false, nil
		}
		return nil, false, err
	}
	if stored != password {
		return nil, false, nil
	}
	client, err := s.getOrCreateClientByEmail(email)
	if err != nil {
		return nil, false, err
	}
	return client, true, nil
}

func (s *Store) resetUserPassword(email, oldPassword, newPassword string) (*Client, bool, error) {
	res, err := s.db.Exec(`UPDATE users SET password=$1 WHERE email=$2 AND password=$3`, newPassword, email, oldPassword)
	if err != nil {
		return nil, false, err
	}
	affected, _ := res.RowsAffected()
	if affected == 0 {
		return nil, false, nil
	}
	client, err := s.getOrCreateClientByEmail(email)
	if err != nil {
		return nil, false, err
	}
	return client, true, nil
}

func (s *Store) getClientByID(id string) (*Client, error) {
	var c Client
	if err := s.db.QueryRow(`SELECT id, name FROM clients WHERE id=$1`, id).Scan(&c.ID, &c.Name); err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	return &c, nil
}

func (s *Store) listClients() ([]*Client, error) {
	rows, err := s.db.Query(`SELECT id, name FROM clients ORDER BY name`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []*Client
	for rows.Next() {
		var c Client
		if err := rows.Scan(&c.ID, &c.Name); err != nil {
			return nil, err
		}
		out = append(out, &c)
	}
	return out, nil
}

func (s *Store) listChatsByClient(clientID string) ([]*Chat, error) {
	rows, err := s.db.Query(`SELECT id, client_id, title, persona, unread_for_admin, last_message_at
		FROM chats WHERE client_id=$1 ORDER BY last_message_at DESC`, clientID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]*Chat, 0)
	for rows.Next() {
		var c Chat
		if err := rows.Scan(&c.ID, &c.ClientID, &c.Title, &c.Persona, &c.UnreadForAdmin, &c.LastMessageAt); err != nil {
			return nil, err
		}
		out = append(out, &c)
	}
	return out, nil
}

func (s *Store) listAllChats() ([]*Chat, error) {
	rows, err := s.db.Query(`SELECT id, client_id, title, persona, unread_for_admin, last_message_at
		FROM chats ORDER BY last_message_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]*Chat, 0)
	for rows.Next() {
		var c Chat
		if err := rows.Scan(&c.ID, &c.ClientID, &c.Title, &c.Persona, &c.UnreadForAdmin, &c.LastMessageAt); err != nil {
			return nil, err
		}
		out = append(out, &c)
	}
	return out, nil
}

func (s *Store) getChatByID(id string) (*Chat, error) {
	var c Chat
	if err := s.db.QueryRow(`SELECT id, client_id, title, persona, unread_for_admin, last_message_at FROM chats WHERE id=$1`, id).
		Scan(&c.ID, &c.ClientID, &c.Title, &c.Persona, &c.UnreadForAdmin, &c.LastMessageAt); err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	return &c, nil
}

func (s *Store) createChat(clientID, title, persona string) (*Chat, error) {
	chat := &Chat{
		ID:             nextID("chat"),
		ClientID:       clientID,
		Title:          strings.TrimSpace(title),
		Persona:        strings.TrimSpace(persona),
		UnreadForAdmin: 0,
		LastMessageAt:  time.Now(),
	}
	_, err := s.db.Exec(`INSERT INTO chats (id, client_id, title, persona, unread_for_admin, last_message_at)
		VALUES ($1, $2, $3, $4, $5, $6)`, chat.ID, chat.ClientID, chat.Title, chat.Persona, chat.UnreadForAdmin, chat.LastMessageAt)
	if err != nil {
		return nil, err
	}
	return chat, nil
}

func (s *Store) listMessages(chatID string) ([]*Message, error) {
	rows, err := s.db.Query(`SELECT id, chat_id, sender, content, created_at FROM messages WHERE chat_id=$1 ORDER BY created_at ASC`, chatID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []*Message
	for rows.Next() {
		var m Message
		if err := rows.Scan(&m.ID, &m.ChatID, &m.Sender, &m.Content, &m.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, &m)
	}
	return out, nil
}

func (s *Store) insertMessage(chatID, sender, content string, createdAt time.Time) (*Message, error) {
	msg := &Message{
		ID:        nextID("msg"),
		ChatID:    chatID,
		Sender:    sender,
		Content:   content,
		CreatedAt: createdAt,
	}
	_, err := s.db.Exec(`INSERT INTO messages (id, chat_id, sender, content, created_at) VALUES ($1,$2,$3,$4,$5)`,
		msg.ID, msg.ChatID, msg.Sender, msg.Content, msg.CreatedAt)
	if err != nil {
		return nil, err
	}
	return msg, nil
}

func (s *Store) updateChatTitle(chatID, title string) error {
	_, err := s.db.Exec(`UPDATE chats SET title=$1 WHERE id=$2`, title, chatID)
	return err
}

func (s *Store) updateChatUnread(chatID string, unread int) error {
	_, err := s.db.Exec(`UPDATE chats SET unread_for_admin=$1 WHERE id=$2`, unread, chatID)
	return err
}

func (s *Store) updateChatLastMessage(chatID string, t time.Time) error {
	_, err := s.db.Exec(`UPDATE chats SET last_message_at=$1 WHERE id=$2`, t, chatID)
	return err
}

func (s *Store) findRecentClientDuplicate(chatID, content string, now time.Time, window time.Duration) (*Message, error) {
	var m Message
	err := s.db.QueryRow(`SELECT id, chat_id, sender, content, created_at
		FROM messages WHERE chat_id=$1 AND sender='client' ORDER BY created_at DESC LIMIT 1`, chatID).
		Scan(&m.ID, &m.ChatID, &m.Sender, &m.Content, &m.CreatedAt)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	if m.Content == content && now.Sub(m.CreatedAt) <= window {
		return &m, nil
	}
	return nil, nil
}

func (s *Store) getLastAdminMessage(chatID string) (*Message, error) {
	var m Message
	err := s.db.QueryRow(`SELECT id, chat_id, sender, content, created_at
		FROM messages WHERE chat_id=$1 AND sender='admin' ORDER BY created_at DESC LIMIT 1`, chatID).
		Scan(&m.ID, &m.ChatID, &m.Sender, &m.Content, &m.CreatedAt)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	return &m, nil
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
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		log.Fatal("DATABASE_URL is required")
	}
	var err error
	store, err = newStore(dsn)
	if err != nil {
		log.Fatalf("failed to init db: %v", err)
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
	mux.HandleFunc("/api/v1/auth/login", withCORS(handleClientLogin))
	mux.HandleFunc("/api/v1/auth/register", withCORS(handleClientRegister))
	mux.HandleFunc("/api/v1/auth/forgot-password", withCORS(handleClientForgot))
	mux.HandleFunc("/api/v1/auth/reset-password", withCORS(handleClientReset))
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

func callLLM(baseURL, chatID, persona, content string) (string, int, string, error) {
	if strings.TrimSpace(baseURL) == "" {
		return "", 0, "", fmt.Errorf("llm base not set")
	}
	payload := jsonMap{
		"chat_id": chatID,
		"persona": persona,
		"content": content,
	}
	body, _ := json.Marshal(payload)
	req, err := http.NewRequest(http.MethodPost, strings.TrimRight(baseURL, "/")+"/respond", strings.NewReader(string(body)))
	if err != nil {
		return "", 0, "", err
	}
	req.Header.Set("Content-Type", "application/json")
	client := &http.Client{Timeout: 120 * time.Second}
	res, err := client.Do(req)
	if err != nil {
		return "", 0, "", err
	}
	defer res.Body.Close()
	respBody, _ := io.ReadAll(res.Body)
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		return "", res.StatusCode, string(respBody), fmt.Errorf("llm error: %s", string(respBody))
	}
	var resp llmResponse
	if err := json.Unmarshal(respBody, &resp); err != nil {
		return "", res.StatusCode, string(respBody), err
	}
	return resp.Content, res.StatusCode, string(respBody), nil
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

		client, err := store.getOrCreateClientByEmail(userInfo.Email)
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, jsonMap{"error": "server error"})
			return
		}

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

func handleClientLogin(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, jsonMap{"error": "method not allowed"})
		return
	}
	var req struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if err := decodeJSON(r, &req); err != nil {
		writeJSON(w, http.StatusBadRequest, jsonMap{"error": "invalid json"})
		return
	}
	if req.Email == "" || req.Password == "" {
		writeJSON(w, http.StatusBadRequest, jsonMap{"error": "email and password required"})
		return
	}
	client, ok, err := store.authenticateUser(req.Email, req.Password)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, jsonMap{"error": "server error"})
		return
	}
	if !ok {
		writeJSON(w, http.StatusUnauthorized, jsonMap{"error": "invalid credentials"})
		return
	}
	writeJSON(w, http.StatusOK, jsonMap{
		"token":     "client-token",
		"email":     req.Email,
		"client_id": client.ID,
	})
}

func handleClientRegister(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, jsonMap{"error": "method not allowed"})
		return
	}
	var req struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if err := decodeJSON(r, &req); err != nil {
		writeJSON(w, http.StatusBadRequest, jsonMap{"error": "invalid json"})
		return
	}
	if req.Email == "" || req.Password == "" {
		writeJSON(w, http.StatusBadRequest, jsonMap{"error": "email and password required"})
		return
	}
	client, ok, err := store.registerUser(req.Email, req.Password)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, jsonMap{"error": "server error"})
		return
	}
	if !ok {
		writeJSON(w, http.StatusConflict, jsonMap{"error": "user already exists"})
		return
	}
	writeJSON(w, http.StatusOK, jsonMap{
		"token":     "client-token",
		"email":     req.Email,
		"client_id": client.ID,
	})
}

func handleClientForgot(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, jsonMap{"error": "method not allowed"})
		return
	}
	var req struct {
		Email string `json:"email"`
	}
	if err := decodeJSON(r, &req); err != nil {
		writeJSON(w, http.StatusBadRequest, jsonMap{"error": "invalid json"})
		return
	}
	if req.Email == "" {
		writeJSON(w, http.StatusBadRequest, jsonMap{"error": "email required"})
		return
	}
	writeJSON(w, http.StatusOK, jsonMap{"sent": true})
}

func handleClientReset(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, jsonMap{"error": "method not allowed"})
		return
	}
	var req struct {
		Email       string `json:"email"`
		OldPassword string `json:"old_password"`
		NewPassword string `json:"new_password"`
	}
	if err := decodeJSON(r, &req); err != nil {
		writeJSON(w, http.StatusBadRequest, jsonMap{"error": "invalid json"})
		return
	}
	if req.Email == "" || req.OldPassword == "" || req.NewPassword == "" {
		writeJSON(w, http.StatusBadRequest, jsonMap{"error": "email and passwords required"})
		return
	}
	client, ok, err := store.resetUserPassword(req.Email, req.OldPassword, req.NewPassword)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, jsonMap{"error": "server error"})
		return
	}
	if !ok {
		writeJSON(w, http.StatusUnauthorized, jsonMap{"error": "invalid credentials"})
		return
	}
	writeJSON(w, http.StatusOK, jsonMap{
		"token":     "client-token",
		"email":     req.Email,
		"client_id": client.ID,
	})
}

func handleAdminClients(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSON(w, http.StatusMethodNotAllowed, jsonMap{"error": "method not allowed"})
		return
	}
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
	clients, err := store.listClients()
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, jsonMap{"error": "server error"})
		return
	}
	items := make([]clientSummary, 0, len(clients))
	for _, client := range clients {
		summary := clientSummary{ID: client.ID, Name: client.Name}
		chats, err := store.listChatsByClient(client.ID)
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, jsonMap{"error": "server error"})
			return
		}
		for _, chat := range chats {
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
	type chatItem struct {
		ID             string `json:"id"`
		ClientID       string `json:"client_id"`
		ClientName     string `json:"client_name"`
		Title          string `json:"title"`
		Persona        string `json:"persona"`
		UnreadForAdmin int    `json:"unread_for_admin"`
		LastMessageAt  string `json:"last_message_at"`
	}
	chats, err := store.listAllChats()
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, jsonMap{"error": "server error"})
		return
	}
	clients, err := store.listClients()
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, jsonMap{"error": "server error"})
		return
	}
	clientNames := make(map[string]string, len(clients))
	for _, c := range clients {
		clientNames[c.ID] = c.Name
	}
	items := make([]chatItem, 0, len(chats))
	for _, chat := range chats {
		items = append(items, chatItem{
			ID:             chat.ID,
			ClientID:       chat.ClientID,
			ClientName:     clientNames[chat.ClientID],
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
	chat, err := store.getChatByID(chatID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, jsonMap{"error": "server error"})
		return
	}
	if chat == nil {
		writeJSON(w, http.StatusNotFound, jsonMap{"error": "chat not found"})
		return
	}

	clientName := ""
	if client, err := store.getClientByID(chat.ClientID); err == nil && client != nil {
		clientName = client.Name
	}
	messages, err := store.listMessages(chatID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, jsonMap{"error": "server error"})
		return
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
		"messages": messages,
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

	chat, err := store.getChatByID(chatID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, jsonMap{"error": "server error"})
		return
	}
	if chat == nil {
		writeJSON(w, http.StatusNotFound, jsonMap{"error": "chat not found"})
		return
	}
	msg, err := store.insertMessage(chatID, "admin", req.Content, time.Now())
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, jsonMap{"error": "server error"})
		return
	}
	_ = store.updateChatLastMessage(chatID, msg.CreatedAt)

	writeJSON(w, http.StatusCreated, msg)
}

func handleAdminMarkRead(w http.ResponseWriter, r *http.Request, chatID string) {
	chat, err := store.getChatByID(chatID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, jsonMap{"error": "server error"})
		return
	}
	if chat == nil {
		writeJSON(w, http.StatusNotFound, jsonMap{"error": "chat not found"})
		return
	}
	_ = store.updateChatUnread(chatID, 0)
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
	client, err := store.getClientByID(clientID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, jsonMap{"error": "server error"})
		return
	}
	if client == nil {
		writeJSON(w, http.StatusNotFound, jsonMap{"error": "client not found"})
		return
	}
	items, err := store.listChatsByClient(clientID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, jsonMap{"error": "server error"})
		return
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

	client, err := store.getClientByID(clientID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, jsonMap{"error": "server error"})
		return
	}
	if client == nil {
		writeJSON(w, http.StatusNotFound, jsonMap{"error": "client not found"})
		return
	}

	if strings.TrimSpace(req.Persona) == "" {
		writeJSON(w, http.StatusBadRequest, jsonMap{"error": "persona required"})
		return
	}

	chat, err := store.createChat(clientID, req.Title, req.Persona)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, jsonMap{"error": "server error"})
		return
	}
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
	chat, err := store.getChatByID(chatID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, jsonMap{"error": "server error"})
		return
	}
	if chat == nil {
		writeJSON(w, http.StatusNotFound, jsonMap{"error": "chat not found"})
		return
	}
	items, err := store.listMessages(chatID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, jsonMap{"error": "server error"})
		return
	}
	writeJSON(w, http.StatusOK, jsonMap{"items": items})
}

func handleChatSendMessage(w http.ResponseWriter, r *http.Request, chatID string) {
	start := time.Now()
	reqID := r.Header.Get("X-Request-Id")
	if reqID == "" {
		reqID = nextID("req")
	}
	var req struct {
		Content string `json:"content"`
		Persona string `json:"persona"`
	}
	if err := decodeJSON(r, &req); err != nil || strings.TrimSpace(req.Content) == "" {
		writeJSON(w, http.StatusBadRequest, jsonMap{"error": "content required"})
		return
	}

	chat, err := store.getChatByID(chatID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, jsonMap{"error": "server error"})
		return
	}
	if chat == nil {
		writeJSON(w, http.StatusNotFound, jsonMap{"error": "chat not found"})
		return
	}

	now := time.Now()
	if dup, err := store.findRecentClientDuplicate(chatID, req.Content, now, 5*time.Second); err != nil {
		writeJSON(w, http.StatusInternalServerError, jsonMap{"error": "server error"})
		return
	} else if dup != nil {
		log.Printf("chat_send dedup req_id=%s chat_id=%s latency_ms=%d", reqID, chatID, time.Since(start).Milliseconds())
		writeJSON(w, http.StatusOK, dup)
		return
	}

	msg, err := store.insertMessage(chatID, "client", req.Content, now)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, jsonMap{"error": "server error"})
		return
	}
	_ = store.updateChatUnread(chatID, chat.UnreadForAdmin+1)
	_ = store.updateChatLastMessage(chatID, msg.CreatedAt)
	if strings.TrimSpace(chat.Title) == "" {
		_ = store.updateChatTitle(chatID, firstLine(req.Content, 60))
	}

	writeJSON(w, http.StatusCreated, msg)
	log.Printf("chat_send req_id=%s chat_id=%s sender=client latency_ms=%d", reqID, chatID, time.Since(start).Milliseconds())

	persona := chat.Persona
	if strings.TrimSpace(req.Persona) != "" {
		persona = req.Persona
	}
	llmBase := os.Getenv("LLM_BASE")
	go func(chatID, persona, content, requestID string) {
		resp, status, body, err := callLLM(llmBase, chatID, persona, content)
		if err != nil || strings.TrimSpace(resp) == "" {
			log.Printf("llm_error req_id=%s chat_id=%s status=%d err=%v body=%s", requestID, chatID, status, err, body)
			resp = "Sorry, I cannot respond right now. Please try again."
		}
		if last, err := store.getLastAdminMessage(chatID); err == nil && last != nil {
			if last.Content == resp {
				return
			}
		}
		reply, err := store.insertMessage(chatID, "admin", resp, time.Now())
		if err != nil {
			log.Printf("llm_store_error req_id=%s chat_id=%s err=%v", requestID, chatID, err)
			return
		}
		_ = store.updateChatLastMessage(chatID, reply.CreatedAt)
	}(chatID, persona, req.Content, reqID)
}

func firstLine(text string, max int) string {
	line := strings.TrimSpace(strings.Split(text, "\n")[0])
	if line == "" {
		return "New chat"
	}
	if len(line) > max {
		return line[:max] + "…"
	}
	return line
}
