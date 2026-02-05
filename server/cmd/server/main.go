package main

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/mail"
	"net/http"
	"net/url"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/golang-jwt/jwt/v5"
	_ "github.com/lib/pq"
	"golang.org/x/crypto/bcrypt"
)

type jsonMap map[string]any

const (
	maxBodyBytes   = 1 << 20
	maxEmailLen    = 320
	minPasswordLen = 6
	maxPasswordLen = 128
	maxMessageLen  = 2000
	maxTitleLen    = 80
	maxPersonaLen  = 64
)

const (
	defaultAccessTTLMinutes  = 15
	defaultRefreshTTLDays    = 30
	defaultRateLimitPerMin   = 60
	maxAuthHeaderSize        = 2048
)

type ctxKey string

const ctxClientID ctxKey = "client_id"

func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}

func decodeJSON(w http.ResponseWriter, r *http.Request, dst any) error {
	r.Body = http.MaxBytesReader(w, r.Body, maxBodyBytes)
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
	store *Store

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
	normalized, err := normalizeEmail(email)
	if err != nil {
		return nil, err
	}
	var client Client
	err = s.db.QueryRow(`SELECT id, name FROM clients WHERE name=$1`, normalized).Scan(&client.ID, &client.Name)
	if err == nil {
		return &client, nil
	}
	if err != sql.ErrNoRows {
		return nil, err
	}
	id := nextID("client")
	_, err = s.db.Exec(`INSERT INTO clients (id, name) VALUES ($1, $2)`, id, normalized)
	if err != nil {
		return nil, err
	}
	return &Client{ID: id, Name: normalized}, nil
}

func (s *Store) registerUser(email, password string) (*Client, bool, error) {
	hashed, err := hashPassword(password)
	if err != nil {
		return nil, false, err
	}
	_, err = s.db.Exec(`INSERT INTO users (email, password) VALUES ($1, $2)`, email, hashed)
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
	ok, newHash, err := verifyPassword(stored, password)
	if err != nil {
		return nil, false, err
	}
	if !ok {
		return nil, false, nil
	}
	if newHash != "" {
		_, _ = s.db.Exec(`UPDATE users SET password=$1 WHERE email=$2`, newHash, email)
	}
	client, err := s.getOrCreateClientByEmail(email)
	if err != nil {
		return nil, false, err
	}
	return client, true, nil
}

