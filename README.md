# Trumpus

Client app + admin panel + chat server + LLM worker.

## Stack

- Backend: Go (net/http), REST + WebSocket
- DB: PostgreSQL (Docker)
- Queue/pubsub: Redis (Docker)
- Admin web: React + Vite
- Client web: React + Vite
- Mobile: React Native + Expo
- LLM module: Python (FastAPI) service that calls LLM provider

## Required Server Services

For production (or if you run without Docker), the server needs:

- PostgreSQL (DB)
- Redis (queue/pubsub)
- SMTP mail server (password reset emails)
- Reverse proxy + SSL (Nginx + LetsEncrypt recommended)

With Docker Compose, Postgres and Redis are already provided as containers, but SMTP and reverse proxy are still external services.

## Architecture (High Level)

- Clients (mobile/web) talk to the Go API over HTTPS
- Go API reads/writes PostgreSQL and publishes chat events via Redis
- LLM worker consumes jobs from Redis and calls the Python LLM service
- Admin web uses the same API for moderation and replies
- Password reset uses SMTP to send a token link to the web reset page

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for details.

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

Password reset emails are sent via SMTP (see env vars below).

## Security (MVP)

- Passwords are hashed with bcrypt; legacy plaintext entries are upgraded on next login.
- Server validates email format, password length, and message/title/persona length.
- Client web Markdown rendering blocks unsafe URLs (no `javascript:` links).
- SQL uses parameterized queries (no string concatenation).

If you need stricter controls (rate limiting, JWT auth, stricter CORS), add them before public launch.

## Local Dev (Docker)

```bash
docker compose up --build
```

Containers:
- `trumpus_db` (PostgreSQL)
- `trumpus_redis` (Redis)
- `trumpus_api` (Go API)
- `trumpus_worker` (LLM queue worker)
- `trumpus_llm` (LLM worker)
- `trumpus_admin_web` (admin UI)
- `trumpus_client_web` (client UI)

Ports:
- API: `http://localhost:8000`
- LLM: `http://localhost:8010`
- Admin web: `http://localhost:5174`
- Client web: `http://localhost:5173`
- DB: `localhost:5433`
- Redis: `localhost:6379`

To reset DB data:

```bash
docker compose down -v
```

## Server Install (Production Outline)

