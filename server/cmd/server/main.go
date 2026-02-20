package main

import (
	"bytes"
	"context"
	"crypto/rand"
	"crypto/sha256"
	"crypto/tls"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	htmltmpl "html/template"
	"io"
	"log"
	"net"
	"net/http"
	"net/mail"
	"net/smtp"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"sync"
	texttmpl "text/template"
	"time"

	"github.com/golang-jwt/jwt/v5"
	_ "github.com/lib/pq"
	"github.com/redis/go-redis/v9"
	"golang.org/x/crypto/bcrypt"
	"nhooyr.io/websocket"
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
	defaultAccessTTLMinutes = 525600 // 365 days
	defaultRefreshTTLDays   = 365
	defaultRateLimitPerMin  = 60
	defaultAdminTTlHours    = 8
	defaultWSTTLMinutes     = 5
	maxAuthHeaderSize       = 2048
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
	CreatedAt      time.Time `json:"created_at"`
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

type llmHistoryItem struct {
	Sender  string `json:"sender"`
	Content string `json:"content"`
}

type llmMemory struct {
	Summary string   `json:"summary"`
	Topics  []string `json:"topics,omitempty"`
}

type llmTopicRef struct {
	TopicKey  string
	MessageID string
	CreatedAt time.Time
}

type llmMemoryRow struct {
	DayDate string
	Memory  llmMemory
}

type User struct {
	Email    string `json:"email"`
	Password string `json:"-"`
}

type Store struct {
	db *sql.DB
}

var (
	store         *Store
	rdb           *redis.Client
	hub           *wsHub
	hist          = newRuntimeHistoryStore()
	errChatLocked = errors.New("chat locked")
)

type runtimeHistoryStore struct {
	mu     sync.RWMutex
	byChat map[string][]llmHistoryItem
}

func newRuntimeHistoryStore() *runtimeHistoryStore {
	return &runtimeHistoryStore{byChat: make(map[string][]llmHistoryItem)}
}

func runtimeHistoryMax() int {
	raw := strings.TrimSpace(os.Getenv("LLM_RUNTIME_HISTORY_MAX"))
	if n, err := strconv.Atoi(raw); err == nil && n > 0 {
		if n > 100 {
			return 100
		}
		return n
	}
	return 24
}

func llmHistoryContextMax() int {
	raw := strings.TrimSpace(os.Getenv("LLM_HISTORY_CONTEXT_MAX"))
	if n, err := strconv.Atoi(raw); err == nil && n > 0 {
		if n > 120 {
			return 120
		}
		return n
	}
	return 60
}

func llmBusyFallback(persona string) string {
	switch strings.TrimSpace(persona) {
	case "Donald Trump":
		return "Quick break - I have to step away. Let's continue later, and we'll make it tremendous."
	case "Elon Musk":
		return "Quick break - stepping away for now. Let's continue later."
	case "Kanye West":
		return "Quick break - I need to step away now. Let's continue later and keep the vision going."
	case "Richard Nixon":
		return "I need to step away for now. We can continue this conversation later."
	case "Andrew Jackson":
		return "I need to step away now. We continue later."
	case "Marjorie Taylor Greene":
		return "Quick break - I need to step away. Let's continue later."
	case "Tucker Carlson":
		return "I need to step away for now. Let's continue this later."
	case "Lyndon B. Johnson":
		return "I need to step away now. Let's pick this up later and keep moving."
	case "Mark Zuckerberg":
		return "Quick break - stepping away for now. Let's continue later."
	case "Jeffrey Epstein":
		return "I need to step away for now. Let's continue later."
	default:
		return "I need to step away now - let's continue this conversation later."
	}
}

func deferredRetryMaxAttempts() int {
	raw := strings.TrimSpace(os.Getenv("LLM_DEFERRED_RETRY_MAX"))
	if n, err := strconv.Atoi(raw); err == nil && n > 0 {
		if n > 8 {
			return 8
		}
		return n
	}
	return 3
}

func deferredRetryDelay() time.Duration {
	raw := strings.TrimSpace(os.Getenv("LLM_DEFERRED_RETRY_DELAY_SEC"))
	if n, err := strconv.Atoi(raw); err == nil && n > 0 {
		if n > 86400 {
			n = 86400
		}
		return time.Duration(n) * time.Second
	}
	return 10 * time.Minute
}

func llmRetryPollInterval() time.Duration {
	raw := strings.TrimSpace(os.Getenv("LLM_RETRY_POLL_SEC"))
	if n, err := strconv.Atoi(raw); err == nil && n > 0 {
		if n > 300 {
			n = 300
		}
		return time.Duration(n) * time.Second
	}
	return 30 * time.Second
}

func isLLMPlaceholderResponse(content string) bool {
	c := strings.TrimSpace(content)
	if c == "" {
		return true
	}
	if c == "LLM is busy, try later." || c == "LLM request failed." {
		return true
	}
	if strings.EqualFold(c, llmBusyFallback("Donald Trump")) ||
		strings.EqualFold(c, llmBusyFallback("Elon Musk")) ||
		strings.EqualFold(c, llmBusyFallback("Kanye West")) ||
		strings.EqualFold(c, llmBusyFallback("Richard Nixon")) ||
		strings.EqualFold(c, llmBusyFallback("Andrew Jackson")) ||
		strings.EqualFold(c, llmBusyFallback("Marjorie Taylor Greene")) ||
		strings.EqualFold(c, llmBusyFallback("Tucker Carlson")) ||
		strings.EqualFold(c, llmBusyFallback("Lyndon B. Johnson")) ||
		strings.EqualFold(c, llmBusyFallback("Mark Zuckerberg")) ||
		strings.EqualFold(c, llmBusyFallback("Jeffrey Epstein")) ||
		strings.EqualFold(c, llmBusyFallback("")) {
		return true
	}
	return false
}

func (h *runtimeHistoryStore) get(chatID string, limit int) []llmHistoryItem {
	if chatID == "" {
		return nil
	}
	h.mu.RLock()
	items := h.byChat[chatID]
	h.mu.RUnlock()
	if len(items) == 0 {
		return nil
	}
	if limit <= 0 || limit > len(items) {
		limit = len(items)
	}
	start := len(items) - limit
	out := make([]llmHistoryItem, limit)
	copy(out, items[start:])
	return out
}

func (h *runtimeHistoryStore) append(chatID, sender, content string) {
	if chatID == "" {
		return
	}
	content = strings.TrimSpace(content)
	if isLLMPlaceholderResponse(content) {
		return
	}
	if sender != "client" && sender != "admin" {
		return
	}
	maxItems := runtimeHistoryMax()
	h.mu.Lock()
	defer h.mu.Unlock()
	items := append(h.byChat[chatID], llmHistoryItem{Sender: sender, Content: content})
	if len(items) > maxItems {
		items = items[len(items)-maxItems:]
	}
	h.byChat[chatID] = items
}

func (h *runtimeHistoryStore) setFromMessages(chatID string, msgs []*Message, limit int) {
	if chatID == "" {
		return
	}
	if limit <= 0 {
		limit = runtimeHistoryMax()
	}
	start := 0
	if len(msgs) > limit {
		start = len(msgs) - limit
	}
	items := make([]llmHistoryItem, 0, limit)
	for i := start; i < len(msgs); i++ {
		m := msgs[i]
		if m == nil {
			continue
		}
		content := strings.TrimSpace(m.Content)
		if isLLMPlaceholderResponse(content) {
			continue
		}
		if m.Sender != "client" && m.Sender != "admin" {
			continue
		}
		items = append(items, llmHistoryItem{Sender: m.Sender, Content: content})
	}
	h.mu.Lock()
	h.byChat[chatID] = items
	h.mu.Unlock()
}

type LLMJob struct {
	ChatID        string           `json:"chat_id"`
	Persona       string           `json:"persona"`
	PersonaPrompt string           `json:"persona_prompt,omitempty"`
	Content       string           `json:"content"`
	History       []llmHistoryItem `json:"history,omitempty"`
	RequestID     string           `json:"request_id"`
	Source        string           `json:"source,omitempty"`
	ReplaceID     string           `json:"replace_message_id,omitempty"`
	Attempts      int              `json:"attempts"`
}

type ChatEvent struct {
	Type           string   `json:"type"`
	ChatID         string   `json:"chat_id"`
	ClientID       string   `json:"client_id"`
	Message        *Message `json:"message,omitempty"`
	UnreadForAdmin int      `json:"unread_for_admin,omitempty"`
	LastMessageAt  string   `json:"last_message_at,omitempty"`
}

type wsClient struct {
	conn     *websocket.Conn
	chatID   string
	clientID string
	adminAll bool
}

type wsHub struct {
	mu       sync.RWMutex
	byChat   map[string]map[*wsClient]struct{}
	byClient map[string]map[*wsClient]struct{}
	adminAll map[*wsClient]struct{}
}

func newWSHub() *wsHub {
	return &wsHub{
		byChat:   make(map[string]map[*wsClient]struct{}),
		byClient: make(map[string]map[*wsClient]struct{}),
		adminAll: make(map[*wsClient]struct{}),
	}
}

func (h *wsHub) addClient(c *wsClient) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if c.chatID != "" {
		bucket := h.byChat[c.chatID]
		if bucket == nil {
			bucket = make(map[*wsClient]struct{})
			h.byChat[c.chatID] = bucket
		}
		bucket[c] = struct{}{}
	}
	if c.clientID != "" {
		bucket := h.byClient[c.clientID]
		if bucket == nil {
			bucket = make(map[*wsClient]struct{})
			h.byClient[c.clientID] = bucket
		}
		bucket[c] = struct{}{}
	}
	if c.adminAll {
		h.adminAll[c] = struct{}{}
	}
}

func (h *wsHub) removeClient(c *wsClient) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if c.chatID != "" {
		if bucket := h.byChat[c.chatID]; bucket != nil {
			delete(bucket, c)
			if len(bucket) == 0 {
				delete(h.byChat, c.chatID)
			}
		}
	}
	if c.clientID != "" {
		if bucket := h.byClient[c.clientID]; bucket != nil {
			delete(bucket, c)
			if len(bucket) == 0 {
				delete(h.byClient, c.clientID)
			}
		}
	}
	if c.adminAll {
		delete(h.adminAll, c)
	}
}

func (h *wsHub) broadcast(evt ChatEvent) {
	payload, err := json.Marshal(evt)
	if err != nil {
		return
	}
	h.mu.RLock()
	chatTargets := h.byChat[evt.ChatID]
	clientTargets := h.byClient[evt.ClientID]
	adminTargets := h.adminAll
	h.mu.RUnlock()

	for c := range chatTargets {
		if err := writeWS(c.conn, payload); err != nil {
			h.removeClient(c)
		}
	}
	for c := range clientTargets {
		if err := writeWS(c.conn, payload); err != nil {
			h.removeClient(c)
		}
	}
	for c := range adminTargets {
		if err := writeWS(c.conn, payload); err != nil {
			h.removeClient(c)
		}
	}
}