func (s *Store) resetUserPassword(email, oldPassword, newPassword string) (*Client, bool, error) {
	var stored string
	if err := s.db.QueryRow(`SELECT password FROM users WHERE email=$1`, email).Scan(&stored); err != nil {
		if err == sql.ErrNoRows {
			return nil, false, nil
		}
		return nil, false, err
	}
	ok, _, err := verifyPassword(stored, oldPassword)
	if err != nil || !ok {
		return nil, false, nil
	}
	hashed, err := hashPassword(newPassword)
	if err != nil {
		return nil, false, err
	}
	if _, err := s.db.Exec(`UPDATE users SET password=$1 WHERE email=$2`, hashed, email); err != nil {
		return nil, false, err
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
	buf := make([]byte, 6)
	_, _ = rand.Read(buf)
	suffix := hex.EncodeToString(buf)
	return fmt.Sprintf("%s_%d_%s", prefix, time.Now().UnixNano(), suffix)
}

func normalizeEmail(raw string) (string, error) {
	email := strings.TrimSpace(strings.ToLower(raw))
	if email == "" || len(email) > maxEmailLen {
		return "", errors.New("invalid email")
	}
	if _, err := mail.ParseAddress(email); err != nil {
		return "", errors.New("invalid email")
	}
	return email, nil
}

func validatePassword(pw string) error {
	pw = strings.TrimSpace(pw)
	if len(pw) < minPasswordLen || len(pw) > maxPasswordLen {
		return fmt.Errorf("password length must be %d-%d", minPasswordLen, maxPasswordLen)
	}
	return nil
}

func normalizeText(raw string, maxLen int) (string, error) {
	text := strings.TrimSpace(raw)
	if text == "" {
		return "", errors.New("empty")
	}
	if len(text) > maxLen {
		return "", fmt.Errorf("too long (max %d)", maxLen)
	}
	return text, nil
}

func hashPassword(pw string) (string, error) {
	hashed, err := bcrypt.GenerateFromPassword([]byte(pw), bcrypt.DefaultCost)
	if err != nil {
		return "", err
	}
	return string(hashed), nil
}

func verifyPassword(stored, pw string) (bool, string, error) {
	trimmed := strings.TrimSpace(stored)
	switch {
	case strings.HasPrefix(trimmed, "$2a$") || strings.HasPrefix(trimmed, "$2b$") || strings.HasPrefix(trimmed, "$2y$"):
		if err := bcrypt.CompareHashAndPassword([]byte(trimmed), []byte(pw)); err != nil {
			return false, "", nil
		}
		return true, "", nil
	default:
		if trimmed != pw {
			return false, "", nil
		}
		newHash, err := hashPassword(pw)
		if err != nil {
			return true, "", nil
		}
		return true, newHash, nil
	}
}

func jwtSecret() ([]byte, error) {
	secret := strings.TrimSpace(os.Getenv("JWT_SECRET"))
	if secret == "" {
		return nil, errors.New("JWT_SECRET is required")
	}
	return []byte(secret), nil
}

func accessTTL() time.Duration {
	raw := strings.TrimSpace(os.Getenv("JWT_ACCESS_TTL_MIN"))
	if raw == "" {
		return time.Duration(defaultAccessTTLMinutes) * time.Minute
	}
	if v, err := time.ParseDuration(raw + "m"); err == nil {
		return v
	}
	return time.Duration(defaultAccessTTLMinutes) * time.Minute
}

func refreshTTL() time.Duration {
	raw := strings.TrimSpace(os.Getenv("JWT_REFRESH_TTL_DAYS"))
	if raw == "" {
		return time.Duration(defaultRefreshTTLDays) * 24 * time.Hour
	}
	if v, err := time.ParseDuration(raw + "h"); err == nil {
		return v
	}
	return time.Duration(defaultRefreshTTLDays) * 24 * time.Hour
}

func issueTokens(clientID, email string) (string, string, time.Time, time.Time, error) {
	secret, err := jwtSecret()
	if err != nil {
		return "", "", time.Time{}, time.Time{}, err
	}
	now := time.Now()
	accessExp := now.Add(accessTTL())
	refreshExp := now.Add(refreshTTL())

	accessClaims := jwt.MapClaims{
		"sub":  clientID,
		"email": email,
		"typ":  "access",
		"iat":  now.Unix(),
		"exp":  accessExp.Unix(),
	}
	refreshClaims := jwt.MapClaims{
		"sub":  clientID,
		"email": email,
		"typ":  "refresh",
		"iat":  now.Unix(),
		"exp":  refreshExp.Unix(),
	}
	accessToken, err := jwt.NewWithClaims(jwt.SigningMethodHS256, accessClaims).SignedString(secret)
	if err != nil {
		return "", "", time.Time{}, time.Time{}, err
	}
	refreshToken, err := jwt.NewWithClaims(jwt.SigningMethodHS256, refreshClaims).SignedString(secret)
	if err != nil {
		return "", "", time.Time{}, time.Time{}, err
	}
	return accessToken, refreshToken, accessExp, refreshExp, nil
}

func parseToken(tokenStr, expectedType string) (jwt.MapClaims, error) {
	secret, err := jwtSecret()
	if err != nil {
		return nil, err
	}
	parsed, err := jwt.Parse(tokenStr, func(token *jwt.Token) (any, error) {
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method")
		}
		return secret, nil
	})
	if err != nil || !parsed.Valid {
		return nil, fmt.Errorf("invalid token")
	}
	claims, ok := parsed.Claims.(jwt.MapClaims)
	if !ok {
		return nil, fmt.Errorf("invalid token")
	}
	if typ, ok := claims["typ"].(string); !ok || typ != expectedType {
		return nil, fmt.Errorf("invalid token type")
	}
	return claims, nil
}

func getClientIDFromContext(ctx context.Context) string {
	if v, ok := ctx.Value(ctxClientID).(string); ok {
		return v
	}
	return ""
}

func withCORS(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		allowed := isOriginAllowed(origin)
		if allowed {
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Vary", "Origin")
		} else if origin == "" {
			w.Header().Set("Access-Control-Allow-Origin", "*")
		}
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("X-Frame-Options", "DENY")
		w.Header().Set("Referrer-Policy", "no-referrer")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next(w, r)
	}
}

type rateEntry struct {
	Count   int
	ResetAt time.Time
}