1) Provision server (Ubuntu 22.04+ recommended)
2) Install Docker + Docker Compose
3) Set up DNS for your domain (A/AAAA) and mail (MX/SPF/DKIM/DMARC)
4) Copy project to server
5) Create env file or set env vars (see below)
6) Run:

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
REDIS_URL=redis://redis:6379/0
JWT_SECRET=change-me
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
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
  }
}
```

If you host admin on a subdomain, point it to `5174`.

### Reverse proxy with Caddy (container)

Add the `caddy` service in docker-compose and create a `Caddyfile` like:

```
trumpus.tech {
  reverse_proxy /api/* api:8000
  reverse_proxy /ws api:8000
  reverse_proxy client-web:5173
}

admin.trumpus.tech {
  reverse_proxy /api/* api:8000
  reverse_proxy /ws api:8000
  reverse_proxy admin-web:5174
}
```

Then run:

```bash
docker compose up -d --build
```

Caddy will request TLS certificates automatically. Make sure your DNS A/AAAA records point to the server.

When using Caddy, set these env vars:

```bash
COOKIE_SECURE=true
COOKIE_DOMAIN=trumpus.tech
TRUST_PROXY=true
```

### SMTP + DNS (required for password reset)

If you run your own mail server or use a provider, ensure these DNS records exist for `trumpus.tech`:

- `MX` record for the mail server
- `SPF` TXT record (authorizes the SMTP server)
- `DKIM` TXT record (provider-specific)
- `DMARC` TXT record (policy and reporting)

Then set SMTP env vars in `server/.env`:

```bash
SMTP_HOST=mail.trumpus.tech
SMTP_PORT=587
SMTP_USER=mailer@trumpus.tech
SMTP_PASS=...
SMTP_FROM=Trumpus <mailer@trumpus.tech>
SMTP_TLS=starttls
```

Set the reset link base (used in emails):

```bash
RESET_LINK_BASE=https://trumpus.tech/reset?token=
RESET_TOKEN_TTL_MIN=60
```

### Mobile deep links (Android/iOS)

To open reset links in the app (if installed) and fall back to browser:

1) Configure App Links / Universal Links in `client-app/app.json` (already added).
2) Host the platform association files on your domain:

Android (https://trumpus.tech/.well-known/assetlinks.json):

```json
[
  {
    "relation": ["delegate_permission/common.handle_all_urls"],
    "target": {
      "namespace": "android_app",
      "package_name": "com.trumpus",
      "sha256_cert_fingerprints": [
        "REPLACE_WITH_RELEASE_SHA256"
      ]
    }
  }
]
```

iOS (https://trumpus.tech/.well-known/apple-app-site-association):

```json
{
  "applinks": {
    "apps": [],
    "details": [
      {
        "appID": "TEAMID.com.trumpus",
        "paths": ["/reset", "/reset/*"]
      }
    ]
  }
}
```

Replace `TEAMID` and the Android SHA256 fingerprint with your release credentials.

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
- `REDIS_URL=redis://redis:6379/0`
- `JWT_SECRET=...`
- `ADMIN_USERNAME=...` (required)
- `ADMIN_PASSWORD=...` (required if no hash)
- `ADMIN_PASSWORD_HASH=...` (optional bcrypt hash, overrides ADMIN_PASSWORD)
- `GOOGLE_CLIENT_ID=...`
- `GOOGLE_CLIENT_SECRET=...`
- `GOOGLE_OAUTH_CALLBACK_URL=https://YOUR_DOMAIN/api/v1/auth/google/callback`
- `LLM_BASE=http://llm:8010`
- `JWT_SECRET=...` (required)
- `JWT_ACCESS_TTL_MIN=15` (optional)
- `JWT_REFRESH_TTL_DAYS=30` (optional)
- `ADMIN_TOKEN_TTL_HOURS=8` (optional)
- `RATE_LIMIT_PER_MIN=60` (optional)
- `CORS_ORIGINS=https://trumpus.tech,https://admin.trumpus.tech,http://localhost:5173` (required in production)
- `OAUTH_REDIRECT_ALLOWLIST=https://trumpus.tech,http://localhost:5173` (required)
- `COOKIE_SECURE=true|false` (required, false for local http)
- `COOKIE_DOMAIN=trumpus.tech` (optional)
- `TRUST_PROXY=true|false` (required when behind Caddy/Nginx)
- `RESET_LINK_BASE=https://trumpus.tech/reset?token=` (required for password reset)
- `RESET_TOKEN_TTL_MIN=60` (optional)

Note: set `COOKIE_DOMAIN=trumpus.tech` if you want the same auth cookies to work on both `trumpus.tech` and `admin.trumpus.tech`.

SMTP (password reset):
- `SMTP_HOST=mail.your-domain.com`
- `SMTP_PORT=587`
- `SMTP_USER=mailer@your-domain.com`
- `SMTP_PASS=...`
- `SMTP_FROM=Trumpus <mailer@your-domain.com>`
- `SMTP_TLS=starttls|ssl|none` (optional, default: starttls)
- `SMTP_TIMEOUT_SEC=10` (optional)

## Password Reset Flow (Web + Mobile)

1) User submits email in "Restore Password".
2) API generates a reset token and sends `https://trumpus.tech/reset?token=...`.
3) On mobile, if the app is installed, the OS opens it via App Links/Universal Links.
4) App shows the reset screen, sets the new password, and logs the user in.
5) If the app is not installed, the web reset page opens and completes the same flow.

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
