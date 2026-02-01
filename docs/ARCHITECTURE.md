# Architecture

## Modules

- Auth
  - Email/password (planned)
  - Google OAuth (web client)
- Client Chat
  - Chat list
  - Messages
  - Create chat with persona
- Admin
  - Client list
  - Chat list
  - Send messages on behalf of LLM/admin

## Services

- API (Go)
  - REST for auth, chats, messages, admin
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