var (
	rateMu     sync.Mutex
	rateLimits = make(map[string]*rateEntry)
)

func rateLimitPerMinute() int {
	raw := strings.TrimSpace(os.Getenv("RATE_LIMIT_PER_MIN"))
	if raw == "" {
		return defaultRateLimitPerMin
	}
	if v, err := strconv.Atoi(raw); err == nil && v > 0 {
		return v
	}
	return defaultRateLimitPerMin
}

func clientIP(r *http.Request) string {
	if xf := r.Header.Get("X-Forwarded-For"); xf != "" {
		parts := strings.Split(xf, ",")
		return strings.TrimSpace(parts[0])
	}
	if xr := r.Header.Get("X-Real-IP"); xr != "" {
		return strings.TrimSpace(xr)
	}
	host := r.RemoteAddr
	if idx := strings.LastIndex(host, ":"); idx != -1 {
		return host[:idx]
	}
	return host
}

func withRateLimit(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		key := clientIP(r)
		limit := rateLimitPerMinute()
		now := time.Now()
		rateMu.Lock()
		entry, ok := rateLimits[key]
		if !ok || now.After(entry.ResetAt) {
			entry = &rateEntry{Count: 0, ResetAt: now.Add(time.Minute)}
			rateLimits[key] = entry
		}
		entry.Count++
		remaining := limit - entry.Count
		resetIn := int(entry.ResetAt.Sub(now).Seconds())
		rateMu.Unlock()

		w.Header().Set("X-RateLimit-Limit", fmt.Sprintf("%d", limit))
		w.Header().Set("X-RateLimit-Remaining", fmt.Sprintf("%d", max(remaining, 0)))
		w.Header().Set("X-RateLimit-Reset", fmt.Sprintf("%d", resetIn))
		if entry.Count > limit {
			writeJSON(w, http.StatusTooManyRequests, jsonMap{"error": "rate_limited", "retry_after": resetIn})
			return
		}
		next(w, r)
	}
}

func isOriginAllowed(origin string) bool {
	raw := strings.TrimSpace(os.Getenv("CORS_ORIGINS"))
	if raw == "" {
		return true
	}
	parts := strings.Split(raw, ",")
	for _, p := range parts {
		if strings.TrimSpace(p) == origin {
			return true
		}
	}
	return false
}

func wrap(handler http.HandlerFunc) http.HandlerFunc {
	return withCORS(withRateLimit(handler))
}

func max(a, b int) int {
	if a > b {
		return a
	}
	return b
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

func requireClientAuth(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw := strings.TrimSpace(r.Header.Get("Authorization"))
		if len(raw) > maxAuthHeaderSize {
			writeJSON(w, http.StatusUnauthorized, jsonMap{"error": "unauthorized"})
			return
		}
		token := strings.TrimSpace(strings.TrimPrefix(raw, "Bearer"))
		if token == "" {
			writeJSON(w, http.StatusUnauthorized, jsonMap{"error": "unauthorized"})
			return
		}
		claims, err := parseToken(token, "access")
		if err != nil {
			writeJSON(w, http.StatusUnauthorized, jsonMap{"error": "unauthorized"})
			return
		}
		clientID, _ := claims["sub"].(string)
		if clientID == "" {
			writeJSON(w, http.StatusUnauthorized, jsonMap{"error": "unauthorized"})
			return
		}
		ctx := context.WithValue(r.Context(), ctxClientID, clientID)
		next(w, r.WithContext(ctx))
	}
}

type googleConfig struct {
	ClientID     string
	ClientSecret string
	CallbackURL  string
}

