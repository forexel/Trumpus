# Trumpus

Client app + admin panel + chat server.

## Stack

- Backend: Go (net/http), REST; planned WebSocket
- DB: PostgreSQL (Docker)
- Admin web: React + Vite
- Client web: React + Vite
- Mobile (planned): React Native + Expo
- LLM module (planned): Python service that calls LLM and writes to API

## Repo Structure

- `server/` - Go API
- `admin-web/` - Admin UI (web)
- `client-web/` - Client UI (web)
- `client-app/` - Mobile (future)
- `docs/` - Architecture, API, DB, decisions
- `infra/` - Infra/scripts (future)

## Current Behavior (MVP)

- Client auth: email/password + Google OAuth (web)
- Client chat list: shows only user’s chats
- New chat: persona dropdown (Donald Trump / Barack Obama), title is first user message
- Chat detail: user bubbles, LLM/admin bubbles with Markdown; typing indicator + typewriter effect
- Admin: sees clients + chats, can reply to chat

Note: user store is in-memory for now (Go server). Email sending for password reset is not connected yet.

## Local Dev (Docker)

```bash
docker compose up --build
```

Containers:
- `trumpus_db` (PostgreSQL)
- `trumpus_api` (Go API)
- `trumpus_admin_web` (admin UI)
- `trumpus_client_web` (client UI)

Ports:
- API: `http://localhost:8000`
- Admin web: `http://localhost:5174`
- Client web: `http://localhost:5173`

To reset DB data:

```bash
docker compose down -v
```

## Server Install (Production Outline)

1) Provision server (Ubuntu 22.04+ recommended)
2) Install Docker + Docker Compose
3) Copy project to server
4) Create env file or set env vars (see below)
5) Run:

```bash
docker compose up -d --build
```

### Required Env Vars

API:
- `PORT=8000`
- `DATABASE_URL=postgresql://user:pass@db:5432/trumpus?sslmode=disable`
- `GOOGLE_CLIENT_ID=...`
- `GOOGLE_CLIENT_SECRET=...`
- `GOOGLE_OAUTH_CALLBACK_URL=https://YOUR_DOMAIN/api/v1/auth/google/callback`

Client web:
- `VITE_API_BASE=https://YOUR_DOMAIN/api/v1`

### Google OAuth (Web client)

Redirect URIs in Google Console:
- `https://YOUR_DOMAIN/api/v1/auth/google/callback`

Client web login button uses:
- `https://YOUR_DOMAIN/api/v1/auth/google/start?redirect=https://YOUR_DOMAIN/auth/google/callback`

Local example:
- Callback in Google Console: `http://localhost:8000/api/v1/auth/google/callback`
- Client callback page: `http://localhost:5173/auth/google/callback`

## Architecture (Short)

See `docs/ARCHITECTURE.md` for full details.

- Client UI (web/mobile) talks to API (REST; later WS)
- Admin UI talks to API (REST)
- LLM service calls API to send messages as a persona
- API is the single source of truth for users/chats/messages

## Where to Plug LLM Module

- LLM service should call server endpoints:
  - `POST /api/v1/admin/chats/{chatId}/messages` (send message as AI)
  - OR future `POST /api/v1/llm/respond` (to be added)

See `docs/API.md` for current endpoints.

## Assets

Client assets live in `client-web/src/assets/`:
- `auth-bg.png` (auth background)
- `google.svg` (Google icon)
- `eagle.png` (empty state)
- `trump.png`, `obama.png` (persona avatars)
