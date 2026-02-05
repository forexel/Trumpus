# Trumpus

Client app + admin panel + chat server + LLM worker.

## Stack

- Backend: Go (net/http), REST; WebSocket planned
- DB: PostgreSQL (Docker)
- Admin web: React + Vite
- Client web: React + Vite
- Mobile: React Native + Expo
- LLM module: Python (FastAPI) service that calls LLM provider

## Repo Structure

- `server/` - Go API
- `admin-web/` - Admin UI (web)
- `client-web/` - Client UI (web)
- `client-app/` - Mobile app (Expo)
- `docs/` - Architecture, API, DB, decisions
- `infra/` - Infra/scripts (future)

## Current Behavior (MVP)

- Client auth: email/password + Google OAuth (web)
- Client chat list: shows only user’s chats
- New chat: persona dropdown (10 personas), title is first user message
- Chat detail: user bubbles + LLM bubbles with Markdown; typing indicator
- Admin: sees clients + chats, can reply to chat (basic)

Note: email sending for password reset is not connected yet.

## Local Dev (Docker)

```bash
docker compose up --build
```

Containers:
- `trumpus_db` (PostgreSQL)
- `trumpus_api` (Go API)
- `trumpus_llm` (LLM worker)
- `trumpus_admin_web` (admin UI)
- `trumpus_client_web` (client UI)

Ports:
- API: `http://localhost:8000`
- LLM: `http://localhost:8010`
- Admin web: `http://localhost:5174`
- Client web: `http://localhost:5173`
- DB: `localhost:5433`

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

### Production: step-by-step (server)

1) Install Docker/Compose

```bash
sudo apt update
sudo apt install -y ca-certificates curl gnupg
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo usermod -aG docker $USER
```

Log out/in to pick up the docker group.

2) Upload the project

```bash
scp -r Trumpus user@YOUR_SERVER:/srv/trumpus
```

3) Create env files

Project root `.env` (for LLM worker):

```bash
OPENROUTER_API_KEY=...
OPENROUTER_MODEL=openai/gpt-oss-120b:free
```

`server/.env` (API):

```bash
PORT=8000
DATABASE_URL=postgresql://user:pass@db:5432/trumpus?sslmode=disable
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_OAUTH_CALLBACK_URL=https://YOUR_DOMAIN/api/v1/auth/google/callback
LLM_BASE=http://llm:8010
```

Client web env:

`client-web/.env`:

```bash
VITE_API_BASE=https://YOUR_DOMAIN/api/v1
```

Admin web env:

`admin-web/.env`:

```bash
VITE_API_BASE=https://YOUR_DOMAIN/api/v1
```

4) Build + run

```bash
cd /srv/trumpus
docker compose up -d --build
```

5) Open ports (or put behind reverse proxy)

If no reverse proxy yet, open:
- 5173 (client web)
- 5174 (admin web)
- 8000 (API)

```bash
sudo ufw allow 5173
sudo ufw allow 5174
sudo ufw allow 8000
```

### Reverse proxy (recommended)

Use Nginx + SSL (LetsEncrypt). Example vhost:

```
server {
  server_name YOUR_DOMAIN;
  location / {
    proxy_pass http://127.0.0.1:5173;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
  }
  location /api/ {
    proxy_pass http://127.0.0.1:8000/;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
  }
}
```

If you host admin on a subdomain, point it to `5174`.

### Start on boot

If you want auto-start on reboot:

```bash
sudo systemctl enable docker
```

Docker compose will restart containers if `restart:` is set in `docker-compose.yml`.

### Required Env Vars

API:
- `PORT=8000`
- `DATABASE_URL=postgresql://user:pass@db:5432/trumpus?sslmode=disable`
- `GOOGLE_CLIENT_ID=...`
- `GOOGLE_CLIENT_SECRET=...`
- `GOOGLE_OAUTH_CALLBACK_URL=https://YOUR_DOMAIN/api/v1/auth/google/callback`
- `LLM_BASE=http://llm:8010`

Client web:
- `VITE_API_BASE=https://YOUR_DOMAIN/api/v1`

LLM worker:
- `OPENROUTER_API_KEY=...`
- `OPENROUTER_MODEL=openai/gpt-oss-120b:free`
- `LLM_PROVIDER=openrouter|openai`
- `OPENAI_API_KEY=...`
- `OPENAI_MODEL=gpt-4o-mini`

## Mobile App (Expo)

Location: `client-app/`

### Config (where to change API base)

Edit `client-app/app.json`:

```json
"extra": {
  "apiBaseUrl": "https://app.privetsuper.ru:18000/api/v1",
  "googleAndroidClientId": "PASTE_ANDROID_CLIENT_ID_HERE",
  "googleWebClientId": "PASTE_WEB_CLIENT_ID_HERE"
}
```

When you move servers, update `apiBaseUrl` here.

### Dev run

```bash
cd client-app
npm install
npx expo start
```

### Android build (Google Play)

```bash
npx expo login
npx eas build -p android --profile production
```

Package name: `com.trumpus`  
App name: `Trumpus`

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

## LLM Flow (Now)

- Client sends message to API: `POST /api/v1/chats/{chatId}/messages`
- API calls LLM worker: `POST /respond`
- API stores LLM reply as `sender=admin` and serves it to client

See `docs/API.md` for current endpoints.

## Assets

Client assets live in `client-web/src/assets/`:
- `auth-bg.png` (auth background)
- `google.svg` (Google icon)
- `eagle.png` (empty state)
- persona avatars:
  - `DonaldTrump.png`
  - `ElonMask.png`
  - `KaneyWest.png`
  - `RichardNixon.png`
  - `AndrewJackson.png`
  - `MarjorieTaylorGreene.png`
  - `TuckerCarlson.png`
  - `LyndonBJohnson.png`
  - `MarkZuckerberg.png`
  - `JeffreyEpstein.png`