func handleAuthRefresh(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, jsonMap{"error": "method not allowed"})
		return
	}
	var req struct {
		RefreshToken string `json:"refresh_token"`
	}
	if err := decodeJSON(w, r, &req); err != nil {
		writeJSON(w, http.StatusBadRequest, jsonMap{"error": "invalid json"})
		return
	}
	if strings.TrimSpace(req.RefreshToken) == "" {
		writeJSON(w, http.StatusBadRequest, jsonMap{"error": "refresh token required"})
		return
	}
	claims, err := parseToken(req.RefreshToken, "refresh")
	if err != nil {
		writeJSON(w, http.StatusUnauthorized, jsonMap{"error": "invalid refresh token"})
		return
	}
	clientID, _ := claims["sub"].(string)
	email, _ := claims["email"].(string)
	if clientID == "" || email == "" {
		writeJSON(w, http.StatusUnauthorized, jsonMap{"error": "invalid refresh token"})
		return
	}
	access, refresh, accessExp, refreshExp, err := issueTokens(clientID, email)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, jsonMap{"error": "server error"})
		return
	}
	writeJSON(w, http.StatusOK, jsonMap{
		"access_token":  access,
		"refresh_token": refresh,
		"access_expires": accessExp.Format(time.RFC3339),
		"refresh_expires": refreshExp.Format(time.RFC3339),
	})
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
	mux.HandleFunc("/api/v1/auth/login", wrap(handleClientLogin))
	mux.HandleFunc("/api/v1/auth/register", wrap(handleClientRegister))
	mux.HandleFunc("/api/v1/auth/forgot-password", wrap(handleClientForgot))
	mux.HandleFunc("/api/v1/auth/reset-password", wrap(handleClientReset))
	mux.HandleFunc("/api/v1/auth/google/start", handleGoogleStart(googleCfg))
	mux.HandleFunc("/api/v1/auth/google/callback", handleGoogleCallback(googleCfg))
	mux.HandleFunc("/api/v1/auth/google/mobile", wrap(handleGoogleMobile(googleCfg)))
	mux.HandleFunc("/api/v1/auth/refresh", wrap(handleAuthRefresh))

	mux.HandleFunc("/api/v1/admin/login", wrap(handleAdminLogin))
	mux.HandleFunc("/api/v1/admin/clients", wrap(requireAdminAuth(handleAdminClients)))
	mux.HandleFunc("/api/v1/admin/chats", wrap(requireAdminAuth(handleAdminChats)))
	mux.HandleFunc("/api/v1/admin/chats/", wrap(requireAdminAuth(handleAdminChatRoutes)))

	mux.HandleFunc("/api/v1/clients/", wrap(requireClientAuth(handleClientRoutes)))
	mux.HandleFunc("/api/v1/chats/", wrap(requireClientAuth(handleChatRoutes)))

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

type googleTokenInfo struct {
	Email         string `json:"email"`
	EmailVerified string `json:"email_verified"`
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

		access, refresh, accessExp, refreshExp, err := issueTokens(client.ID, userInfo.Email)
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, jsonMap{"error": "server error"})
			return
		}

		// For web redirect, return tokens in query params (MVP).
		redirectURL, err := url.Parse(stateEntry.RedirectURL)
		if err != nil {
			writeJSON(w, http.StatusBadRequest, jsonMap{"error": "invalid redirect"})
			return
		}
		q := redirectURL.Query()
		q.Set("access_token", access)
		q.Set("refresh_token", refresh)
		q.Set("access_expires", accessExp.Format(time.RFC3339))
		q.Set("refresh_expires", refreshExp.Format(time.RFC3339))
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

func handleGoogleMobile(cfg googleConfig) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			writeJSON(w, http.StatusMethodNotAllowed, jsonMap{"error": "method not allowed"})
			return
		}
		if cfg.ClientID == "" {
			writeJSON(w, http.StatusBadRequest, jsonMap{"error": "google oauth not configured"})
			return
		}

		var payload struct {
			IDToken     string `json:"id_token"`
			AccessToken string `json:"access_token"`
		}
		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
			writeJSON(w, http.StatusBadRequest, jsonMap{"error": "invalid payload"})
			return
		}

		email := ""

		if strings.TrimSpace(payload.AccessToken) != "" {
			userInfo, err := fetchGoogleUserInfo(payload.AccessToken)
			if err == nil && userInfo.Email != "" {
				email = userInfo.Email
			}
		}

		if email == "" && strings.TrimSpace(payload.IDToken) != "" {
			info, err := fetchGoogleTokenInfo(payload.IDToken)
			if err != nil {
				writeJSON(w, http.StatusBadRequest, jsonMap{"error": "google token invalid"})
				return
			}
			email = info.Email
		}

		if email == "" {
			writeJSON(w, http.StatusBadRequest, jsonMap{"error": "email not found"})
			return
		}

		client, err := store.getOrCreateClientByEmail(email)
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, jsonMap{"error": "server error"})
			return
		}
		access, refresh, accessExp, refreshExp, err := issueTokens(client.ID, email)
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, jsonMap{"error": "server error"})
			return
		}

		writeJSON(w, http.StatusOK, jsonMap{
			"access_token":  access,
			"refresh_token": refresh,
			"access_expires": accessExp.Format(time.RFC3339),
			"refresh_expires": refreshExp.Format(time.RFC3339),
			"email":         email,
			"client_id":     client.ID,
		})
	}
}

