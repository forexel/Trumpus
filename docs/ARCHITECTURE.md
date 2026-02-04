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
  - Typing indicator while LLM responds
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
- LLM Service (Python)
  - Calls LLM provider (OpenRouter)
  - Returns response to API

## Data Flow

Client -> API -> DB
Admin -> API -> DB
Client -> API -> LLM Service -> API -> DB

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

## Deployment Model (MVP)

Single host with Docker Compose:

- `client-web` (Vite) on 5173
- `admin-web` (Vite) on 5174
- `api` (Go) on 8000
- `llm` (FastAPI) on 8010 (internal)
- `db` (Postgres) on 5433 (internal)

Recommended: expose only 80/443 via reverse proxy, keep 8000/5173/5174 internal.

## Runtime Config

Secrets and config are provided via env files:

- Root `.env` (LLM worker)
  - `OPENROUTER_API_KEY`
  - `OPENROUTER_MODEL`
- `server/.env` (API)
  - `PORT`
  - `DATABASE_URL`
  - `GOOGLE_CLIENT_ID`
  - `GOOGLE_CLIENT_SECRET`
  - `GOOGLE_OAUTH_CALLBACK_URL`
  - `LLM_BASE`
- `client-web/.env` + `admin-web/.env`
  - `VITE_API_BASE`

## Networking

- Browser clients talk to API via `VITE_API_BASE`.
- API talks to LLM via `LLM_BASE` (Docker network hostname).
- LLM never exposed to the public network.

## Security Notes

- Keep LLM API keys server-side only (LLM worker).
- Use HTTPS in production (Nginx + LetsEncrypt).
- Restrict allowed origins/hosts in Vite or reverse proxy.

## LLM Integration

Current flow:
- Client sends message to API
- API calls LLM service `/respond`
- API stores LLM reply as message (`sender=admin`)
- Client polls messages

Entry points:
- `POST /api/v1/chats/{chatId}/messages` (client)
- `POST /respond` (LLM worker, internal)

Persona selection:
- Client creates chat with `persona`
- API stores persona and uses it to pick prompt

## Auth Flow (Web)

- Login/Registration returns `token`, `client_id`, `email`
- Client stores values in localStorage and uses `client_id` for chat queries
- Google OAuth redirects via API callback to `/auth/google/callback` page
