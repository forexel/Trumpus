# Architecture

## Modules

- Auth
  - Email/password (MVP, in-memory)
  - Google OAuth (web client)
  - Reset password (stub; email sending not wired)
- Client Chat
  - Chat list
  - Messages
  - Create chat with persona
  - Title = first user message
  - Typing indicator + typewriter for AI reply
- Admin
  - Client list
  - Chat list
  - Send messages on behalf of LLM/admin
  - Unread markers (per chat)

## Services

- API (Go)
  - REST for auth, chats, messages, admin
  - In-memory storage in MVP (PostgreSQL planned)
  - Future WebSocket for realtime
- DB (PostgreSQL)
  - users, chats, messages, admin_users
- LLM Service (Python, planned)
  - Calls LLM provider
  - Sends messages to API as persona

## Data Flow

Client -> API -> DB
Admin -> API -> DB
LLM Service -> API -> DB

## Realtime (future)

- WebSocket channel per chat
- Server broadcasts new messages to client/admin

## Server Requirements (baseline)

- CPU: 2 vCPU
- RAM: 4 GB
- Disk: 20 GB
- Docker + Docker Compose

Scale with:
- horizontal API replicas
- DB tuning / managed Postgres
- message queue for LLM jobs

## LLM Integration

Recommended:
- LLM service creates/updates messages via API
- API stores messages and distributes via WS

Entry points:
- `POST /api/v1/admin/chats/{chatId}/messages` (current)
- `POST /api/v1/llm/respond` (planned)

Persona selection:
- Client creates chat with `persona`
- API stores persona and uses it to pick prompt

## Auth Flow (Web)

- Login/Registration returns `token`, `client_id`, `email`
- Client stores values in localStorage and uses `client_id` for chat queries
- Google OAuth redirects via API callback to `/auth/google/callback` page