func writeWS(conn *websocket.Conn, payload []byte) error {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	return conn.Write(ctx, websocket.MessageText, payload)
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
		`CREATE TABLE IF NOT EXISTS password_resets (
			token_hash TEXT PRIMARY KEY,
			email TEXT NOT NULL,
			expires_at TIMESTAMPTZ NOT NULL,
			used_at TIMESTAMPTZ
		)`,
		`CREATE TABLE IF NOT EXISTS chats (
			id TEXT PRIMARY KEY,
			client_id TEXT NOT NULL REFERENCES clients(id),
			title TEXT NOT NULL DEFAULT '',
			persona TEXT NOT NULL,
			unread_for_admin INT NOT NULL DEFAULT 0,
			created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
			last_message_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
		)`,
		`ALTER TABLE chats ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ`,
		`UPDATE chats SET created_at=last_message_at WHERE created_at IS NULL`,
		`ALTER TABLE chats ALTER COLUMN created_at SET DEFAULT NOW()`,
		`ALTER TABLE chats ALTER COLUMN created_at SET NOT NULL`,
		`CREATE INDEX IF NOT EXISTS idx_chats_client_id ON chats(client_id)`,
		`CREATE INDEX IF NOT EXISTS idx_chats_created_at ON chats(created_at)`,
		`CREATE TABLE IF NOT EXISTS messages (
			id TEXT PRIMARY KEY,
			chat_id TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
			sender TEXT NOT NULL,
			content TEXT NOT NULL,
			created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
		)`,
		`CREATE INDEX IF NOT EXISTS idx_messages_chat_id ON messages(chat_id)`,
		`CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at)`,
		`CREATE TABLE IF NOT EXISTS chat_memories (
			chat_id TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
			day_date DATE NOT NULL,
			summary TEXT NOT NULL DEFAULT '',
			topics JSONB NOT NULL DEFAULT '[]'::jsonb,
			updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
			PRIMARY KEY (chat_id, day_date)
		)`,
		`CREATE INDEX IF NOT EXISTS idx_chat_memories_chat_day ON chat_memories(chat_id, day_date)`,
		`CREATE TABLE IF NOT EXISTS system_flags (
			key TEXT PRIMARY KEY,
			value TEXT NOT NULL,
			updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
		)`,
		`CREATE TABLE IF NOT EXISTS chat_topic_refs (
			chat_id TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
			topic_key TEXT NOT NULL,
			message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
			created_at TIMESTAMPTZ NOT NULL,
			PRIMARY KEY (chat_id, topic_key, message_id)
		)`,
		`CREATE INDEX IF NOT EXISTS idx_chat_topic_refs_lookup ON chat_topic_refs(chat_id, topic_key, created_at DESC)`,
		`CREATE TABLE IF NOT EXISTS llm_retry_jobs (
			request_id TEXT PRIMARY KEY,
			chat_id TEXT NOT NULL,
			run_at TIMESTAMPTZ NOT NULL,
			payload JSONB NOT NULL,
			created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
			updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
		)`,
		`CREATE INDEX IF NOT EXISTS idx_llm_retry_jobs_run_at ON llm_retry_jobs(run_at)`,
		`CREATE TABLE IF NOT EXISTS page_visits (
			page TEXT NOT NULL,
			client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
			visit_day DATE NOT NULL,
			visited_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
			PRIMARY KEY (page, client_id, visit_day)
		)`,
		`CREATE INDEX IF NOT EXISTS idx_page_visits_page_visited_at ON page_visits(page, visited_at)`,
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

func (s *Store) userExists(email string) (bool, error) {
	var exists bool
	if err := s.db.QueryRow(`SELECT EXISTS(SELECT 1 FROM users WHERE email=$1)`, email).Scan(&exists); err != nil {
		return false, err
	}
	return exists, nil
}

func (s *Store) createPasswordReset(email, tokenHash string, expiresAt time.Time) error {
	if _, err := s.db.Exec(`DELETE FROM password_resets WHERE email=$1`, email); err != nil {
		return err
	}
	_, err := s.db.Exec(`INSERT INTO password_resets (token_hash, email, expires_at) VALUES ($1, $2, $3)`, tokenHash, email, expiresAt)
	return err
}

func (s *Store) resetUserPasswordWithToken(tokenHash, newPassword string) (*Client, bool, error) {
	tx, err := s.db.Begin()
	if err != nil {
		return nil, false, err
	}
	defer tx.Rollback()

	var email string
	var expiresAt time.Time
	var usedAt sql.NullTime
	if err := tx.QueryRow(`SELECT email, expires_at, used_at FROM password_resets WHERE token_hash=$1 FOR UPDATE`, tokenHash).
		Scan(&email, &expiresAt, &usedAt); err != nil {
		if err == sql.ErrNoRows {
			return nil, false, nil
		}
		return nil, false, err
	}
	if usedAt.Valid || time.Now().After(expiresAt) {
		return nil, false, nil
	}

	hashed, err := hashPassword(newPassword)
	if err != nil {
		return nil, false, err
	}
	res, err := tx.Exec(`UPDATE users SET password=$1 WHERE email=$2`, hashed, email)
	if err != nil {
		return nil, false, err
	}
	rows, _ := res.RowsAffected()
	if rows == 0 {
		return nil, false, nil
	}
	if _, err := tx.Exec(`UPDATE password_resets SET used_at=NOW() WHERE token_hash=$1`, tokenHash); err != nil {
		return nil, false, err
	}
	if err := tx.Commit(); err != nil {
		return nil, false, err
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
	rows, err := s.db.Query(`SELECT id, client_id, title, persona, unread_for_admin, created_at, last_message_at
		FROM chats WHERE client_id=$1 ORDER BY last_message_at DESC`, clientID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]*Chat, 0)
	for rows.Next() {
		var c Chat
		if err := rows.Scan(&c.ID, &c.ClientID, &c.Title, &c.Persona, &c.UnreadForAdmin, &c.CreatedAt, &c.LastMessageAt); err != nil {
			return nil, err
		}
		out = append(out, &c)
	}
	return out, nil
}

func (s *Store) listAllChats() ([]*Chat, error) {
	rows, err := s.db.Query(`SELECT id, client_id, title, persona, unread_for_admin, created_at, last_message_at
		FROM chats ORDER BY last_message_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]*Chat, 0)
	for rows.Next() {
		var c Chat
		if err := rows.Scan(&c.ID, &c.ClientID, &c.Title, &c.Persona, &c.UnreadForAdmin, &c.CreatedAt, &c.LastMessageAt); err != nil {
			return nil, err
		}
		out = append(out, &c)
	}
	return out, nil
}

func (s *Store) getChatByID(id string) (*Chat, error) {
	var c Chat
	if err := s.db.QueryRow(`SELECT id, client_id, title, persona, unread_for_admin, created_at, last_message_at FROM chats WHERE id=$1`, id).
		Scan(&c.ID, &c.ClientID, &c.Title, &c.Persona, &c.UnreadForAdmin, &c.CreatedAt, &c.LastMessageAt); err != nil {
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
		CreatedAt:      time.Now(),
		LastMessageAt:  time.Now(),
	}
	_, err := s.db.Exec(`INSERT INTO chats (id, client_id, title, persona, unread_for_admin, created_at, last_message_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7)`, chat.ID, chat.ClientID, chat.Title, chat.Persona, chat.UnreadForAdmin, chat.CreatedAt, chat.LastMessageAt)
	if err != nil {
		return nil, err
	}
	return chat, nil
}

func (s *Store) countClients() (int64, error) {
	var total int64
	if err := s.db.QueryRow(`SELECT COUNT(*) FROM clients`).Scan(&total); err != nil {
		return 0, err
	}
	return total, nil
}

func (s *Store) countChats() (int64, error) {
	var total int64
	if err := s.db.QueryRow(`SELECT COUNT(*) FROM chats`).Scan(&total); err != nil {
		return 0, err
	}
	return total, nil
}

func (s *Store) countMessages() (int64, error) {
	var total int64
	if err := s.db.QueryRow(`SELECT COUNT(*) FROM messages`).Scan(&total); err != nil {
		return 0, err
	}
	return total, nil
}

func (s *Store) countNewClientsBetween(start, end time.Time) (int64, error) {
	var total int64
	if err := s.db.QueryRow(`SELECT COUNT(*) FROM clients WHERE created_at >= $1 AND created_at < $2`, start, end).Scan(&total); err != nil {
		return 0, err
	}
	return total, nil
}

func (s *Store) countNewChatsBetween(start, end time.Time) (int64, error) {
	var total int64
	if err := s.db.QueryRow(`SELECT COUNT(*) FROM chats WHERE created_at >= $1 AND created_at < $2`, start, end).Scan(&total); err != nil {
		return 0, err
	}
	return total, nil
}

func (s *Store) countNewMessagesBetween(start, end time.Time) (int64, error) {
	var total int64
	if err := s.db.QueryRow(`SELECT COUNT(*) FROM messages WHERE created_at >= $1 AND created_at < $2`, start, end).Scan(&total); err != nil {
		return 0, err
	}
	return total, nil
}

func (s *Store) countActiveClientsByMessagesBetween(start, end time.Time) (int64, error) {
	var total int64
	if err := s.db.QueryRow(`SELECT COUNT(DISTINCT c.client_id)
		FROM messages m
		JOIN chats c ON c.id = m.chat_id
		WHERE m.sender = 'client' AND m.created_at >= $1 AND m.created_at < $2`, start, end).Scan(&total); err != nil {
		return 0, err
	}
	return total, nil
}

func (s *Store) trackPageVisit(clientID, page string, visitedAt time.Time) error {
	clientID = strings.TrimSpace(clientID)
	page = strings.TrimSpace(strings.ToLower(page))
	if clientID == "" || page == "" {
		return fmt.Errorf("client id and page are required")
	}
	visitDay := time.Date(visitedAt.UTC().Year(), visitedAt.UTC().Month(), visitedAt.UTC().Day(), 0, 0, 0, 0, time.UTC)
	_, err := s.db.Exec(`INSERT INTO page_visits (page, client_id, visit_day, visited_at)
		VALUES ($1, $2, $3, $4)
		ON CONFLICT (page, client_id, visit_day)
		DO UPDATE SET visited_at = EXCLUDED.visited_at`, page, clientID, visitDay, visitedAt.UTC())
	return err
}

func (s *Store) countUniquePageVisitorsBetween(page string, start, end time.Time) (int64, error) {
	page = strings.TrimSpace(strings.ToLower(page))
	if page == "" {
		return 0, fmt.Errorf("page is required")
	}
	var total int64
	if err := s.db.QueryRow(`SELECT COUNT(DISTINCT client_id)
		FROM page_visits
		WHERE page=$1 AND visited_at >= $2 AND visited_at < $3`, page, start, end).Scan(&total); err != nil {
		return 0, err
	}
	return total, nil
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

func (s *Store) listMessagesTail(chatID string, limit int) ([]*Message, error) {
	if limit <= 0 {
		limit = 16
	}
	rows, err := s.db.Query(`SELECT id, chat_id, sender, content, created_at
		FROM messages
		WHERE chat_id=$1
		ORDER BY created_at DESC
		LIMIT $2`, chatID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]*Message, 0, limit)
	for rows.Next() {
		var m Message
		if err := rows.Scan(&m.ID, &m.ChatID, &m.Sender, &m.Content, &m.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, &m)
	}
	// convert DESC result to ASC for prompt chronology
	for i, j := 0, len(out)-1; i < j; i, j = i+1, j-1 {
		out[i], out[j] = out[j], out[i]
	}
	return out, nil
}

func (s *Store) listMessagesSince(chatID string, since time.Time, limit int) ([]*Message, error) {
	if limit <= 0 {
		limit = 200
	}
	rows, err := s.db.Query(`SELECT id, chat_id, sender, content, created_at
		FROM messages
		WHERE chat_id=$1 AND created_at >= $2
		ORDER BY created_at ASC
		LIMIT $3`, chatID, since, limit)
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

func (s *Store) getChatMemory(chatID string, dayDate time.Time) (*llmMemory, error) {
	var summary string
	var topicsRaw []byte
	err := s.db.QueryRow(
		`SELECT summary, topics FROM chat_memories WHERE chat_id=$1 AND day_date=$2`,
		chatID,
		dayDate.Format("2006-01-02"),
	).Scan(&summary, &topicsRaw)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	topics := []string{}
	if len(topicsRaw) > 0 {
		_ = json.Unmarshal(topicsRaw, &topics)
	}
	return &llmMemory{Summary: summary, Topics: topics}, nil
}

func (s *Store) upsertChatMemory(chatID string, dayDate time.Time, memory llmMemory) error {
	topicsJSON, err := json.Marshal(memory.Topics)
	if err != nil {
		return err
	}
	_, err = s.db.Exec(
		`INSERT INTO chat_memories (chat_id, day_date, summary, topics, updated_at)
		 VALUES ($1, $2, $3, $4::jsonb, NOW())
		 ON CONFLICT (chat_id, day_date)
		 DO UPDATE SET summary=EXCLUDED.summary, topics=EXCLUDED.topics, updated_at=NOW()`,
		chatID,
		dayDate.Format("2006-01-02"),
		memory.Summary,
		string(topicsJSON),
	)
	return err
}

func (s *Store) listChatMemoriesSince(chatID string, sinceDay time.Time, limit int) ([]llmMemoryRow, error) {
	if limit <= 0 {
		limit = 30
	}
	rows, err := s.db.Query(
		`SELECT day_date::text, summary, topics
		 FROM chat_memories
		 WHERE chat_id=$1 AND day_date >= $2
		 ORDER BY day_date DESC
		 LIMIT $3`,
		chatID,
		sinceDay.Format("2006-01-02"),
		limit,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := make([]llmMemoryRow, 0, limit)
	for rows.Next() {
		var dayDate string
		var summary string
		var topicsRaw []byte
		if err := rows.Scan(&dayDate, &summary, &topicsRaw); err != nil {
			return nil, err
		}
		topics := []string{}
		if len(topicsRaw) > 0 {
			_ = json.Unmarshal(topicsRaw, &topics)
		}
		out = append(out, llmMemoryRow{
			DayDate: dayDate,
			Memory: llmMemory{
				Summary: summary,
				Topics:  topics,
			},
		})
	}
	return out, nil
}

func (s *Store) getSystemFlag(key string) (string, bool, error) {
	var value string
	err := s.db.QueryRow(`SELECT value FROM system_flags WHERE key=$1`, key).Scan(&value)
	if err != nil {
		if err == sql.ErrNoRows {
			return "", false, nil
		}
		return "", false, err
	}
	return value, true, nil
}

func (s *Store) setSystemFlag(key, value string) error {
	_, err := s.db.Exec(
		`INSERT INTO system_flags (key, value, updated_at)
		 VALUES ($1, $2, NOW())
		 ON CONFLICT (key)
		 DO UPDATE SET value=EXCLUDED.value, updated_at=NOW()`,
		key,
		value,
	)
	return err
}

func (s *Store) upsertLLMRetryJob(job LLMJob, runAt time.Time) error {
	if strings.TrimSpace(job.RequestID) == "" || strings.TrimSpace(job.ChatID) == "" {
		return nil
	}
	payload, err := json.Marshal(job)
	if err != nil {
		return err
	}
	_, err = s.db.Exec(
		`INSERT INTO llm_retry_jobs (request_id, chat_id, run_at, payload, updated_at)
		 VALUES ($1, $2, $3, $4::jsonb, NOW())
		 ON CONFLICT (request_id)
		 DO UPDATE SET run_at=EXCLUDED.run_at, payload=EXCLUDED.payload, updated_at=NOW()`,
		job.RequestID, job.ChatID, runAt.UTC(), string(payload),
	)
	return err
}

func (s *Store) deleteLLMRetryJob(requestID string) error {
	requestID = strings.TrimSpace(requestID)
	if requestID == "" {
		return nil
	}
	_, err := s.db.Exec(`DELETE FROM llm_retry_jobs WHERE request_id=$1`, requestID)
	return err
}

func (s *Store) deleteLLMRetryJobsByChat(chatID string) error {
	chatID = strings.TrimSpace(chatID)
	if chatID == "" {
		return nil
	}
	_, err := s.db.Exec(`DELETE FROM llm_retry_jobs WHERE chat_id=$1`, chatID)
	return err
}

func (s *Store) deleteChat(chatID string) error {
	chatID = strings.TrimSpace(chatID)
	if chatID == "" {
		return nil
	}
	_, err := s.db.Exec(`DELETE FROM chats WHERE id=$1`, chatID)
	return err
}

func (s *Store) claimDueLLMRetryJobs(now time.Time, limit int) ([]LLMJob, error) {
	if limit <= 0 {
		limit = 100
	}
	tx, err := s.db.Begin()
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()

	rows, err := tx.Query(
		`WITH due AS (
			SELECT request_id, payload
			FROM llm_retry_jobs
			WHERE run_at <= $1
			ORDER BY run_at
			LIMIT $2
			FOR UPDATE SKIP LOCKED
		)
		DELETE FROM llm_retry_jobs j
		USING due
		WHERE j.request_id = due.request_id
		RETURNING due.payload`,
		now.UTC(), limit,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := make([]LLMJob, 0, limit)
	for rows.Next() {
		var payloadRaw []byte
		if err := rows.Scan(&payloadRaw); err != nil {
			return nil, err
		}
		var job LLMJob
		if err := json.Unmarshal(payloadRaw, &job); err != nil {
			continue
		}
		if strings.TrimSpace(job.RequestID) == "" || strings.TrimSpace(job.ChatID) == "" {
			continue
		}
		out = append(out, job)
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return out, nil
}

func (s *Store) upsertTopicRef(chatID, topicKey, messageID string, createdAt time.Time) error {
	if chatID == "" || topicKey == "" || messageID == "" {
		return nil
	}
	_, err := s.db.Exec(
		`INSERT INTO chat_topic_refs (chat_id, topic_key, message_id, created_at)
		 VALUES ($1, $2, $3, $4)
		 ON CONFLICT (chat_id, topic_key, message_id) DO NOTHING`,
		chatID, topicKey, messageID, createdAt,
	)
	return err
}

func (s *Store) listTopicRefs(chatID string, topicKeys []string, since time.Time, perTopic int) ([]llmTopicRef, error) {
	if len(topicKeys) == 0 {
		return nil, nil
	}
	if perTopic <= 0 {
		perTopic = 3
	}
	out := make([]llmTopicRef, 0, len(topicKeys)*perTopic)
	for _, t := range topicKeys {
		rows, err := s.db.Query(
			`SELECT topic_key, message_id, created_at
			 FROM chat_topic_refs
			 WHERE chat_id=$1 AND topic_key=$2 AND created_at >= $3
			 ORDER BY created_at DESC
			 LIMIT $4`,
			chatID, t, since, perTopic,
		)
		if err != nil {
			return nil, err
		}
		for rows.Next() {
			var item llmTopicRef
			if err := rows.Scan(&item.TopicKey, &item.MessageID, &item.CreatedAt); err != nil {
				rows.Close()
				return nil, err
			}
			out = append(out, item)
		}
		rows.Close()
	}
	sort.Slice(out, func(i, j int) bool {
		return out[i].CreatedAt.After(out[j].CreatedAt)
	})
	return out, nil
}

func memoryWindowDays() int {
	raw := strings.TrimSpace(os.Getenv("MEMORY_WINDOW_DAYS"))
	if n, err := strconv.Atoi(raw); err == nil && n > 0 {
		if n > 60 {
			return 60
		}
		return n
	}
	return 30
}

func memorySummaryMaxChars() int {
	raw := strings.TrimSpace(os.Getenv("MEMORY_SUMMARY_MAX_CHARS"))
	if n, err := strconv.Atoi(raw); err == nil && n >= 300 {
		if n > 8000 {
			return 8000
		}
		return n
	}
	return 1400
}

func memoryTopicsMax() int {
	raw := strings.TrimSpace(os.Getenv("MEMORY_TOPICS_MAX"))
	if n, err := strconv.Atoi(raw); err == nil && n > 0 {
		if n > 30 {
			return 30
		}
		return n
	}
	return 12
}

func historyCacheMaxItems() int {
	raw := strings.TrimSpace(os.Getenv("LLM_HISTORY_CACHE_MAX"))
	if n, err := strconv.Atoi(raw); err == nil && n > 0 {
		if n > 200 {
			return 200
		}
		return n
	}
	return 64
}

func historyCacheTTL() time.Duration {
	raw := strings.TrimSpace(os.Getenv("LLM_HISTORY_CACHE_TTL_MIN"))
	if n, err := strconv.Atoi(raw); err == nil && n > 0 {
		if n > 24*60 {
			n = 24 * 60
		}
		return time.Duration(n) * time.Minute
	}
	return 120 * time.Minute
}

func historyCacheKey(chatID string) string {
	return "llm:history:" + strings.TrimSpace(chatID)
}

func appendHistoryCache(chatID, sender, content string) {
	if rdb == nil || strings.TrimSpace(chatID) == "" {
		return
	}
	content = strings.TrimSpace(content)
	if isLLMPlaceholderResponse(content) {
		return
	}
	if sender != "client" && sender != "admin" {
		return
	}
	item := llmHistoryItem{Sender: sender, Content: content}
	payload, err := json.Marshal(item)
	if err != nil {
		return
	}
	key := historyCacheKey(chatID)
	maxItems := historyCacheMaxItems()
	ttl := historyCacheTTL()
	pipe := rdb.Pipeline()
	pipe.RPush(context.Background(), key, string(payload))
	pipe.LTrim(context.Background(), key, int64(-maxItems), -1)
	pipe.Expire(context.Background(), key, ttl)
	_, _ = pipe.Exec(context.Background())
}

func readHistoryCache(chatID string, limit int) []llmHistoryItem {
	if rdb == nil || strings.TrimSpace(chatID) == "" {
		return nil
	}
	if limit <= 0 {
		limit = 16
	}
	maxItems := historyCacheMaxItems()
	if limit > maxItems {
		limit = maxItems
	}
	key := historyCacheKey(chatID)
	start := int64(-limit)
	values, err := rdb.LRange(context.Background(), key, start, -1).Result()
	if err != nil || len(values) == 0 {
		return nil
	}
	out := make([]llmHistoryItem, 0, len(values))
	for _, raw := range values {
		var item llmHistoryItem
		if err := json.Unmarshal([]byte(raw), &item); err != nil {
			continue
		}
		item.Sender = strings.TrimSpace(strings.ToLower(item.Sender))
		item.Content = strings.TrimSpace(item.Content)
		if (item.Sender != "client" && item.Sender != "admin") || item.Content == "" {
			continue
		}
		out = append(out, item)
	}
	return out
}

func writeHistoryCache(chatID string, items []llmHistoryItem) {
	if rdb == nil || strings.TrimSpace(chatID) == "" {
		return
	}
	key := historyCacheKey(chatID)
	pipe := rdb.Pipeline()
	pipe.Del(context.Background(), key)
	if len(items) > 0 {
		serialized := make([]any, 0, len(items))
		for _, item := range items {
			item.Sender = strings.TrimSpace(strings.ToLower(item.Sender))
			item.Content = strings.TrimSpace(item.Content)
			if (item.Sender != "client" && item.Sender != "admin") || item.Content == "" {
				continue
			}
			raw, err := json.Marshal(item)
			if err != nil {
				continue
			}
			serialized = append(serialized, string(raw))
		}
		if len(serialized) > 0 {
			pipe.RPush(context.Background(), key, serialized...)
			pipe.LTrim(context.Background(), key, int64(-historyCacheMaxItems()), -1)
		}
	}
	pipe.Expire(context.Background(), key, historyCacheTTL())
	_, _ = pipe.Exec(context.Background())
}

func messageTopicKeys(content string, maxTopics int) []string {
	if maxTopics <= 0 {
		maxTopics = 8
	}
	stop := map[string]struct{}{
		"this": {}, "that": {}, "with": {}, "from": {}, "have": {}, "just": {}, "your": {}, "what": {}, "about": {}, "there": {},
		"were": {}, "been": {}, "they": {}, "them": {}, "then": {}, "also": {}, "into": {}, "when": {}, "will": {}, "would": {},
		"как": {}, "что": {}, "это": {}, "там": {}, "для": {}, "или": {}, "его": {}, "она": {}, "они": {}, "тут": {},
		"если": {}, "уже": {}, "надо": {}, "только": {}, "просто": {}, "тебя": {}, "меня": {}, "очень": {}, "где": {}, "когда": {},
	}
	words := regexp.MustCompile(`[a-zа-я0-9_]{4,}`).FindAllString(strings.ToLower(content), -1)
	if len(words) == 0 {
		return nil
	}
	freq := map[string]int{}
	for _, w := range words {
		if _, banned := stop[w]; banned {
			continue
		}
		freq[w]++
	}
	type kv struct {
		K string
		V int
	}
	items := make([]kv, 0, len(freq))
	for k, v := range freq {
		items = append(items, kv{K: k, V: v})
	}
	sort.Slice(items, func(i, j int) bool {
		if items[i].V == items[j].V {
			return items[i].K < items[j].K
		}
		return items[i].V > items[j].V
	})
	out := make([]string, 0, maxTopics)
	for _, it := range items {
		out = append(out, it.K)
		if len(out) >= maxTopics {
			break
		}
	}
	return out
}

func indexMessageTopicRefs(msg *Message) {
	if msg == nil {
		return
	}
	topics := messageTopicKeys(msg.Content, memoryTopicsMax())
	for _, t := range topics {
		_ = store.upsertTopicRef(msg.ChatID, t, msg.ID, msg.CreatedAt.UTC())
	}
}

func buildTopicContext(chatID, currentContent string, now time.Time) []llmHistoryItem {
	queryTopics := messageTopicKeys(currentContent, 6)
	if len(queryTopics) == 0 {
		return nil
	}
	windowDays := memoryWindowDays()
	since := now.UTC().AddDate(0, 0, -windowDays)
	refs, err := store.listTopicRefs(chatID, queryTopics, since, 2)
	if err != nil || len(refs) == 0 {
		return nil
	}
	seen := map[string]struct{}{}
	out := make([]llmHistoryItem, 0, 8)
	for _, ref := range refs {
		if len(out) >= 8 {
			break
		}
		if _, ok := seen[ref.MessageID]; ok {
			continue
		}
		seen[ref.MessageID] = struct{}{}
		msg, err := store.getMessageByID(ref.MessageID)
		if err != nil || msg == nil {
			continue
		}
		content := strings.TrimSpace(msg.Content)
		if isLLMPlaceholderResponse(content) {
			continue
		}
		out = append(out, llmHistoryItem{
			Sender:  msg.Sender,
			Content: content,
		})
	}
	return out
}

func (s *Store) getMessageByID(messageID string) (*Message, error) {
	var m Message
	err := s.db.QueryRow(`SELECT id, chat_id, sender, content, created_at FROM messages WHERE id=$1`, messageID).
		Scan(&m.ID, &m.ChatID, &m.Sender, &m.Content, &m.CreatedAt)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	return &m, nil
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

func (s *Store) updateMessageContent(messageID, content string) (*Message, error) {
	var m Message
	err := s.db.QueryRow(`UPDATE messages SET content=$1 WHERE id=$2 RETURNING id, chat_id, sender, content, created_at`, content, messageID).
		Scan(&m.ID, &m.ChatID, &m.Sender, &m.Content, &m.CreatedAt)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	return &m, nil
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

func adminUsername() string {
	return strings.TrimSpace(os.Getenv("ADMIN_USERNAME"))
}

func adminPasswordHash() string {
	return strings.TrimSpace(os.Getenv("ADMIN_PASSWORD_HASH"))
}

func adminPasswordPlain() string {
	return strings.TrimSpace(os.Getenv("ADMIN_PASSWORD"))
}

func checkAdminCredentials(username, password string) bool {
	if username == "" || password == "" {
		return false
	}
	if expected := adminUsername(); expected == "" || expected != username {
		return false
	}
	if hash := adminPasswordHash(); hash != "" {
		return bcrypt.CompareHashAndPassword([]byte(hash), []byte(password)) == nil
	}
	plain := adminPasswordPlain()
	return plain != "" && plain == password
}

func resetTokenTTL() time.Duration {
	raw := strings.TrimSpace(os.Getenv("RESET_TOKEN_TTL_MIN"))
	if raw == "" {
		return time.Hour
	}
	if v, err := strconv.Atoi(raw); err == nil && v > 0 {
		return time.Duration(v) * time.Minute
	}
	return time.Hour
}

func resetLinkBase() string {
	return strings.TrimSpace(os.Getenv("RESET_LINK_BASE"))
}

func smtpTLSMode() string {
	mode := strings.ToLower(strings.TrimSpace(os.Getenv("SMTP_TLS")))
	if mode == "ssl" || mode == "starttls" || mode == "none" {
		return mode
	}
	return "starttls"
}

func smtpTimeout() time.Duration {
	raw := strings.TrimSpace(os.Getenv("SMTP_TIMEOUT_SEC"))
	if raw == "" {
		return 10 * time.Second
	}
	if v, err := strconv.Atoi(raw); err == nil && v > 0 {
		return time.Duration(v) * time.Second
	}
	return 10 * time.Second
}

type smtpConfig struct {
	Host    string
	Port    int
	User    string
	Pass    string
	From    string
	TLSMode string
}

func smtpConfigFromEnv() (*smtpConfig, error) {
	host := strings.TrimSpace(os.Getenv("SMTP_HOST"))
	if host == "" {
		return nil, errors.New("SMTP_HOST is required")
	}
	port := 587
	if raw := strings.TrimSpace(os.Getenv("SMTP_PORT")); raw != "" {
		if v, err := strconv.Atoi(raw); err == nil && v > 0 {
			port = v
		}
	}
	user := strings.TrimSpace(os.Getenv("SMTP_USER"))
	pass := strings.TrimSpace(os.Getenv("SMTP_PASS"))
	from := strings.TrimSpace(os.Getenv("SMTP_FROM"))
	if from == "" {
		from = user
	}
	if from == "" {
		return nil, errors.New("SMTP_FROM is required")
	}
	return &smtpConfig{
		Host:    host,
		Port:    port,
		User:    user,
		Pass:    pass,
		From:    from,
		TLSMode: smtpTLSMode(),
	}, nil
}

func hashResetToken(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}

func newResetToken() (string, string, error) {
	buf := make([]byte, 32)
	if _, err := rand.Read(buf); err != nil {
		return "", "", err
	}
	token := hex.EncodeToString(buf)
	return token, hashResetToken(token), nil
}

func buildResetLink(base, token string) string {
	base = strings.TrimSpace(base)
	if base == "" {
		return ""
	}
	if strings.Contains(base, "{token}") {
		return strings.ReplaceAll(base, "{token}", url.QueryEscape(token))
	}
	if strings.HasSuffix(base, "token") {
		return base + "=" + url.QueryEscape(token)
	}
	if strings.Contains(base, "token=") {
		if strings.HasSuffix(base, "token=") {
			return base + url.QueryEscape(token)
		}
		return base
	}
	sep := "?"
	if strings.Contains(base, "?") {
		sep = "&"
	}
	return base + sep + "token=" + url.QueryEscape(token)
}

func sendResetEmail(to, link string) error {
	cfg, err := smtpConfigFromEnv()
	if err != nil {
		return err
	}
	subject := "Change Password"
	textBody, htmlBody := renderResetTemplates(link)
	if textBody == "" {
		textBody = fmt.Sprintf(
			"Your link for changing password is valid for 1 hour:\n\n%s\n\nIf you didn't request this, you can safely ignore this email.",
			link,
		)
	}
	if htmlBody != "" {
		return sendSMTPMailMultipart(cfg, to, subject, textBody, htmlBody)
	}
	return sendSMTPMail(cfg, to, subject, textBody)
}

func mailTemplateDir() string {
	return strings.TrimSpace(os.Getenv("MAIL_TEMPLATES_DIR"))
}

func renderResetTemplates(link string) (string, string) {
	base := mailTemplateDir()
	if base == "" {
		return "", ""
	}
	data := struct {
		Link string
	}{Link: link}

	var textOut string
	textPath := filepath.Join(base, "reset_password.en.txt")
	if raw, err := os.ReadFile(textPath); err == nil {
		if tmpl, err := texttmpl.New("reset_text").Parse(string(raw)); err == nil {
			var buf bytes.Buffer
			if err := tmpl.Execute(&buf, data); err == nil {
				textOut = buf.String()
			}
		}
	}

	var htmlOut string
	htmlPath := filepath.Join(base, "reset_password.en.html")
	if raw, err := os.ReadFile(htmlPath); err == nil {
		if tmpl, err := htmltmpl.New("reset_html").Parse(string(raw)); err == nil {
			var buf bytes.Buffer
			if err := tmpl.Execute(&buf, data); err == nil {
				htmlOut = buf.String()
			}
		}
	}

	return textOut, htmlOut
}

func sendSMTPMail(cfg *smtpConfig, to, subject, body string) error {
	msg := fmt.Sprintf(
		"From: %s\r\n"+
			"To: %s\r\n"+
			"Subject: %s\r\n"+
			"MIME-Version: 1.0\r\n"+
			"Content-Type: text/plain; charset=\"UTF-8\"\r\n"+
			"Content-Transfer-Encoding: 7bit\r\n\r\n"+
			"%s\r\n",
		cfg.From,
		to,
		subject,
		body,
	)
	return sendSMTPMessage(cfg, to, msg)
}

func sendSMTPMailMultipart(cfg *smtpConfig, to, subject, textBody, htmlBody string) error {
	boundary := fmt.Sprintf("alt-%d", time.Now().UnixNano())
	var msg strings.Builder
	msg.WriteString(fmt.Sprintf("From: %s\r\n", cfg.From))
	msg.WriteString(fmt.Sprintf("To: %s\r\n", to))
	msg.WriteString(fmt.Sprintf("Subject: %s\r\n", subject))
	msg.WriteString("MIME-Version: 1.0\r\n")
	msg.WriteString(fmt.Sprintf("Content-Type: multipart/alternative; boundary=\"%s\"\r\n\r\n", boundary))

	msg.WriteString(fmt.Sprintf("--%s\r\n", boundary))
	msg.WriteString("Content-Type: text/plain; charset=\"UTF-8\"\r\n")
	msg.WriteString("Content-Transfer-Encoding: 7bit\r\n\r\n")
	msg.WriteString(textBody)
	msg.WriteString("\r\n")

	msg.WriteString(fmt.Sprintf("--%s\r\n", boundary))
	msg.WriteString("Content-Type: text/html; charset=\"UTF-8\"\r\n")
	msg.WriteString("Content-Transfer-Encoding: 7bit\r\n\r\n")
	msg.WriteString(htmlBody)
	msg.WriteString("\r\n")

	msg.WriteString(fmt.Sprintf("--%s--\r\n", boundary))
	return sendSMTPMessage(cfg, to, msg.String())
}

func sendSMTPMessage(cfg *smtpConfig, to, msg string) error {
	addr := fmt.Sprintf("%s:%d", cfg.Host, cfg.Port)
	timeout := smtpTimeout()
	dialer := &net.Dialer{Timeout: timeout}
	var client *smtp.Client
	var err error
	if cfg.TLSMode == "ssl" {
		conn, err := tls.DialWithDialer(dialer, "tcp", addr, &tls.Config{ServerName: cfg.Host})
		if err != nil {
			return err
		}
		_ = conn.SetDeadline(time.Now().Add(timeout))
		client, err = smtp.NewClient(conn, cfg.Host)
		if err != nil {
			return err
		}
	} else {
		conn, err := dialer.Dial("tcp", addr)
		if err != nil {
			return err
		}
		_ = conn.SetDeadline(time.Now().Add(timeout))
		client, err = smtp.NewClient(conn, cfg.Host)
		if err != nil {
			return err
		}
	}
	defer client.Close()
	if cfg.TLSMode == "starttls" {
		if err := client.StartTLS(&tls.Config{ServerName: cfg.Host}); err != nil {
			return err
		}
	}
	if cfg.User != "" || cfg.Pass != "" {
		if err := client.Auth(smtp.PlainAuth("", cfg.User, cfg.Pass, cfg.Host)); err != nil {
			return err
		}
	}
	if err := client.Mail(cfg.From); err != nil {
		return err
	}
	if err := client.Rcpt(to); err != nil {
		return err
	}
	writer, err := client.Data()
	if err != nil {
		return err
	}
	if _, err := writer.Write([]byte(msg)); err != nil {
		_ = writer.Close()
		return err
	}
	if err := writer.Close(); err != nil {
		return err
	}
	return client.Quit()
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

func cookieSecure() bool {
	return strings.EqualFold(strings.TrimSpace(os.Getenv("COOKIE_SECURE")), "true")
}

func cookieDomain() string {
	return strings.TrimSpace(os.Getenv("COOKIE_DOMAIN"))
}

func setCookie(w http.ResponseWriter, name, value string, exp time.Time) {
	maxAge := int(time.Until(exp).Seconds())
	if maxAge < 0 {
		maxAge = 0
	}
	cookie := &http.Cookie{
		Name:     name,
		Value:    value,
		Path:     "/",
		HttpOnly: true,
		Secure:   cookieSecure(),
		SameSite: http.SameSiteLaxMode,
		MaxAge:   maxAge,
		Expires:  exp,
	}
	if domain := cookieDomain(); domain != "" {
		cookie.Domain = domain
	}
	http.SetCookie(w, cookie)
}

func clearCookieValue(w http.ResponseWriter, name string) {
	domains := []string{""}
	if configured := strings.TrimSpace(cookieDomain()); configured != "" {
		domains = append(domains, configured)
		if strings.HasPrefix(configured, ".") {
			domains = append(domains, strings.TrimPrefix(configured, "."))
		} else {
			domains = append(domains, "."+configured)
		}
	}
	seen := make(map[string]struct{}, len(domains))
	for _, domain := range domains {
		if _, ok := seen[domain]; ok {
			continue
		}
		seen[domain] = struct{}{}
		cookie := &http.Cookie{
			Name:     name,
			Value:    "",
			Path:     "/",
			HttpOnly: true,
			Secure:   cookieSecure(),
			SameSite: http.SameSiteLaxMode,
			MaxAge:   -1,
		}
		if domain != "" {
			cookie.Domain = domain
		}
		http.SetCookie(w, cookie)
	}
}

func setAuthCookies(w http.ResponseWriter, access, refresh string, accessExp, refreshExp time.Time) {
	setCookie(w, "access_token", access, accessExp)
	setCookie(w, "refresh_token", refresh, refreshExp)
}

func clearAuthCookies(w http.ResponseWriter) {
	clearCookieValue(w, "access_token")
	clearCookieValue(w, "refresh_token")
}

func setAdminCookie(w http.ResponseWriter, token string, exp time.Time) {
	setCookie(w, "admin_token", token, exp)
}

func clearAdminCookie(w http.ResponseWriter) {
	clearCookieValue(w, "admin_token")
}

func readCookieValue(r *http.Request, name string) string {
	c, err := r.Cookie(name)
	if err != nil {
		return ""
	}
	return strings.TrimSpace(c.Value)
}

func accessTTL() time.Duration {
	raw := strings.TrimSpace(os.Getenv("JWT_ACCESS_TTL_MIN"))
	if raw == "" {
		return time.Duration(defaultAccessTTLMinutes) * time.Minute
	}
	if n, err := strconv.Atoi(raw); err == nil && n > 0 {
		return time.Duration(n) * time.Minute
	}
	if v, err := time.ParseDuration(raw); err == nil {
		return v
	}
	return time.Duration(defaultAccessTTLMinutes) * time.Minute
}

func refreshTTL() time.Duration {
	raw := strings.TrimSpace(os.Getenv("JWT_REFRESH_TTL_DAYS"))
	if raw == "" {
		return time.Duration(defaultRefreshTTLDays) * 24 * time.Hour
	}
	if n, err := strconv.Atoi(raw); err == nil && n > 0 {
		return time.Duration(n) * 24 * time.Hour
	}
	if v, err := time.ParseDuration(raw); err == nil {
		return v
	}
	return time.Duration(defaultRefreshTTLDays) * 24 * time.Hour
}

func adminTokenTTL() time.Duration {
	raw := strings.TrimSpace(os.Getenv("ADMIN_TOKEN_TTL_HOURS"))
	if raw == "" {
		return time.Duration(defaultAdminTTlHours) * time.Hour
	}
	if v, err := time.ParseDuration(raw + "h"); err == nil {
		return v
	}
	return time.Duration(defaultAdminTTlHours) * time.Hour
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
		"sub":   clientID,
		"email": email,
		"typ":   "access",
		"iat":   now.Unix(),
		"exp":   accessExp.Unix(),
	}
	refreshClaims := jwt.MapClaims{
		"sub":   clientID,
		"email": email,
		"typ":   "refresh",
		"iat":   now.Unix(),
		"exp":   refreshExp.Unix(),
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

func issueAdminToken(username string) (string, time.Time, error) {
	secret, err := jwtSecret()
	if err != nil {
		return "", time.Time{}, err
	}
	now := time.Now()
	exp := now.Add(adminTokenTTL())
	claims := jwt.MapClaims{
		"sub": username,
		"typ": "admin",
		"iat": now.Unix(),
		"exp": exp.Unix(),
	}
	token, err := jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString(secret)
	if err != nil {
		return "", time.Time{}, err
	}
	return token, exp, nil
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
		if origin != "" && !allowed {
			writeJSON(w, http.StatusForbidden, jsonMap{"error": "forbidden"})
			return
		}
		if allowed {
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Vary", "Origin")
			w.Header().Set("Access-Control-Allow-Credentials", "true")
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

func trustProxy() bool {
	return strings.EqualFold(strings.TrimSpace(os.Getenv("TRUST_PROXY")), "true")
}

func clientIP(r *http.Request) string {
	if trustProxy() {
		if xf := r.Header.Get("X-Forwarded-For"); xf != "" {
			parts := strings.Split(xf, ",")
			return strings.TrimSpace(parts[0])
		}
		if xr := r.Header.Get("X-Real-IP"); xr != "" {
			return strings.TrimSpace(xr)
		}
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
		return origin == ""
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

func bearerToken(raw string) string {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return ""
	}
	if strings.HasPrefix(strings.ToLower(raw), "bearer ") {
		return strings.TrimSpace(raw[7:])
	}
	return raw
}

func clientTokenFromRequest(r *http.Request) string {
	if token := readCookieValue(r, "access_token"); token != "" {
		return token
	}
	if token := bearerToken(r.Header.Get("Authorization")); token != "" {
		return token
	}
	return ""
}

func adminTokenFromRequest(r *http.Request) string {
	if token := readCookieValue(r, "admin_token"); token != "" {
		return token
	}
	if token := bearerToken(r.Header.Get("Authorization")); token != "" {
		return token
	}
	return ""
}

func requireAdminAuth(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		token := adminTokenFromRequest(r)
		if token == "" {
			clearAdminCookie(w)
			writeJSON(w, http.StatusUnauthorized, jsonMap{"error": "unauthorized"})
			return
		}
		if _, err := parseToken(token, "admin"); err != nil {
			clearAdminCookie(w)
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
			clearAuthCookies(w)
			writeJSON(w, http.StatusUnauthorized, jsonMap{"error": "unauthorized"})
			return
		}
		token := clientTokenFromRequest(r)
		if token == "" {
			clearAuthCookies(w)
			writeJSON(w, http.StatusUnauthorized, jsonMap{"error": "unauthorized"})
			return
		}
		claims, err := parseToken(token, "access")
		if err != nil {
			clearAuthCookies(w)
			writeJSON(w, http.StatusUnauthorized, jsonMap{"error": "unauthorized"})
			return
		}
		clientID, _ := claims["sub"].(string)
		if clientID == "" {
			clearAuthCookies(w)
			writeJSON(w, http.StatusUnauthorized, jsonMap{"error": "unauthorized"})
			return
		}
		ctx := context.WithValue(r.Context(), ctxClientID, clientID)
		next(w, r.WithContext(ctx))
	}
}

func redisURL() string {
	return strings.TrimSpace(os.Getenv("REDIS_URL"))
}

func llmStreamName() string {
	if v := strings.TrimSpace(os.Getenv("LLM_QUEUE_STREAM")); v != "" {
		return v
	}
	return "llm_jobs"
}

func llmGroupName() string {
	if v := strings.TrimSpace(os.Getenv("LLM_QUEUE_GROUP")); v != "" {
		return v
	}
	return "llm_workers"
}

func eventChannelName() string {
	if v := strings.TrimSpace(os.Getenv("CHAT_EVENT_CHANNEL")); v != "" {
		return v
	}
	return "chat_events"
}

func initRedis() (*redis.Client, error) {
	url := redisURL()
	if url == "" {
		return nil, nil
	}
	opts, err := redis.ParseURL(url)
	if err != nil {
		return nil, err
	}
	client := redis.NewClient(opts)
	if err := client.Ping(context.Background()).Err(); err != nil {
		return nil, err
	}
	return client, nil
}

func publishEvent(evt ChatEvent) {
	if hub == nil {
		return
	}
	if rdb == nil {
		hub.broadcast(evt)
		return
	}
	payload, err := json.Marshal(evt)
	if err != nil {
		return
	}
	_ = rdb.Publish(context.Background(), eventChannelName(), payload).Err()
}

func startEventSubscriber(ctx context.Context) {
	if rdb == nil || hub == nil {
		return
	}
	pubsub := rdb.Subscribe(ctx, eventChannelName())
	go func() {
		defer pubsub.Close()
		ch := pubsub.Channel()
		for {
			select {
			case msg, ok := <-ch:
				if !ok {
					return
				}
				var evt ChatEvent
				if err := json.Unmarshal([]byte(msg.Payload), &evt); err != nil {
					continue
				}
				hub.broadcast(evt)
			case <-ctx.Done():
				return
			}
		}
	}()
}

func enqueueLLMJob(job LLMJob) error {
	if rdb == nil {
		return fmt.Errorf("redis not configured")
	}
	payload, err := json.Marshal(job)
	if err != nil {
		return err
	}
	return rdb.XAdd(context.Background(), &redis.XAddArgs{
		Stream: llmStreamName(),
		Values: map[string]any{"job": string(payload)},
	}).Err()
}

func chatLockTTL() time.Duration {
	raw := strings.TrimSpace(os.Getenv("LLM_CHAT_LOCK_TTL_SEC"))
	if n, err := strconv.Atoi(raw); err == nil && n > 0 {
		if n > 600 {
			n = 600
		}
		return time.Duration(n) * time.Second
	}
	return 120 * time.Second
}

func chatLockKey(chatID string) string {
	return "llm:chat_lock:" + strings.TrimSpace(chatID)
}

func acquireChatLock(ctx context.Context, chatID string) (string, bool, error) {
	if rdb == nil || strings.TrimSpace(chatID) == "" {
		return "", true, nil
	}
	token := nextID("lock")
	ok, err := rdb.SetNX(ctx, chatLockKey(chatID), token, chatLockTTL()).Result()
	if err != nil {
		return "", false, err
	}
	return token, ok, nil
}

func releaseChatLock(ctx context.Context, chatID, token string) {
	if rdb == nil || strings.TrimSpace(chatID) == "" || strings.TrimSpace(token) == "" {
		return
	}
	const releaseScript = `
if redis.call("GET", KEYS[1]) == ARGV[1] then
	return redis.call("DEL", KEYS[1])
end
return 0
`
	_ = rdb.Eval(ctx, releaseScript, []string{chatLockKey(chatID)}, token).Err()
}

func processLLMJob(job LLMJob) error {
	log.Printf("llm_job_start req_id=%s chat_id=%s source=%s attempts=%d replace_id=%s", job.RequestID, job.ChatID, job.Source, job.Attempts, job.ReplaceID)
	ctx := context.Background()
	lockToken, locked, err := acquireChatLock(ctx, job.ChatID)
	if err != nil {
		log.Printf("llm_job_lock_error req_id=%s chat_id=%s err=%v", job.RequestID, job.ChatID, err)
		return err
	}
	if !locked {
		log.Printf("llm_job_locked req_id=%s chat_id=%s", job.RequestID, job.ChatID)
		return errChatLocked
	}
	if lockToken != "" {
		defer releaseChatLock(ctx, job.ChatID, lockToken)
	}

	chat, err := store.getChatByID(job.ChatID)
	if err != nil {
		log.Printf("llm_job_chat_lookup_error req_id=%s chat_id=%s err=%v", job.RequestID, job.ChatID, err)
		return err
	}
	if chat == nil {
		log.Printf("llm_job_chat_missing req_id=%s chat_id=%s", job.RequestID, job.ChatID)
		return fmt.Errorf("chat not found")
	}

	history := job.History
	if len(history) == 0 {
		history = buildLLMHistory(job.ChatID, llmHistoryContextMax())
	}
	topicContext := buildTopicContext(job.ChatID, job.Content, time.Now().UTC())
	memory := getOrBuildRollingMemory(job.ChatID, time.Now().UTC())
	isRetriableLLMFailure := func(status int, callErr error) bool {
		if status == 408 || status == 425 || status == 429 {
			return true
		}
		if status >= 500 {
			return true
		}
		if status == 0 && callErr != nil {
			// Transport-level/network errors where no upstream HTTP status is available.
			return true
		}
		return false
	}

	callOnce := func() (string, int, string, error, bool) {
		llmBase := os.Getenv("LLM_BASE")
		log.Printf("llm_job_call_llm req_id=%s chat_id=%s source=%s", job.RequestID, job.ChatID, job.Source)
		resp, status, body, err := callLLM(llmBase, job.ChatID, job.Persona, job.PersonaPrompt, job.Content, history, topicContext, memory)
		failed := err != nil || strings.TrimSpace(resp) == ""
		retriable := isRetriableLLMFailure(status, err)
		if failed {
			log.Printf("llm_error req_id=%s chat_id=%s status=%d err=%v body=%s", job.RequestID, job.ChatID, status, err, body)
			if retriable {
				time.Sleep(2 * time.Second)
				resp, status, body, err = callLLM(llmBase, job.ChatID, job.Persona, job.PersonaPrompt, job.Content, history, topicContext, memory)
			}
		}
		if err != nil || strings.TrimSpace(resp) == "" {
			log.Printf("llm_error_final req_id=%s chat_id=%s status=%d err=%v body=%s", job.RequestID, job.ChatID, status, err, body)
			if isRetriableLLMFailure(status, err) {
				resp = llmBusyFallback(job.Persona)
				return resp, status, body, err, true
			}
			resp = "LLM request failed."
			return resp, status, body, err, false
		}
		log.Printf("llm_job_llm_ok req_id=%s chat_id=%s status=%d resp_len=%d", job.RequestID, job.ChatID, status, len(strings.TrimSpace(resp)))
		return resp, status, body, err, false
	}

	resp, _, _, _, retriableFailure := callOnce()
	if retriableFailure {
		switch job.Source {
		case "client_send":
			if strings.TrimSpace(job.ReplaceID) == "" {
				placeholderText := llmBusyFallback(job.Persona)
				log.Printf("llm_job_placeholder_insert req_id=%s chat_id=%s", job.RequestID, job.ChatID)
				placeholder, err := store.insertMessage(job.ChatID, "admin", placeholderText, time.Now())
				if err == nil && placeholder != nil {
					hist.append(job.ChatID, "admin", placeholder.Content)
					appendHistoryCache(job.ChatID, "admin", placeholder.Content)
					_ = store.updateChatLastMessage(job.ChatID, placeholder.CreatedAt)
					publishEvent(ChatEvent{
						Type:           "message_created",
						ChatID:         job.ChatID,
						ClientID:       chat.ClientID,
						Message:        placeholder,
						UnreadForAdmin: chat.UnreadForAdmin,
						LastMessageAt:  placeholder.CreatedAt.Format(time.RFC3339),
					})
					next := job
					next.Source = "deferred_retry"
					next.ReplaceID = placeholder.ID
					next.Attempts++
					if next.Attempts <= deferredRetryMaxAttempts() {
						runAt := time.Now().Add(deferredRetryDelay())
						if err := store.upsertLLMRetryJob(next, runAt); err != nil {
							log.Printf("llm_job_deferred_retry_persist_error req_id=%s chat_id=%s err=%v", job.RequestID, job.ChatID, err)
						} else {
							log.Printf("llm_job_deferred_retry_persisted req_id=%s chat_id=%s next_attempt=%d run_at=%s", job.RequestID, job.ChatID, next.Attempts, runAt.UTC().Format(time.RFC3339))
						}
					}
				}
				return nil
			}
		case "deferred_retry":
			next := job
			next.Attempts++
			if next.Attempts <= deferredRetryMaxAttempts() {
				runAt := time.Now().Add(deferredRetryDelay())
				if err := store.upsertLLMRetryJob(next, runAt); err != nil {
					log.Printf("llm_job_deferred_retry_persist_error req_id=%s chat_id=%s err=%v", job.RequestID, job.ChatID, err)
				} else {
					log.Printf("llm_job_deferred_retry_requeued req_id=%s chat_id=%s next_attempt=%d run_at=%s", job.RequestID, job.ChatID, next.Attempts, runAt.UTC().Format(time.RFC3339))
				}
			}
			return nil
		}
	}

	// Admin resend should make a real retry cycle, not silently keep the previous busy result.
	if job.Source == "admin_resend" && retriableFailure {
		for i := 0; i < 2 && retriableFailure; i++ {
			time.Sleep(2 * time.Second)
			resp, _, _, _, retriableFailure = callOnce()
			if !retriableFailure {
				break
			}
		}
	}
	if job.Source == "deferred_retry" && strings.TrimSpace(resp) != "" {
		asked := firstLine(strings.TrimSpace(job.Content), 140)
		resp = fmt.Sprintf("You asked: \"%s\" Earlier I had to step away. %s", asked, resp)
	}
	if err := store.deleteLLMRetryJob(job.RequestID); err != nil {
		log.Printf("llm_job_retry_delete_error req_id=%s chat_id=%s err=%v", job.RequestID, job.ChatID, err)
	}

	if last, err := store.getLastAdminMessage(job.ChatID); err == nil && last != nil {
		// Deduplicate only for near-immediate repeated writes from retries, not for legitimate new turns.
		if job.Source != "admin_resend" && last.Content == resp {
			if time.Since(last.CreatedAt) < 15*time.Second {
				if tail, tailErr := store.listMessagesTail(job.ChatID, 1); tailErr == nil && len(tail) == 1 && tail[0] != nil && tail[0].Sender == "admin" && tail[0].ID == last.ID {
					log.Printf("llm_job_dedup_skip req_id=%s chat_id=%s last_admin_id=%s age_ms=%d", job.RequestID, job.ChatID, last.ID, time.Since(last.CreatedAt).Milliseconds())
					return nil
				}
			}
		}
	}

	if job.ReplaceID != "" {
		log.Printf("llm_job_db_update req_id=%s chat_id=%s replace_id=%s", job.RequestID, job.ChatID, job.ReplaceID)
		updated, err := store.updateMessageContent(job.ReplaceID, resp)
		if err != nil {
			log.Printf("llm_job_db_update_error req_id=%s chat_id=%s replace_id=%s err=%v", job.RequestID, job.ChatID, job.ReplaceID, err)
			return err
		}
		if updated != nil {
			hist.append(job.ChatID, "admin", updated.Content)
			appendHistoryCache(job.ChatID, "admin", updated.Content)
			indexMessageTopicRefs(updated)
			publishEvent(ChatEvent{
				Type:           "message_updated",
				ChatID:         job.ChatID,
				ClientID:       chat.ClientID,
				Message:        updated,
				UnreadForAdmin: chat.UnreadForAdmin,
			})
			log.Printf("llm_job_publish_updated req_id=%s chat_id=%s message_id=%s", job.RequestID, job.ChatID, updated.ID)
			return nil
		}
	}

	log.Printf("llm_job_db_insert req_id=%s chat_id=%s", job.RequestID, job.ChatID)
	reply, err := store.insertMessage(job.ChatID, "admin", resp, time.Now())
	if err != nil {
		log.Printf("llm_job_db_insert_error req_id=%s chat_id=%s err=%v", job.RequestID, job.ChatID, err)
		return err
	}
	hist.append(job.ChatID, "admin", reply.Content)
	appendHistoryCache(job.ChatID, "admin", reply.Content)
	indexMessageTopicRefs(reply)
	_ = store.updateChatLastMessage(job.ChatID, reply.CreatedAt)
	updatedChat, err := store.getChatByID(job.ChatID)
	if err == nil && updatedChat != nil {
		chat = updatedChat
	}
	publishEvent(ChatEvent{
		Type:           "message_created",
		ChatID:         job.ChatID,
		ClientID:       chat.ClientID,
		Message:        reply,
		UnreadForAdmin: chat.UnreadForAdmin,
		LastMessageAt:  reply.CreatedAt.Format(time.RFC3339),
	})
	log.Printf("llm_job_publish_created req_id=%s chat_id=%s message_id=%s", job.RequestID, job.ChatID, reply.ID)
	return nil
}

func buildLLMHistory(chatID string, limit int) []llmHistoryItem {
	if limit <= 0 {
		limit = llmHistoryContextMax()
	}
	if cached := readHistoryCache(chatID, limit); len(cached) > 0 {
		return cached
	}
	// Important: worker/api are different processes, so RAM cache can be stale.
	// Always refresh from DB tail for correctness, then mirror to local runtime cache.
	msgs, err := store.listMessagesTail(chatID, max(limit*3, 48))
	if err != nil || len(msgs) == 0 {
		return hist.get(chatID, limit)
	}
	hist.setFromMessages(chatID, msgs, runtimeHistoryMax())
	out := make([]llmHistoryItem, 0, limit)
	start := 0
	if len(msgs) > limit {
		start = len(msgs) - limit
	}
	for i := start; i < len(msgs); i++ {
		m := msgs[i]
		if m == nil {
			continue
		}
		content := strings.TrimSpace(m.Content)
		if isLLMPlaceholderResponse(content) {
			continue
		}
		out = append(out, llmHistoryItem{
			Sender:  m.Sender,
			Content: content,
		})
	}
	writeHistoryCache(chatID, out)
	return out
}

func buildHistoryFromMessages(messages []*Message, limit int) []llmHistoryItem {
	if limit <= 0 {
		limit = llmHistoryContextMax()
	}
	out := make([]llmHistoryItem, 0, limit)
	start := 0
	if len(messages) > limit {
		start = len(messages) - limit
	}
	for i := start; i < len(messages); i++ {
		m := messages[i]
		if m == nil {
			continue
		}
		content := strings.TrimSpace(m.Content)
		if content == "" || isLLMPlaceholderResponse(content) {
			continue
		}
		if m.Sender != "client" && m.Sender != "admin" {
			continue
		}
		out = append(out, llmHistoryItem{Sender: m.Sender, Content: content})
	}
	return out
}

func buildHistoryUntilMessage(chatID, messageID string, limit int) []llmHistoryItem {
	if strings.TrimSpace(chatID) == "" || strings.TrimSpace(messageID) == "" {
		return nil
	}
	msgs, err := store.listMessages(chatID)
	if err != nil || len(msgs) == 0 {
		return nil
	}
	idx := -1
	for i, m := range msgs {
		if m != nil && m.ID == messageID {
			idx = i
			break
		}
	}
	if idx < 0 {
		return nil
	}
	return buildHistoryFromMessages(msgs[:idx+1], limit)
}

func extractTopTopicsFromMessages(msgs []*Message, maxTopics int) []string {
	if maxTopics <= 0 {
		maxTopics = 8
	}
	stop := map[string]struct{}{
		"this": {}, "that": {}, "with": {}, "from": {}, "have": {}, "just": {}, "your": {}, "what": {}, "about": {}, "there": {},
		"were": {}, "been": {}, "they": {}, "them": {}, "then": {}, "also": {}, "into": {}, "when": {}, "will": {}, "would": {},
		"как": {}, "что": {}, "это": {}, "там": {}, "для": {}, "или": {}, "его": {}, "она": {}, "они": {}, "тут": {},
		"если": {}, "уже": {}, "надо": {}, "только": {}, "просто": {}, "тебя": {}, "меня": {}, "очень": {}, "где": {}, "когда": {},
	}
	freq := map[string]int{}
	for _, m := range msgs {
		if m == nil {
			continue
		}
		text := strings.ToLower(m.Content)
		words := regexp.MustCompile(`[a-zа-я0-9_]{4,}`).FindAllString(text, -1)
		for _, w := range words {
			if _, banned := stop[w]; banned {
				continue
			}
			freq[w]++
		}
	}
	if len(freq) == 0 {
		return nil
	}
	type kv struct {
		K string
		V int
	}
	items := make([]kv, 0, len(freq))
	for k, v := range freq {
		items = append(items, kv{K: k, V: v})
	}
	sort.Slice(items, func(i, j int) bool {
		if items[i].V == items[j].V {
			return items[i].K < items[j].K
		}
		return items[i].V > items[j].V
	})
	out := make([]string, 0, maxTopics)
	for _, it := range items {
		out = append(out, it.K)
		if len(out) >= maxTopics {
			break
		}
	}
	return out
}

func buildDailyMemory(chatID string, now time.Time) llmMemory {
	startOfDay := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC)
	msgs, err := store.listMessagesSince(chatID, startOfDay, 240)
	if err != nil || len(msgs) == 0 {
		return llmMemory{}
	}
	return buildMemoryFromMessages(msgs)
}

func buildMemoryFromMessages(msgs []*Message) llmMemory {
	if len(msgs) == 0 {
		return llmMemory{}
	}
	clientTurns := 0
	adminTurns := 0
	lastClient := ""
	lastAdmin := ""
	for _, m := range msgs {
		if m == nil {
			continue
		}
		content := strings.TrimSpace(m.Content)
		if isLLMPlaceholderResponse(content) {
			continue
		}
		if m.Sender == "client" {
			clientTurns++
			lastClient = content
		} else if m.Sender == "admin" {
			adminTurns++
			lastAdmin = content
		}
	}
	topics := extractTopTopicsFromMessages(msgs, 8)

	summaryParts := []string{
		fmt.Sprintf("Today in this chat: user turns %d, assistant turns %d.", clientTurns, adminTurns),
	}
	if len(topics) > 0 {
		summaryParts = append(summaryParts, fmt.Sprintf("Main topics: %s.", strings.Join(topics, ", ")))
	}
	if lastClient != "" {
		summaryParts = append(summaryParts, fmt.Sprintf("Latest user point: %s", firstLine(lastClient, 140)))
	}
	if lastAdmin != "" {
		summaryParts = append(summaryParts, fmt.Sprintf("Latest assistant point: %s", firstLine(lastAdmin, 140)))
	}

	summary := strings.Join(summaryParts, " ")
	return llmMemory{
		Summary: summary,
		Topics:  topics,
	}
}

func getOrBuildDailyMemory(chatID string, now time.Time) llmMemory {
	day := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC)
	if existing, err := store.getChatMemory(chatID, day); err == nil && existing != nil {
		return *existing
	}
	mem := buildDailyMemory(chatID, now)
	if mem.Summary != "" || len(mem.Topics) > 0 {
		_ = store.upsertChatMemory(chatID, day, mem)
	}
	return mem
}

func trimMemorySummary(summary string, maxChars int) string {
	s := strings.TrimSpace(summary)
	if maxChars <= 0 || len(s) <= maxChars {
		return s
	}
	if maxChars <= 3 {
		return s[:maxChars]
	}
	return strings.TrimSpace(s[:maxChars-3]) + "..."
}

func composeRollingMemory(rows []llmMemoryRow, summaryLimit int, topicsLimit int) llmMemory {
	if len(rows) == 0 {
		return llmMemory{}
	}
	summaryParts := make([]string, 0, len(rows))
	topicFreq := map[string]int{}
	for _, row := range rows {
		summary := strings.TrimSpace(row.Memory.Summary)
		if summary != "" {
			summaryParts = append(summaryParts, fmt.Sprintf("%s: %s", row.DayDate, summary))
		}
		for _, t := range row.Memory.Topics {
			tt := strings.TrimSpace(strings.ToLower(t))
			if tt == "" {
				continue
			}
			topicFreq[tt]++
		}
	}
	combined := trimMemorySummary(strings.Join(summaryParts, " "), summaryLimit)
	type kv struct {
		K string
		V int
	}
	items := make([]kv, 0, len(topicFreq))
	for k, v := range topicFreq {
		items = append(items, kv{K: k, V: v})
	}
	sort.Slice(items, func(i, j int) bool {
		if items[i].V == items[j].V {
			return items[i].K < items[j].K
		}
		return items[i].V > items[j].V
	})
	topics := make([]string, 0, topicsLimit)
	for _, it := range items {
		topics = append(topics, it.K)
		if len(topics) >= topicsLimit {
			break
		}
	}
	return llmMemory{
		Summary: combined,
		Topics:  topics,
	}
}

func getOrBuildRollingMemory(chatID string, now time.Time) llmMemory {
	_ = getOrBuildDailyMemory(chatID, now)
	windowDays := memoryWindowDays()
	since := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC).AddDate(0, 0, -(windowDays - 1))
	rows, err := store.listChatMemoriesSince(chatID, since, windowDays)
	if err != nil || len(rows) == 0 {
		return getOrBuildDailyMemory(chatID, now)
	}
	return composeRollingMemory(rows, memorySummaryMaxChars(), memoryTopicsMax())
}

func backfillTopicRefs() int {
	chats, err := store.listAllChats()
	if err != nil {
		log.Printf("topic_ref_backfill_error stage=list_chats err=%v", err)
		return 0
	}
	updated := 0
	for _, chat := range chats {
		if chat == nil || strings.TrimSpace(chat.ID) == "" {
			continue
		}
		msgs, err := store.listMessages(chat.ID)
		if err != nil {
			log.Printf("topic_ref_backfill_error chat_id=%s stage=list_messages err=%v", chat.ID, err)
			continue
		}
		if len(msgs) == 0 {
			continue
		}
		for _, m := range msgs {
			if m == nil {
				continue
			}
			topics := messageTopicKeys(m.Content, memoryTopicsMax())
			for _, t := range topics {
				if err := store.upsertTopicRef(chat.ID, t, m.ID, m.CreatedAt.UTC()); err != nil {
					log.Printf("topic_ref_backfill_error chat_id=%s message_id=%s topic=%s err=%v", chat.ID, m.ID, t, err)
					continue
				}
				updated++
			}
		}
	}
	log.Printf("topic_ref_backfill_done chats=%d refs=%d", len(chats), updated)
	return updated
}

func backfillChatMemories() int {
	chats, err := store.listAllChats()
	if err != nil {
		log.Printf("memory_backfill_error stage=list_chats err=%v", err)
		return 0
	}
	updated := 0
	for _, chat := range chats {
		if chat == nil || strings.TrimSpace(chat.ID) == "" {
			continue
		}
		msgs, err := store.listMessages(chat.ID)
		if err != nil {
			log.Printf("memory_backfill_error chat_id=%s stage=list_messages err=%v", chat.ID, err)
			continue
		}
		if len(msgs) == 0 {
			continue
		}
		byDay := map[string][]*Message{}
		for _, m := range msgs {
			if m == nil {
				continue
			}
			day := m.CreatedAt.UTC().Format("2006-01-02")
			byDay[day] = append(byDay[day], m)
		}
		for day, dayMsgs := range byDay {
			parsedDay, err := time.ParseInLocation("2006-01-02", day, time.UTC)
			if err != nil {
				continue
			}
			mem := buildMemoryFromMessages(dayMsgs)
			if mem.Summary == "" && len(mem.Topics) == 0 {
				continue
			}
			if err := store.upsertChatMemory(chat.ID, parsedDay, mem); err != nil {
				log.Printf("memory_backfill_error chat_id=%s day=%s stage=upsert err=%v", chat.ID, day, err)
				continue
			}
			updated++
		}
	}
	log.Printf("memory_backfill_done chats=%d entries=%d", len(chats), updated)
	return updated
}

func dispatchDueLLMRetryJobs() {
	if store == nil {
		return
	}
	jobs, err := store.claimDueLLMRetryJobs(time.Now(), 100)
	if err != nil {
		log.Printf("llm_retry_claim_error err=%v", err)
		return
	}
	for _, job := range jobs {
		job.Source = "deferred_retry"
		if strings.TrimSpace(job.RequestID) == "" {
			job.RequestID = nextID("retry")
		}
		if err := enqueueLLMJob(job); err != nil {
			runAt := time.Now().Add(2 * time.Minute)
			_ = store.upsertLLMRetryJob(job, runAt)
			log.Printf("llm_retry_enqueue_error req_id=%s chat_id=%s err=%v", job.RequestID, job.ChatID, err)
			continue
		}
		log.Printf("llm_retry_enqueued req_id=%s chat_id=%s", job.RequestID, job.ChatID)
	}
}

func runWorker(ctx context.Context) error {
	if rdb == nil {
		return fmt.Errorf("redis not configured")
	}
	go func() {
		dispatchDueLLMRetryJobs()
		ticker := time.NewTicker(llmRetryPollInterval())
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				dispatchDueLLMRetryJobs()
			}
		}
	}()
	group := llmGroupName()
	stream := llmStreamName()
	consumer := fmt.Sprintf("worker-%s", nextID("c"))
	if err := rdb.XGroupCreateMkStream(ctx, stream, group, "$").Err(); err != nil {
		if !strings.Contains(err.Error(), "BUSYGROUP") {
			return err
		}
	}
	for {
		res, err := rdb.XReadGroup(ctx, &redis.XReadGroupArgs{
			Group:    group,
			Consumer: consumer,
			Streams:  []string{stream, ">"},
			Count:    1,
			Block:    5 * time.Second,
		}).Result()
		if err != nil {
			if errors.Is(err, context.Canceled) {
				return nil
			}
			continue
		}
		for _, streamRes := range res {
			for _, msg := range streamRes.Messages {
				payload, _ := msg.Values["job"].(string)
				var job LLMJob
				if err := json.Unmarshal([]byte(payload), &job); err != nil {
					_ = rdb.XAck(ctx, stream, group, msg.ID).Err()
					continue
				}
				if err := processLLMJob(job); err != nil {
					if errors.Is(err, errChatLocked) {
						time.Sleep(150 * time.Millisecond)
						_ = enqueueLLMJob(job)
						_ = rdb.XAck(ctx, stream, group, msg.ID).Err()
						continue
					}
					job.Attempts++
					if job.Attempts <= 3 {
						_ = enqueueLLMJob(job)
					}
				}
				_ = rdb.XAck(ctx, stream, group, msg.ID).Err()
			}
		}
	}
}

func handleWS(w http.ResponseWriter, r *http.Request) {
	origin := r.Header.Get("Origin")
	if origin != "" && !isOriginAllowed(origin) {
		writeJSON(w, http.StatusForbidden, jsonMap{"error": "forbidden"})
		return
	}
	if hub == nil {
		writeJSON(w, http.StatusServiceUnavailable, jsonMap{"error": "ws_not_ready"})
		return
	}
	chatID := strings.TrimSpace(r.URL.Query().Get("chat_id"))
	scope := strings.TrimSpace(r.URL.Query().Get("scope"))

	isAdmin := false
	clientID := ""
	if adminToken := adminTokenFromRequest(r); adminToken != "" {
		if _, err := parseToken(adminToken, "admin"); err == nil {
			isAdmin = true
		}
	}
	if !isAdmin {
		token := clientTokenFromRequest(r)
		if token == "" {
			clearAuthCookies(w)
			writeJSON(w, http.StatusUnauthorized, jsonMap{"error": "unauthorized"})
			return
		}
		claims, err := parseToken(token, "access")
		if err != nil {
			clearAuthCookies(w)
			writeJSON(w, http.StatusUnauthorized, jsonMap{"error": "unauthorized"})
			return
		}
		clientID, _ = claims["sub"].(string)
		if clientID == "" {
			clearAuthCookies(w)
			writeJSON(w, http.StatusUnauthorized, jsonMap{"error": "unauthorized"})
			return
		}
	}

	if isAdmin {
		if scope != "all" && chatID == "" {
			writeJSON(w, http.StatusBadRequest, jsonMap{"error": "chat_id required"})
			return
		}
	} else {
		if scope == "client" {
			// ok
		} else if chatID == "" {
			writeJSON(w, http.StatusBadRequest, jsonMap{"error": "chat_id required"})
			return
		} else {
			chat, err := store.getChatByID(chatID)
			if err != nil {
				writeJSON(w, http.StatusInternalServerError, jsonMap{"error": "server error"})
				return
			}
			if chat == nil || chat.ClientID != clientID {
				clearAuthCookies(w)
				writeJSON(w, http.StatusForbidden, jsonMap{"error": "forbidden"})
				return
			}
		}
	}

	conn, err := websocket.Accept(w, r, &websocket.AcceptOptions{
		CompressionMode: websocket.CompressionDisabled,
	})
	if err != nil {
		return
	}
	client := &wsClient{
		conn:     conn,
		chatID:   chatID,
		clientID: clientID,
		adminAll: isAdmin && scope == "all",
	}
	hub.addClient(client)

	go func() {
		defer func() {
			hub.removeClient(client)
			_ = conn.Close(websocket.StatusNormalClosure, "")
		}()
		for {
			if _, _, err := conn.Read(context.Background()); err != nil {
				return
			}
		}
	}()
}

const (
	googleStateCookie    = "google_oauth_state"
	googleRedirectCookie = "google_oauth_redirect"
	googleCookieMaxAge   = 10 * 60 // 10 minutes
)

func setSecureCookie(w http.ResponseWriter, name, value string) {
	cookie := &http.Cookie{
		Name:     name,
		Value:    url.QueryEscape(value),
		Path:     "/",
		MaxAge:   googleCookieMaxAge,
		HttpOnly: true,
		Secure:   cookieSecure(),
		SameSite: http.SameSiteLaxMode,
	}
	if domain := cookieDomain(); domain != "" {
		cookie.Domain = domain
	}
	http.SetCookie(w, cookie)
}

func readSecureCookie(r *http.Request, name string) string {
	c, err := r.Cookie(name)
	if err != nil {
		return ""
	}
	v, err := url.QueryUnescape(c.Value)
	if err != nil {
		return ""
	}
	return v
}

func clearCookie(w http.ResponseWriter, name string) {
	cookie := &http.Cookie{
		Name:     name,
		Value:    "",
		Path:     "/",
		MaxAge:   -1,
		HttpOnly: true,
		Secure:   cookieSecure(),
		SameSite: http.SameSiteLaxMode,
	}
	if domain := cookieDomain(); domain != "" {
		cookie.Domain = domain
	}
	http.SetCookie(w, cookie)
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
	body, _ := io.ReadAll(http.MaxBytesReader(w, r.Body, maxBodyBytes))
	if len(strings.TrimSpace(string(body))) > 0 {
		if err := json.Unmarshal(body, &req); err != nil {
			writeJSON(w, http.StatusBadRequest, jsonMap{"error": "invalid json"})
			return
		}
	}
	refreshToken := strings.TrimSpace(req.RefreshToken)
	if refreshToken == "" {
		refreshToken = readCookieValue(r, "refresh_token")
	}
	if refreshToken == "" {
		writeJSON(w, http.StatusBadRequest, jsonMap{"error": "refresh token required"})
		return
	}
	claims, err := parseToken(refreshToken, "refresh")
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
	setAuthCookies(w, access, refresh, accessExp, refreshExp)
	writeJSON(w, http.StatusOK, jsonMap{
		"access_token":    access,
		"refresh_token":   refresh,
		"access_expires":  accessExp.Format(time.RFC3339),
		"refresh_expires": refreshExp.Format(time.RFC3339),
	})
}

func handleClientSession(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSON(w, http.StatusMethodNotAllowed, jsonMap{"error": "method not allowed"})
		return
	}
	token := clientTokenFromRequest(r)
	if token == "" {
		clearAuthCookies(w)
		writeJSON(w, http.StatusUnauthorized, jsonMap{"error": "unauthorized"})
		return
	}
	claims, err := parseToken(token, "access")
	if err != nil {
		clearAuthCookies(w)
		writeJSON(w, http.StatusUnauthorized, jsonMap{"error": "unauthorized"})
		return
	}
	clientID, _ := claims["sub"].(string)
	email, _ := claims["email"].(string)
	if clientID == "" || email == "" {
		clearAuthCookies(w)
		writeJSON(w, http.StatusUnauthorized, jsonMap{"error": "unauthorized"})
		return
	}
	writeJSON(w, http.StatusOK, jsonMap{"client_id": clientID, "email": email})
}

func handleClientLogout(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, jsonMap{"error": "method not allowed"})
		return
	}
	clearAuthCookies(w)
	writeJSON(w, http.StatusOK, jsonMap{"ok": true})
}

func handleClientPageViewAnalytics(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, jsonMap{"error": "method not allowed"})
		return
	}
	clientID := getClientIDFromContext(r.Context())
	if clientID == "" {
		writeJSON(w, http.StatusUnauthorized, jsonMap{"error": "unauthorized"})
		return
	}
	var req struct {
		Page string `json:"page"`
	}
	if err := decodeJSON(w, r, &req); err != nil {
		writeJSON(w, http.StatusBadRequest, jsonMap{"error": "invalid json"})
		return
	}
	page := strings.TrimSpace(strings.ToLower(req.Page))
	if page != "home" {
		writeJSON(w, http.StatusBadRequest, jsonMap{"error": "unsupported page"})
		return
	}
	if err := store.trackPageVisit(clientID, page, time.Now().UTC()); err != nil {
		writeJSON(w, http.StatusInternalServerError, jsonMap{"error": "server error"})
		return
	}
	writeJSON(w, http.StatusOK, jsonMap{"ok": true})
}

func handleAdminSession(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSON(w, http.StatusMethodNotAllowed, jsonMap{"error": "method not allowed"})
		return
	}
	token := adminTokenFromRequest(r)
	if token == "" {
		clearAdminCookie(w)
		writeJSON(w, http.StatusUnauthorized, jsonMap{"error": "unauthorized"})
		return
	}
	if _, err := parseToken(token, "admin"); err != nil {
		clearAdminCookie(w)
		writeJSON(w, http.StatusUnauthorized, jsonMap{"error": "unauthorized"})
		return
	}
	writeJSON(w, http.StatusOK, jsonMap{"ok": true})
}

func handleAdminLogout(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, jsonMap{"error": "method not allowed"})
		return
	}
	clearAdminCookie(w)
	writeJSON(w, http.StatusOK, jsonMap{"ok": true})
}

func handleMetrics(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		w.Header().Set("Allow", http.MethodGet)
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	registrationsTotal, err := store.countClients()
	if err != nil {
		http.Error(w, "failed to fetch registrations metric", http.StatusInternalServerError)
		return
	}
	chatsTotal, err := store.countChats()
	if err != nil {
		http.Error(w, "failed to fetch chats metric", http.StatusInternalServerError)
		return
	}
	messagesTotal, err := store.countMessages()
	if err != nil {
		http.Error(w, "failed to fetch messages metric", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "text/plain; version=0.0.4; charset=utf-8")
	fmt.Fprintf(w, "# HELP trumpus_registrations_total Total number of client registrations.\n")
	fmt.Fprintf(w, "# TYPE trumpus_registrations_total counter\n")
	fmt.Fprintf(w, "trumpus_registrations_total %d\n", registrationsTotal)
	fmt.Fprintf(w, "# HELP trumpus_chats_created_total Total number of chats created.\n")
	fmt.Fprintf(w, "# TYPE trumpus_chats_created_total counter\n")
	fmt.Fprintf(w, "trumpus_chats_created_total %d\n", chatsTotal)
	fmt.Fprintf(w, "# HELP trumpus_messages_sent_total Total number of messages sent.\n")
	fmt.Fprintf(w, "# TYPE trumpus_messages_sent_total counter\n")
	fmt.Fprintf(w, "trumpus_messages_sent_total %d\n", messagesTotal)
}

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8000"
	}
	mode := strings.ToLower(strings.TrimSpace(os.Getenv("RUN_MODE")))
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		log.Fatal("DATABASE_URL is required")
	}
	var err error
	store, err = newStore(dsn)
	if err != nil {
		log.Fatalf("failed to init db: %v", err)
	}
	rdb, err = initRedis()
	if err != nil {
		log.Fatalf("failed to init redis: %v", err)
	}
	hub = newWSHub()
	ctx := context.Background()
	startEventSubscriber(ctx)
	if mode == "worker" {
		log.Print("llm worker started")
		if err := runWorker(ctx); err != nil {
			log.Fatalf("worker error: %v", err)
		}
		return
	}

	if strings.TrimSpace(strings.ToLower(os.Getenv("MEMORY_BACKFILL_ON_START"))) != "false" {
		force := strings.TrimSpace(strings.ToLower(os.Getenv("MEMORY_BACKFILL_FORCE"))) == "true"
		runTopicBackfill := force
		if !runTopicBackfill {
			if value, ok, err := store.getSystemFlag("topic_ref_backfill_v1_done"); err != nil {
				log.Printf("memory_backfill_check_error err=%v", err)
			} else if !ok || value != "1" {
				runTopicBackfill = true
			}
		}
		if runTopicBackfill {
			log.Print("topic ref backfill started")
			refs := backfillTopicRefs()
			if err := store.setSystemFlag("topic_ref_backfill_v1_done", "1"); err != nil {
				log.Printf("topic_ref_backfill_flag_error err=%v", err)
			} else {
				log.Printf("topic ref backfill marked complete refs=%d", refs)
			}
		} else {
			log.Print("topic ref backfill skipped (already completed)")
		}

		runMemoryBackfill := force
		if !runMemoryBackfill {
			if value, ok, err := store.getSystemFlag("chat_memory_backfill_v1_done"); err != nil {
				log.Printf("chat_memory_backfill_check_error err=%v", err)
			} else if !ok || value != "1" {
				runMemoryBackfill = true
			}
		}
		if runMemoryBackfill {
			log.Print("chat memory backfill started")
			entries := backfillChatMemories()
			if err := store.setSystemFlag("chat_memory_backfill_v1_done", "1"); err != nil {
				log.Printf("chat_memory_backfill_flag_error err=%v", err)
			} else {
				log.Printf("chat memory backfill marked complete entries=%d", entries)
			}
		} else {
			log.Print("chat memory backfill skipped (already completed)")
		}
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
	mux.HandleFunc("/metrics", handleMetrics)

	// Auth stubs
	mux.HandleFunc("/api/v1/auth/login", wrap(handleClientLogin))
	mux.HandleFunc("/api/v1/auth/register", wrap(handleClientRegister))
	mux.HandleFunc("/api/v1/auth/forgot-password", wrap(handleClientForgot))
	mux.HandleFunc("/api/v1/auth/reset-password", wrap(handleClientReset))
	mux.HandleFunc("/api/v1/auth/google/start", handleGoogleStart(googleCfg))
	mux.HandleFunc("/api/v1/auth/google/callback", handleGoogleCallback(googleCfg))
	mux.HandleFunc("/api/v1/auth/google/mobile", wrap(handleGoogleMobile(googleCfg)))
	mux.HandleFunc("/api/v1/auth/refresh", wrap(handleAuthRefresh))
	mux.HandleFunc("/api/v1/auth/session", wrap(handleClientSession))
	mux.HandleFunc("/api/v1/auth/logout", wrap(handleClientLogout))

	mux.HandleFunc("/api/v1/admin/login", wrap(handleAdminLogin))
	mux.HandleFunc("/api/v1/admin/session", wrap(handleAdminSession))
	mux.HandleFunc("/api/v1/admin/logout", wrap(handleAdminLogout))
	mux.HandleFunc("/api/v1/admin/clients", wrap(requireAdminAuth(handleAdminClients)))
	mux.HandleFunc("/api/v1/admin/chats", wrap(requireAdminAuth(handleAdminChats)))
	mux.HandleFunc("/api/v1/admin/analytics", wrap(requireAdminAuth(handleAdminAnalytics)))
	mux.HandleFunc("/api/v1/admin/chats/", wrap(requireAdminAuth(handleAdminChatRoutes)))

	mux.HandleFunc("/api/v1/analytics/page-view", wrap(requireClientAuth(handleClientPageViewAnalytics)))
	mux.HandleFunc("/api/v1/clients/", wrap(requireClientAuth(handleClientRoutes)))
	mux.HandleFunc("/api/v1/chats/", wrap(requireClientAuth(handleChatRoutes)))
	mux.HandleFunc("/api/v1/ws", handleWS)

	srv := &http.Server{
		Addr:    ":" + port,
		Handler: mux,
	}

	log.Printf("listening on :%s", port)
	log.Fatal(srv.ListenAndServe())
}

func callLLM(baseURL, chatID, persona, personaPrompt, content string, history []llmHistoryItem, topicContext []llmHistoryItem, memory llmMemory) (string, int, string, error) {
	if strings.TrimSpace(baseURL) == "" {
		return "", 0, "", fmt.Errorf("llm base not set")
	}
	if history == nil {
		history = []llmHistoryItem{}
	}
	if topicContext == nil {
		topicContext = []llmHistoryItem{}
	}
	if memory.Topics == nil {
		memory.Topics = []string{}
	}
	payload := jsonMap{
		"chat_id":        chatID,
		"persona":        persona,
		"persona_prompt": personaPrompt,
		"content":        content,
		"history":        history,
		"topic_context":  topicContext,
		"memory":         memory,
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

func callLLMDebugPlan(baseURL, chatID, persona, personaPrompt, content string, history []llmHistoryItem, topicContext []llmHistoryItem, memory llmMemory) (map[string]any, int, string, error) {
	if strings.TrimSpace(baseURL) == "" {
		return nil, 0, "", fmt.Errorf("llm base not set")
	}
	if history == nil {
		history = []llmHistoryItem{}
	}
	if topicContext == nil {
		topicContext = []llmHistoryItem{}
	}
	if memory.Topics == nil {
		memory.Topics = []string{}
	}
	payload := jsonMap{
		"chat_id":        chatID,
		"persona":        persona,
		"persona_prompt": personaPrompt,
		"content":        content,
		"history":        history,
		"topic_context":  topicContext,
		"memory":         memory,
	}
	body, _ := json.Marshal(payload)
	req, err := http.NewRequest(http.MethodPost, strings.TrimRight(baseURL, "/")+"/debug/plan", strings.NewReader(string(body)))
	if err != nil {
		return nil, 0, "", err
	}
	req.Header.Set("Content-Type", "application/json")
	client := &http.Client{Timeout: 120 * time.Second}
	res, err := client.Do(req)
	if err != nil {
		return nil, 0, "", err
	}
	defer res.Body.Close()
	respBody, _ := io.ReadAll(res.Body)
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		return nil, res.StatusCode, string(respBody), fmt.Errorf("llm debug error: %s", string(respBody))
	}
	var resp map[string]any
	if err := json.Unmarshal(respBody, &resp); err != nil {
		return nil, res.StatusCode, string(respBody), err
	}
	return resp, res.StatusCode, string(respBody), nil
}

func redirectAllowlist() []string {
	raw := strings.TrimSpace(os.Getenv("OAUTH_REDIRECT_ALLOWLIST"))
	if raw == "" {
		return nil
	}
	parts := strings.Split(raw, ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		v := strings.TrimSpace(p)
		if v != "" {
			out = append(out, v)
		}
	}
	return out
}

func isRedirectAllowed(redirect string) bool {
	redirect = strings.TrimSpace(redirect)
	if redirect == "" {
		return false
	}
	u, err := url.Parse(redirect)
	if err != nil || u.Scheme == "" || u.Host == "" {
		return false
	}
	if u.Scheme != "https" && u.Scheme != "http" {
		return false
	}
	allowed := redirectAllowlist()
	if len(allowed) == 0 {
		return false
	}
	origin := strings.ToLower(u.Scheme + "://" + u.Host)
	for _, item := range allowed {
		allowedURL, err := url.Parse(item)
		if err != nil || allowedURL.Scheme == "" || allowedURL.Host == "" {
			continue
		}
		allowedOrigin := strings.ToLower(allowedURL.Scheme + "://" + allowedURL.Host)
		if origin == allowedOrigin {
			return true
		}
	}
	return false
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
		if !isRedirectAllowed(redirect) {
			writeJSON(w, http.StatusBadRequest, jsonMap{"error": "redirect not allowed"})
			return
		}

		log.Printf("google_start")

		state := nextID("state")
		setSecureCookie(w, googleStateCookie, state)
		setSecureCookie(w, googleRedirectCookie, redirect)

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

		log.Printf("google_callback state=%s code_len=%d", state, len(code))

		cookieState := readSecureCookie(r, googleStateCookie)
		redirectStr := readSecureCookie(r, googleRedirectCookie)
		// One-shot: clear cookies regardless of outcome
		clearCookie(w, googleStateCookie)
		clearCookie(w, googleRedirectCookie)

		if cookieState == "" || cookieState != state {
			writeJSON(w, http.StatusBadRequest, jsonMap{"error": "invalid state"})
			return
		}
		if redirectStr == "" {
			writeJSON(w, http.StatusBadRequest, jsonMap{"error": "redirect required"})
			return
		}
		if !isRedirectAllowed(redirectStr) {
			writeJSON(w, http.StatusBadRequest, jsonMap{"error": "redirect not allowed"})
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

		redirectURL, err := url.Parse(redirectStr)
		if err != nil {
			writeJSON(w, http.StatusBadRequest, jsonMap{"error": "invalid redirect"})
			return
		}
		setAuthCookies(w, access, refresh, accessExp, refreshExp)
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
	log.Printf("google_token_exchange status=%d", res.StatusCode)
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
	log.Printf("google_userinfo status=%d", res.StatusCode)
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
			"access_token":    access,
			"refresh_token":   refresh,
			"access_expires":  accessExp.Format(time.RFC3339),
			"refresh_expires": refreshExp.Format(time.RFC3339),
			"email":           email,
			"client_id":       client.ID,
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

	if !checkAdminCredentials(req.Username, req.Password) {
		writeJSON(w, http.StatusUnauthorized, jsonMap{"error": "invalid credentials"})
		return
	}
	token, exp, err := issueAdminToken(req.Username)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, jsonMap{"error": "server error"})
		return
	}
	setAdminCookie(w, token, exp)
	writeJSON(w, http.StatusOK, jsonMap{"ok": true})
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
	setAuthCookies(w, access, refresh, accessExp, refreshExp)
	writeJSON(w, http.StatusOK, jsonMap{
		"access_token":    access,
		"refresh_token":   refresh,
		"access_expires":  accessExp.Format(time.RFC3339),
		"refresh_expires": refreshExp.Format(time.RFC3339),
		"email":           email,
		"client_id":       client.ID,
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
	setAuthCookies(w, access, refresh, accessExp, refreshExp)
	writeJSON(w, http.StatusOK, jsonMap{
		"access_token":    access,
		"refresh_token":   refresh,
		"access_expires":  accessExp.Format(time.RFC3339),
		"refresh_expires": refreshExp.Format(time.RFC3339),
		"email":           email,
		"client_id":       client.ID,
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
	email, err := normalizeEmail(req.Email)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, jsonMap{"error": "invalid email"})
		return
	}
	exists, err := store.userExists(email)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, jsonMap{"error": "server error"})
		return
	}
	if !exists {
		writeJSON(w, http.StatusOK, jsonMap{"sent": true})
		return
	}
	base := resetLinkBase()
	if base == "" {
		writeJSON(w, http.StatusInternalServerError, jsonMap{"error": "reset link not configured"})
		return
	}
	token, tokenHash, err := newResetToken()
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, jsonMap{"error": "server error"})
		return
	}
	expiresAt := time.Now().Add(resetTokenTTL())
	if err := store.createPasswordReset(email, tokenHash, expiresAt); err != nil {
		writeJSON(w, http.StatusInternalServerError, jsonMap{"error": "server error"})
		return
	}
	link := buildResetLink(base, token)
	if link == "" {
		writeJSON(w, http.StatusInternalServerError, jsonMap{"error": "reset link not configured"})
		return
	}
	if err := sendResetEmail(email, link); err != nil {
		writeJSON(w, http.StatusInternalServerError, jsonMap{"error": "email send failed"})
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
		Token       string `json:"token"`
	}
	if err := decodeJSON(w, r, &req); err != nil {
		writeJSON(w, http.StatusBadRequest, jsonMap{"error": "invalid json"})
		return
	}
	if err := validatePassword(req.NewPassword); err != nil {
		writeJSON(w, http.StatusBadRequest, jsonMap{"error": err.Error()})
		return
	}
	var client *Client
	var ok bool
	var err error
	if strings.TrimSpace(req.Token) != "" {
		token := strings.TrimSpace(req.Token)
		client, ok, err = store.resetUserPasswordWithToken(hashResetToken(token), req.NewPassword)
	} else {
		email, err := normalizeEmail(req.Email)
		if err != nil {
			writeJSON(w, http.StatusBadRequest, jsonMap{"error": "invalid email"})
			return
		}
		if err := validatePassword(req.OldPassword); err != nil {
			writeJSON(w, http.StatusBadRequest, jsonMap{"error": err.Error()})
			return
		}
		client, ok, err = store.resetUserPassword(email, req.OldPassword, req.NewPassword)
	}
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, jsonMap{"error": "server error"})
		return
	}
	if !ok {
		writeJSON(w, http.StatusUnauthorized, jsonMap{"error": "invalid credentials"})
		return
	}
	email := ""
	if strings.TrimSpace(req.Token) != "" {
		if client != nil {
			email = client.Name
		}
	} else {
		email, _ = normalizeEmail(req.Email)
	}
	if email == "" {
		writeJSON(w, http.StatusInternalServerError, jsonMap{"error": "server error"})
		return
	}
	access, refresh, accessExp, refreshExp, err := issueTokens(client.ID, email)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, jsonMap{"error": "server error"})
		return
	}
	setAuthCookies(w, access, refresh, accessExp, refreshExp)
	writeJSON(w, http.StatusOK, jsonMap{
		"access_token":    access,
		"refresh_token":   refresh,
		"access_expires":  accessExp.Format(time.RFC3339),
		"refresh_expires": refreshExp.Format(time.RFC3339),
		"email":           email,
		"client_id":       client.ID,
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

func parseDateUTC(value string) (time.Time, error) {
	return time.ParseInLocation("2006-01-02", strings.TrimSpace(value), time.UTC)
}

func dayBoundsUTC(day time.Time) (time.Time, time.Time) {
	start := time.Date(day.Year(), day.Month(), day.Day(), 0, 0, 0, 0, time.UTC)
	return start, start.Add(24 * time.Hour)
}

func metricsForWindow(start, end time.Time) (jsonMap, error) {
	newRegistrations, err := store.countNewClientsBetween(start, end)
	if err != nil {
		return nil, err
	}
	dau, err := store.countActiveClientsByMessagesBetween(start, end)
	if err != nil {
		return nil, err
	}
	newChats, err := store.countNewChatsBetween(start, end)
	if err != nil {
		return nil, err
	}
	newMessages, err := store.countNewMessagesBetween(start, end)
	if err != nil {
		return nil, err
	}
	homeVisitors, err := store.countUniquePageVisitorsBetween("home", start, end)
	if err != nil {
		return nil, err
	}
	return jsonMap{
		"new_registrations": newRegistrations,
		"dau":               dau,
		"new_chats":         newChats,
		"new_messages":      newMessages,
		"home_visitors":     homeVisitors,
	}, nil
}

func handleAdminAnalytics(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSON(w, http.StatusMethodNotAllowed, jsonMap{"error": "method not allowed"})
		return
	}

	nowUTC := time.Now().UTC()
	defaultDay, _ := dayBoundsUTC(nowUTC)
	selectedDay := defaultDay
	if rawDay := strings.TrimSpace(r.URL.Query().Get("day")); rawDay != "" {
		parsedDay, err := parseDateUTC(rawDay)
		if err != nil {
			writeJSON(w, http.StatusBadRequest, jsonMap{"error": "invalid day, expected YYYY-MM-DD"})
			return
		}
		selectedDay = parsedDay
	}
	dayStart, dayEnd := dayBoundsUTC(selectedDay)

	periodStart := dayStart.AddDate(0, 0, -6)
	periodEnd := dayEnd
	rawFrom := strings.TrimSpace(r.URL.Query().Get("from"))
	rawTo := strings.TrimSpace(r.URL.Query().Get("to"))
	if rawFrom != "" || rawTo != "" {
		if rawFrom == "" || rawTo == "" {
			writeJSON(w, http.StatusBadRequest, jsonMap{"error": "both from and to are required"})
			return
		}
		parsedFrom, err := parseDateUTC(rawFrom)
		if err != nil {
			writeJSON(w, http.StatusBadRequest, jsonMap{"error": "invalid from, expected YYYY-MM-DD"})
			return
		}
		parsedTo, err := parseDateUTC(rawTo)
		if err != nil {
			writeJSON(w, http.StatusBadRequest, jsonMap{"error": "invalid to, expected YYYY-MM-DD"})
			return
		}
		if parsedTo.Before(parsedFrom) {
			writeJSON(w, http.StatusBadRequest, jsonMap{"error": "to must be on or after from"})
			return
		}
		periodStart = parsedFrom
		_, periodEnd = dayBoundsUTC(parsedTo)
	}

	dayMetrics, err := metricsForWindow(dayStart, dayEnd)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, jsonMap{"error": "server error"})
		return
	}
	periodMetrics, err := metricsForWindow(periodStart, periodEnd)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, jsonMap{"error": "server error"})
		return
	}

	totalRegistrations, err := store.countClients()
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, jsonMap{"error": "server error"})
		return
	}
	totalChats, err := store.countChats()
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, jsonMap{"error": "server error"})
		return
	}
	totalMessages, err := store.countMessages()
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, jsonMap{"error": "server error"})
		return
	}

	todayStart, todayEnd := dayBoundsUTC(nowUTC)
	yesterdayStart := todayStart.AddDate(0, 0, -1)
	yesterdayEnd := todayStart

	todayRegs, err := store.countNewClientsBetween(todayStart, todayEnd)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, jsonMap{"error": "server error"})
		return
	}
	yesterdayRegs, err := store.countNewClientsBetween(yesterdayStart, yesterdayEnd)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, jsonMap{"error": "server error"})
		return
	}
	todayChats, err := store.countNewChatsBetween(todayStart, todayEnd)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, jsonMap{"error": "server error"})
		return
	}
	yesterdayChats, err := store.countNewChatsBetween(yesterdayStart, yesterdayEnd)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, jsonMap{"error": "server error"})
		return
	}
	todayMessages, err := store.countNewMessagesBetween(todayStart, todayEnd)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, jsonMap{"error": "server error"})
		return
	}
	yesterdayMessages, err := store.countNewMessagesBetween(yesterdayStart, yesterdayEnd)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, jsonMap{"error": "server error"})
		return
	}
	todayHomeVisitors, err := store.countUniquePageVisitorsBetween("home", todayStart, todayEnd)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, jsonMap{"error": "server error"})
		return
	}
	yesterdayHomeVisitors, err := store.countUniquePageVisitorsBetween("home", yesterdayStart, yesterdayEnd)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, jsonMap{"error": "server error"})
		return
	}

	writeJSON(w, http.StatusOK, jsonMap{
		"day": dayStart.Format("2006-01-02"),
		"period": jsonMap{
			"from": periodStart.Format("2006-01-02"),
			"to":   periodEnd.Add(-time.Nanosecond).Format("2006-01-02"),
		},
		"day_metrics":    dayMetrics,
		"period_metrics": periodMetrics,
		"totals": jsonMap{
			"registrations": totalRegistrations,
			"chats":         totalChats,
			"messages":      totalMessages,
		},
		"today": jsonMap{
			"new_registrations": jsonMap{
				"value": todayRegs,
				"delta": todayRegs - yesterdayRegs,
			},
			"new_chats": jsonMap{
				"value": todayChats,
				"delta": todayChats - yesterdayChats,
			},
			"new_messages": jsonMap{
				"value": todayMessages,
				"delta": todayMessages - yesterdayMessages,
			},
			"home_visitors": jsonMap{
				"value": todayHomeVisitors,
				"delta": todayHomeVisitors - yesterdayHomeVisitors,
			},
		},
	})
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
		if r.Method == http.MethodDelete {
			handleAdminDeleteChat(w, r, chatID)
			return
		}
		writeJSON(w, http.StatusMethodNotAllowed, jsonMap{"error": "method not allowed"})
		return
	}
	switch parts[1] {
	case "messages":
		if len(parts) == 2 {
			if r.Method == http.MethodGet {
				handleAdminChatMessages(w, r, chatID)
				return
			}
			if r.Method == http.MethodPost {
				handleAdminSendMessage(w, r, chatID)
				return
			}
			writeJSON(w, http.StatusMethodNotAllowed, jsonMap{"error": "method not allowed"})
			return
		}
		if len(parts) == 4 && parts[3] == "resend" && r.Method == http.MethodPost {
			handleAdminResendMessage(w, r, chatID, parts[2])
			return
		}
		if len(parts) == 4 && parts[3] == "debug" && r.Method == http.MethodGet {
			handleAdminMessageDebug(w, r, chatID, parts[2])
			return
		}
		writeJSON(w, http.StatusNotFound, jsonMap{"error": "not found"})
		return
	case "read":
		if r.Method == http.MethodPost {
			handleAdminMarkRead(w, r, chatID)
			return
		}
	}
	writeJSON(w, http.StatusMethodNotAllowed, jsonMap{"error": "method not allowed"})
}

func handleAdminDeleteChat(w http.ResponseWriter, r *http.Request, chatID string) {
	chat, err := store.getChatByID(chatID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, jsonMap{"error": "server error"})
		return
	}
	if chat == nil {
		writeJSON(w, http.StatusNotFound, jsonMap{"error": "chat not found"})
		return
	}
	if err := store.deleteLLMRetryJobsByChat(chatID); err != nil {
		writeJSON(w, http.StatusInternalServerError, jsonMap{"error": "server error"})
		return
	}
	if err := store.deleteChat(chatID); err != nil {
		writeJSON(w, http.StatusInternalServerError, jsonMap{"error": "server error"})
		return
	}
	if rdb != nil {
		_ = rdb.Del(context.Background(), historyCacheKey(chatID)).Err()
	}
	publishEvent(ChatEvent{
		Type:     "chat_deleted",
		ChatID:   chatID,
		ClientID: chat.ClientID,
	})
	writeJSON(w, http.StatusOK, jsonMap{"ok": true, "chat_id": chatID})
}

func handleAdminResendMessage(w http.ResponseWriter, r *http.Request, chatID, messageID string) {
	chat, err := store.getChatByID(chatID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, jsonMap{"error": "server error"})
		return
	}
	if chat == nil {
		writeJSON(w, http.StatusNotFound, jsonMap{"error": "chat not found"})
		return
	}

	msg, err := store.getMessageByID(messageID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, jsonMap{"error": "server error"})
		return
	}
	if msg == nil || msg.ChatID != chatID {
		writeJSON(w, http.StatusNotFound, jsonMap{"error": "message not found"})
		return
	}
	if msg.Sender != "client" {
		writeJSON(w, http.StatusBadRequest, jsonMap{"error": "only client messages can be resent"})
		return
	}

	job := LLMJob{
		ChatID:    chatID,
		Persona:   chat.Persona,
		Content:   msg.Content,
		RequestID: nextID("admin_resend"),
		Source:    "admin_resend",
	}
	messages, err := store.listMessages(chatID)
	if err == nil && len(messages) > 0 {
		clientIndex := -1
		for i, item := range messages {
			if item.ID == messageID {
				clientIndex = i
				break
			}
		}
		if clientIndex >= 0 {
			job.History = buildHistoryFromMessages(messages[:clientIndex+1], llmHistoryContextMax())
			for i := clientIndex + 1; i < len(messages); i++ {
				if messages[i].Sender == "admin" {
					job.ReplaceID = messages[i].ID
					break
				}
			}
		}
	}
	if err := enqueueLLMJob(job); err != nil {
		go func(j LLMJob) {
			if err := processLLMJob(j); err != nil {
				log.Printf("llm_fallback_error req_id=%s chat_id=%s err=%v", j.RequestID, j.ChatID, err)
			}
		}(job)
	}

	writeJSON(w, http.StatusOK, jsonMap{
		"ok":         true,
		"queued":     true,
		"chat_id":    chatID,
		"message_id": messageID,
	})
}

func handleAdminMessageDebug(w http.ResponseWriter, r *http.Request, chatID, messageID string) {
	chat, err := store.getChatByID(chatID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, jsonMap{"error": "server error"})
		return
	}
	if chat == nil {
		writeJSON(w, http.StatusNotFound, jsonMap{"error": "chat not found"})
		return
	}
	msg, err := store.getMessageByID(messageID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, jsonMap{"error": "server error"})
		return
	}
	if msg == nil || msg.ChatID != chatID {
		writeJSON(w, http.StatusNotFound, jsonMap{"error": "message not found"})
		return
	}
	if msg.Sender != "client" {
		writeJSON(w, http.StatusBadRequest, jsonMap{"error": "only client messages are supported"})
		return
	}

	history := buildHistoryUntilMessage(chatID, messageID, llmHistoryContextMax())
	if len(history) == 0 {
		history = buildLLMHistory(chatID, llmHistoryContextMax())
	}
	topicContext := buildTopicContext(chatID, msg.Content, msg.CreatedAt.UTC())
	memory := getOrBuildRollingMemory(chatID, msg.CreatedAt.UTC())

	llmBase := os.Getenv("LLM_BASE")
	payload, status, body, err := callLLMDebugPlan(llmBase, chatID, chat.Persona, "", msg.Content, history, topicContext, memory)
	if err != nil {
		writeJSON(w, http.StatusBadGateway, jsonMap{
			"error":       "llm_debug_failed",
			"status_code": status,
			"detail":      err.Error(),
			"body":        body,
		})
		return
	}
	writeJSON(w, http.StatusOK, jsonMap{
		"ok":      true,
		"chat_id": chatID,
		"message": msg,
		"debug":   payload,
	})
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
	hist.append(chatID, "admin", msg.Content)
	appendHistoryCache(chatID, "admin", msg.Content)
	indexMessageTopicRefs(msg)
	_ = store.updateChatLastMessage(chatID, msg.CreatedAt)
	publishEvent(ChatEvent{
		Type:           "message_created",
		ChatID:         chatID,
		ClientID:       chat.ClientID,
		Message:        msg,
		UnreadForAdmin: chat.UnreadForAdmin,
		LastMessageAt:  msg.CreatedAt.Format(time.RFC3339),
	})

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
	publishEvent(ChatEvent{
		Type:           "chat_updated",
		ChatID:         chatID,
		ClientID:       chat.ClientID,
		UnreadForAdmin: 0,
		LastMessageAt:  chat.LastMessageAt.Format(time.RFC3339),
	})
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
		Content       string `json:"content"`
		Persona       string `json:"persona"`
		PersonaPrompt string `json:"persona_prompt"`
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
		hist.append(chatID, "client", dup.Content)
		appendHistoryCache(chatID, "client", dup.Content)
		log.Printf("chat_send dedup req_id=%s chat_id=%s latency_ms=%d", reqID, chatID, time.Since(start).Milliseconds())
		writeJSON(w, http.StatusOK, dup)
		return
	}

	msg, err := store.insertMessage(chatID, "client", content, now)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, jsonMap{"error": "server error"})
		return
	}
	hist.append(chatID, "client", msg.Content)
	appendHistoryCache(chatID, "client", msg.Content)
	indexMessageTopicRefs(msg)
	_ = store.updateChatUnread(chatID, chat.UnreadForAdmin+1)
	_ = store.updateChatLastMessage(chatID, msg.CreatedAt)
	if strings.TrimSpace(chat.Title) == "" {
		_ = store.updateChatTitle(chatID, firstLine(content, 60))
	}
	publishEvent(ChatEvent{
		Type:           "message_created",
		ChatID:         chatID,
		ClientID:       chat.ClientID,
		Message:        msg,
		UnreadForAdmin: chat.UnreadForAdmin + 1,
		LastMessageAt:  msg.CreatedAt.Format(time.RFC3339),
	})

	writeJSON(w, http.StatusCreated, msg)
	log.Printf("chat_send req_id=%s chat_id=%s sender=client latency_ms=%d", reqID, chatID, time.Since(start).Milliseconds())

	persona := chat.Persona
	if strings.TrimSpace(req.Persona) != "" {
		if p, err := normalizeText(req.Persona, maxPersonaLen); err == nil {
			persona = p
		}
	}
	job := LLMJob{
		ChatID:        chatID,
		Persona:       persona,
		PersonaPrompt: strings.TrimSpace(req.PersonaPrompt),
		Content:       content,
		RequestID:     reqID,
		Source:        "client_send",
		Attempts:      0,
	}
	if err := enqueueLLMJob(job); err != nil {
		go func(j LLMJob) {
			if err := processLLMJob(j); err != nil {
				log.Printf("llm_store_error req_id=%s chat_id=%s err=%v", j.RequestID, j.ChatID, err)
			}
		}(job)
	}
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