func fetchGoogleTokenInfo(idToken string) (*googleTokenInfo, error) {
	req, err := http.NewRequest(http.MethodGet, "https://oauth2.googleapis.com/tokeninfo?id_token="+url.QueryEscape(idToken), nil)
	if err != nil {
		return nil, fmt.Errorf("tokeninfo request failed")
	}
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("tokeninfo request failed")
	}
	defer res.Body.Close()
	body, _ := io.ReadAll(res.Body)
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		return nil, fmt.Errorf("tokeninfo failed")
	}
	var info googleTokenInfo
	if err := json.Unmarshal(body, &info); err != nil {
		return nil, fmt.Errorf("tokeninfo parse failed")
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
	if err := decodeJSON(w, r, &req); err != nil {
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
	if err := decodeJSON(w, r, &req); err != nil {
		writeJSON(w, http.StatusBadRequest, jsonMap{"error": "invalid json"})
		return
	}
	email, err := normalizeEmail(req.Email)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, jsonMap{"error": "invalid email"})
		return
	}
	if err := validatePassword(req.Password); err != nil {
		writeJSON(w, http.StatusBadRequest, jsonMap{"error": err.Error()})
		return
	}
	client, ok, err := store.authenticateUser(email, req.Password)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, jsonMap{"error": "server error"})
		return
	}
	if !ok {
		writeJSON(w, http.StatusUnauthorized, jsonMap{"error": "invalid credentials"})
		return
	}
	access, refresh, accessExp, refreshExp, err := issueTokens(client.ID, email)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, jsonMap{"error": "server error"})
		return
	}
	writeJSON(w, http.StatusOK, jsonMap{
		"access_token":  access,
		"refresh_token": refresh,
		"access_expires": accessExp.Format(time.RFC3339),
		"refresh_expires": refreshExp.Format(time.RFC3339),
		"email":         email,
		"client_id":     client.ID,
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
	if err := decodeJSON(w, r, &req); err != nil {
		writeJSON(w, http.StatusBadRequest, jsonMap{"error": "invalid json"})
		return
	}
	email, err := normalizeEmail(req.Email)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, jsonMap{"error": "invalid email"})
		return
	}
	if err := validatePassword(req.Password); err != nil {
		writeJSON(w, http.StatusBadRequest, jsonMap{"error": err.Error()})
		return
	}
	client, ok, err := store.registerUser(email, req.Password)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, jsonMap{"error": "server error"})
		return
	}
	if !ok {
		writeJSON(w, http.StatusConflict, jsonMap{"error": "user already exists"})
		return
	}
	access, refresh, accessExp, refreshExp, err := issueTokens(client.ID, email)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, jsonMap{"error": "server error"})
		return
	}
	writeJSON(w, http.StatusOK, jsonMap{
		"access_token":  access,
		"refresh_token": refresh,
		"access_expires": accessExp.Format(time.RFC3339),
		"refresh_expires": refreshExp.Format(time.RFC3339),
		"email":         email,
		"client_id":     client.ID,
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
	if err := decodeJSON(w, r, &req); err != nil {
		writeJSON(w, http.StatusBadRequest, jsonMap{"error": "invalid json"})
		return
	}
	if _, err := normalizeEmail(req.Email); err != nil {
		writeJSON(w, http.StatusBadRequest, jsonMap{"error": "invalid email"})
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
	if err := decodeJSON(w, r, &req); err != nil {
		writeJSON(w, http.StatusBadRequest, jsonMap{"error": "invalid json"})
		return
	}
	email, err := normalizeEmail(req.Email)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, jsonMap{"error": "invalid email"})
		return
	}
	if err := validatePassword(req.OldPassword); err != nil {
		writeJSON(w, http.StatusBadRequest, jsonMap{"error": err.Error()})
		return
	}
	if err := validatePassword(req.NewPassword); err != nil {
		writeJSON(w, http.StatusBadRequest, jsonMap{"error": err.Error()})
		return
	}
	client, ok, err := store.resetUserPassword(email, req.OldPassword, req.NewPassword)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, jsonMap{"error": "server error"})
		return
	}
	if !ok {
		writeJSON(w, http.StatusUnauthorized, jsonMap{"error": "invalid credentials"})
		return
	}
	access, refresh, accessExp, refreshExp, err := issueTokens(client.ID, email)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, jsonMap{"error": "server error"})
		return
	}
	writeJSON(w, http.StatusOK, jsonMap{
		"access_token":  access,
		"refresh_token": refresh,
		"access_expires": accessExp.Format(time.RFC3339),
		"refresh_expires": refreshExp.Format(time.RFC3339),
		"email":         email,
		"client_id":     client.ID,
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
	if err := decodeJSON(w, r, &req); err != nil {
		writeJSON(w, http.StatusBadRequest, jsonMap{"error": "content required"})
		return
	}
	content, err := normalizeText(req.Content, maxMessageLen)
	if err != nil {
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
	msg, err := store.insertMessage(chatID, "admin", content, time.Now())
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
	if authedID := getClientIDFromContext(r.Context()); authedID != "" && authedID != clientID {
		writeJSON(w, http.StatusForbidden, jsonMap{"error": "forbidden"})
		return
	}
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
	if err := decodeJSON(w, r, &req); err != nil {
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

	persona, err := normalizeText(req.Persona, maxPersonaLen)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, jsonMap{"error": "persona required"})
		return
	}

	title := strings.TrimSpace(req.Title)
	if len(title) > maxTitleLen {
		writeJSON(w, http.StatusBadRequest, jsonMap{"error": "title too long"})
		return
	}

	chat, err := store.createChat(clientID, title, persona)
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
	authedID := getClientIDFromContext(r.Context())
	if authedID == "" {
		writeJSON(w, http.StatusForbidden, jsonMap{"error": "forbidden"})
		return
	}
	chat, err := store.getChatByID(chatID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, jsonMap{"error": "server error"})
		return
	}
	if chat == nil || chat.ClientID != authedID {
		writeJSON(w, http.StatusForbidden, jsonMap{"error": "forbidden"})
		return
	}
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
	if err := decodeJSON(w, r, &req); err != nil {
		writeJSON(w, http.StatusBadRequest, jsonMap{"error": "content required"})
		return
	}
	content, err := normalizeText(req.Content, maxMessageLen)
	if err != nil {
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
	if dup, err := store.findRecentClientDuplicate(chatID, content, now, 5*time.Second); err != nil {
		writeJSON(w, http.StatusInternalServerError, jsonMap{"error": "server error"})
		return
	} else if dup != nil {
		log.Printf("chat_send dedup req_id=%s chat_id=%s latency_ms=%d", reqID, chatID, time.Since(start).Milliseconds())
		writeJSON(w, http.StatusOK, dup)
		return
	}

	msg, err := store.insertMessage(chatID, "client", content, now)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, jsonMap{"error": "server error"})
		return
	}
	_ = store.updateChatUnread(chatID, chat.UnreadForAdmin+1)
	_ = store.updateChatLastMessage(chatID, msg.CreatedAt)
	if strings.TrimSpace(chat.Title) == "" {
		_ = store.updateChatTitle(chatID, firstLine(content, 60))
	}

	writeJSON(w, http.StatusCreated, msg)
	log.Printf("chat_send req_id=%s chat_id=%s sender=client latency_ms=%d", reqID, chatID, time.Since(start).Milliseconds())

	persona := chat.Persona
	if strings.TrimSpace(req.Persona) != "" {
		if p, err := normalizeText(req.Persona, maxPersonaLen); err == nil {
			persona = p
		}
	}
	llmBase := os.Getenv("LLM_BASE")
	go func(chatID, persona, content, requestID string) {
		resp, status, body, err := callLLM(llmBase, chatID, persona, content)
		if err != nil || strings.TrimSpace(resp) == "" {
			log.Printf("llm_error req_id=%s chat_id=%s status=%d err=%v body=%s", requestID, chatID, status, err, body)
			time.Sleep(2 * time.Second)
			resp, status, body, err = callLLM(llmBase, chatID, persona, content)
		}
		if err != nil || strings.TrimSpace(resp) == "" {
			log.Printf("llm_error_final req_id=%s chat_id=%s status=%d err=%v body=%s", requestID, chatID, status, err, body)
			resp = "LLM is busy, try later."
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
	}(chatID, persona, content, reqID)
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
