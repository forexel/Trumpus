# Trumpus

Client app + admin panel + chat server + LLM worker.

## Stack

- Backend: Go (net/http), REST + WebSocket
- DB: PostgreSQL 16 (Docker)
- Queue/pubsub: Redis 7.2 Streams (async, Docker)
- Admin web: React + Vite
- Client web: React + Vite
- Mobile: React Native + Expo
- LLM module: Python (FastAPI) async service — calls LLM provider via httpx.AsyncClient
- Reverse proxy: Caddy 2 (auto-SSL)

## Architecture (High Level)

- Clients (mobile/web) → Go API over HTTPS
- Go API ↔ PostgreSQL (data) + Redis Streams (async job queue)
- Worker reads Redis Stream `llm_jobs` → calls Python LLM service `/respond`
- LLM service calls OpenRouter or OpenAI with automatic model fallback chain
- Admin web uses the same API for moderation and replies
- Password reset uses SMTP → token link → web/app reset page
- Redis Pub/Sub `chat_events` delivers real-time updates via WebSocket

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for details.

## Repo Structure

```
server/          Go API + worker (single binary, RUN_MODE=worker)
admin-web/       Admin UI (React + Vite)
client-web/      Client UI (React + Vite)
client-app/      Mobile app (Expo)
llm/             LLM service (Python FastAPI)
docs/            Architecture, API, DB, decisions
templates/       Email templates (mounted into server container)
Caddyfile        Reverse proxy config
docker-compose.yml       Local development
docker-compose.prod.yml  Production deployment
.env                     Root env vars (not in git — see below)
.env.llm                 LLM service env vars (not in git — see below)
```

## Redis Queues & Async Flow

All Redis interactions use async patterns:

1. **LLM Job Queue** — Redis Stream `llm_jobs` (consumer group `llm_workers`)
   - API publishes a job via `XADD`
   - Worker reads via `XREADGROUP` in a loop and calls LLM service asynchronously

2. **Chat Events** — Redis Pub/Sub channel `chat_events`
   - Worker publishes new message events after LLM responds
   - API subscribers push events to connected WebSocket clients

3. **LLM service** — fully async (FastAPI + httpx.AsyncClient)
   - `POST /respond` is `async def` with `await` calls
   - Retry/backoff uses `await asyncio.sleep()` (non-blocking)
   - All HTTP calls via `httpx.AsyncClient` (non-blocking)

---

## LLM Modes

The LLM service supports two provider modes, controlled by `LLM_PROVIDER`:

### OpenRouter mode (`LLM_PROVIDER=openrouter`) — default

Uses [OpenRouter](https://openrouter.ai/) as a proxy to many models. Supports a 4-model fallback chain:

| Priority | Variable | Default |
|----------|----------|---------|
| 1 (primary) | `OPENROUTER_MODEL_PRIMARY` | `openai/gpt-oss-120b:free` |
| 2 (fallback) | `OPENROUTER_MODEL_FALLBACK` | `Qwen/Qwen3-4B:free` |
| 3 (fallback 2) | `OPENROUTER_MODEL_FALLBACK_2` | `meta-llama/llama-3.2-3b-instruct:free` |
| 4 (fallback 3) | `OPENROUTER_MODEL_FALLBACK_3` | `openai/gpt-4o-mini` |

If the primary model fails (rate limit, error, timeout), the service automatically tries the next model. With free models you pay nothing but get rate limits. Model 4 (`gpt-4o-mini`) is paid — acts as a last resort.

**Required env var:** `OPENROUTER_API_KEY` — get it at https://openrouter.ai/keys

### OpenAI mode (`LLM_PROVIDER=openai`)

Calls OpenAI API directly. Uses model set in `OPENAI_MODEL` (default: `gpt-4o-mini`). If `OPENROUTER_API_KEY` is also set, OpenRouter models act as fallback after OpenAI fails.

**Required env var:** `OPENAI_API_KEY` — get it at https://platform.openai.com/api-keys

### Cross-fallback

Both modes support cross-provider fallback:
- `openrouter` mode will fall back to OpenAI if `OPENAI_API_KEY` is set
- `openai` mode will fall back to OpenRouter models if `OPENROUTER_API_KEY` is set

---

## Current Behavior (MVP)

- Client auth: email/password + Google OAuth (web)
- Client chat list: shows only user's chats
- New chat: persona dropdown (10 personas), title is first user message
- Chat detail: user bubbles + LLM bubbles with Markdown; typing indicator
- Admin: sees clients + chats, can reply to chat (basic)
- Password reset emails via SMTP

## Security (MVP)

- Passwords hashed with bcrypt; legacy plaintext upgraded on login
- Server validates email format, password length, message/title/persona length
- Client Markdown rendering blocks unsafe URLs (no `javascript:` links)
- SQL uses parameterized queries (no string concatenation)
- JWT access tokens (15 min) + refresh tokens (30 days)
- Cookie: `Secure`, `HttpOnly`, `SameSite=Lax`

---

## Local Dev (Docker)

```bash
docker compose up --build
```

Containers: `trumpus_db`, `trumpus_redis`, `trumpus_api`, `trumpus_worker`, `trumpus_llm`, `trumpus_admin_web`, `trumpus_client_web`, `trumpus_caddy`

| Service | URL |
|---------|-----|
| Client web | http://localhost:5173 |
| Admin web | http://localhost:5174 |
| API | http://localhost:8000 |
| LLM | http://localhost:8010 |
| DB | localhost:5433 |
| Redis | localhost:6379 |

Reset all data:
```bash
docker compose down -v
```

---

## Production Deployment — Step by Step

### 1. Prerequisites

- Server: Ubuntu 22.04+ (or any Linux with Docker)
- Domain pointed to your server IP (A record):
  - `trumpus.tech` → client
  - `admin.trumpus.tech` → admin panel
- 1 GB RAM minimum (2 GB recommended)
- Ports 80 and 443 open

### 2. Install Docker

```bash
sudo apt update && sudo apt install -y ca-certificates curl gnupg
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt update && sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo usermod -aG docker $USER
```

Log out and back in to pick up the docker group.

### 3. Upload project to server

```bash
scp -r Trumpus user@YOUR_SERVER:/srv/trumpus
```

Or clone from git:
```bash
cd /srv && git clone <repo-url> trumpus && cd trumpus
```

### 4. Create `.env` file

Since `.env` is in `.gitignore`, you must create it manually on the server.

```bash
nano /srv/trumpus/.env
```

Paste and fill in (see **Environment Variables Reference** below for details):

```bash
# Security
JWT_SECRET=<random 64-char string, generate: openssl rand -hex 32>

# Admin panel
ADMIN_USERNAME=admin
ADMIN_PASSWORD=<strong password>

# Database
POSTGRES_USER=trumpus
POSTGRES_PASSWORD=<strong db password>
POSTGRES_DB=trumpus

# Redis
REDIS_PASSWORD=<strong redis password>

# Google OAuth (get from Google Cloud Console)
GOOGLE_CLIENT_ID=<your Google OAuth Client ID>
GOOGLE_CLIENT_SECRET=<your Google OAuth Client Secret>
GOOGLE_OAUTH_CALLBACK_URL=https://trumpus.tech/api/v1/auth/google/callback

# LLM
LLM_PROVIDER=openrouter
OPENROUTER_API_KEY=<your OpenRouter key from openrouter.ai/keys>
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4o-mini

# SMTP (password reset — leave blank to disable email)
SMTP_HOST=mail.trumpus.tech
SMTP_PORT=587
SMTP_USER=mailer@trumpus.tech
SMTP_PASS=<smtp password>
SMTP_FROM=Trumpus <mailer@trumpus.tech>
SMTP_TLS=starttls
RESET_LINK_BASE=https://trumpus.tech/reset-password
```

### 5. Create `.env.llm` file

```bash
nano /srv/trumpus/.env.llm
```

```bash
LLM_PROVIDER=openrouter
OPENROUTER_API_KEY=<same key as in .env>
OPENROUTER_MODEL_PRIMARY=openai/gpt-oss-120b:free
OPENROUTER_MODEL_FALLBACK=Qwen/Qwen3-4B:free
OPENROUTER_MODEL_FALLBACK_2=meta-llama/llama-3.2-3b-instruct:free
OPENROUTER_MODEL_FALLBACK_3=openai/gpt-4o-mini
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4o-mini
OPENROUTER_CONNECT_TIMEOUT=5
OPENROUTER_READ_TIMEOUT=30
OPENROUTER_WRITE_TIMEOUT=10
OPENROUTER_POOL_TIMEOUT=5
OPENROUTER_MAX_ATTEMPTS=10
OPENROUTER_INITIAL_DELAY=0.5
OPENROUTER_MAX_DELAY=8
LLM_MAX_TOKENS=700
LLM_TEMPERATURE=0.95
LLM_TOP_P=0.95
LLM_PRESENCE_PENALTY=0.4
LLM_FREQUENCY_PENALTY=0.2
```

### 6. Create/verify Caddyfile

The project includes a `Caddyfile` for automatic HTTPS:

```
trumpus.tech {
    reverse_proxy /api/* api:8000
    reverse_proxy /ws api:8000
    reverse_proxy client-web:80
}

admin.trumpus.tech {
    reverse_proxy /api/* api:8000
    reverse_proxy /ws api:8000
    reverse_proxy admin-web:80
}
```

Caddy obtains and renews TLS certificates automatically via Let's Encrypt. Make sure DNS A records point to your server.

### 7. Build & start

```bash
cd /srv/trumpus
docker compose -f docker-compose.prod.yml up -d --build
```

### 8. Verify

```bash
# Check all containers running
docker compose -f docker-compose.prod.yml ps

# Check logs
docker compose -f docker-compose.prod.yml logs -f api
docker compose -f docker-compose.prod.yml logs -f llm
docker compose -f docker-compose.prod.yml logs -f caddy
```

Open `https://trumpus.tech` — client app.
Open `https://admin.trumpus.tech` — admin login.

### 9. Auto-restart on boot

```bash
sudo systemctl enable docker
```

All containers have `restart: unless-stopped`.

### 10. Update deployment

```bash
cd /srv/trumpus
git pull
docker compose -f docker-compose.prod.yml up -d --build
```

---

## SMTP — Mailu (password reset emails)

The project uses [Mailu](https://mailu.io/) as a self-hosted mail server on the same server. Mailu runs as its own Docker Compose stack and handles sending password reset emails.

### How it works

1. Mailu containers run on the host, listening on ports 25/587/465
2. Trumpus `api` container reaches Mailu via `extra_hosts: mail.trumpus.tech:host-gateway`
   - `host-gateway` resolves to the Docker host IP, so the container connects to Mailu on the host machine
3. SMTP uses STARTTLS on port 587 with `PLAIN` auth

### Mailu setup (on server)

1. Install Mailu: https://setup.mailu.io/
2. Configure domain `trumpus.tech`
3. Create a mailbox: `mailer@trumpus.tech` (this account sends reset emails)
4. Set the password for `mailer@trumpus.tech` in Mailu admin

### DNS records required

| Type | Name | Value |
|------|------|-------|
| MX | `trumpus.tech` | `mail.trumpus.tech` (priority 10) |
| A | `mail.trumpus.tech` | `<your server IP>` |
| TXT | `trumpus.tech` | `v=spf1 mx a:mail.trumpus.tech ~all` |
| TXT | `dkim._domainkey.trumpus.tech` | *(get from Mailu admin → DKIM keys)* |
| TXT | `_dmarc.trumpus.tech` | `v=DMARC1; p=quarantine; rua=mailto:admin@trumpus.tech` |

### `.env` SMTP variables

```bash
SMTP_HOST=mail.trumpus.tech
SMTP_PORT=587
SMTP_USER=mailer@trumpus.tech
SMTP_PASS=<password you set in Mailu>
SMTP_FROM=Trumpus <mailer@trumpus.tech>
SMTP_TLS=starttls
RESET_LINK_BASE=https://trumpus.tech/reset-password
```

### Testing

After setup, test with:
```bash
# From inside the api container:
docker exec -it trumpus_api sh -c 'echo test'

# Or trigger a reset from the client:
# 1. Go to https://trumpus.tech
# 2. Click "Forgot Password"
# 3. Enter a valid email
# 4. Check the email inbox for the reset link
```

Check Mailu logs if emails don't arrive:
```bash
docker compose -f /srv/mailu/docker-compose.yml logs smtp
```

---

## Environment Variables Reference

Since `.env` and `.env.llm` are in `.gitignore`, here is a complete reference of every variable.

### Root `.env`

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `JWT_SECRET` | ✅ | Secret for signing JWT tokens. Generate: `openssl rand -hex 32` | `a1b2c3d4...` (64 chars) |
| `ADMIN_USERNAME` | ✅ | Admin panel login username | `admin` |
| `ADMIN_PASSWORD` | ✅ | Admin panel login password (bcrypt-hashed on first use) | `MyStr0ngP@ss!` |
| `POSTGRES_USER` | ✅ | PostgreSQL username | `trumpus` |
| `POSTGRES_PASSWORD` | ✅ | PostgreSQL password | `db_secr3t` |
| `POSTGRES_DB` | ✅ | PostgreSQL database name | `trumpus` |
| `REDIS_PASSWORD` | ✅ | Redis auth password (prod only; dev has no password) | `redis_secr3t` |
| `GOOGLE_CLIENT_ID` | ✅ | Google OAuth 2.0 Client ID from Google Cloud Console | `813...apps.googleusercontent.com` |
| `GOOGLE_CLIENT_SECRET` | ✅ | Google OAuth 2.0 Client Secret | `GOCSPX-...` |
| `GOOGLE_OAUTH_CALLBACK_URL` | ❌ | OAuth callback URL. Default: `https://trumpus.tech/api/v1/auth/google/callback` | |
| `LLM_PROVIDER` | ❌ | `openrouter` (default) or `openai` | `openrouter` |
| `OPENROUTER_API_KEY` | ⚡ | Required if `LLM_PROVIDER=openrouter` | `sk-or-...` |
| `OPENAI_API_KEY` | ⚡ | Required if `LLM_PROVIDER=openai`. Optional fallback otherwise | `sk-...` |
| `OPENAI_MODEL` | ❌ | OpenAI model name. Default: `gpt-4o-mini` | `gpt-4o-mini` |
| `SMTP_HOST` | ❌ | SMTP server host. Leave blank to disable email | `mail.trumpus.tech` |
| `SMTP_PORT` | ❌ | SMTP port. Default: `587` | `587` |
| `SMTP_USER` | ❌ | SMTP auth username | `mailer@trumpus.tech` |
| `SMTP_PASS` | ❌ | SMTP auth password | `smtp_pass` |
| `SMTP_FROM` | ❌ | Sender address for emails | `Trumpus <mailer@trumpus.tech>` |
| `SMTP_TLS` | ❌ | `starttls` (default), `ssl`, or `none` | `starttls` |
| `RESET_LINK_BASE` | ❌ | Base URL for reset password link in emails | `https://trumpus.tech/reset-password` |

> ⚡ = required depending on `LLM_PROVIDER` value

### LLM `.env.llm`

| Variable | Default | Description |
|----------|---------|-------------|
| `LLM_PROVIDER` | `openrouter` | `openrouter` or `openai` |
| `OPENROUTER_API_KEY` | — | OpenRouter API key |
| `OPENROUTER_MODEL_PRIMARY` | `openai/gpt-oss-120b:free` | Primary model (tried first) |
| `OPENROUTER_MODEL_FALLBACK` | `Qwen/Qwen3-4B:free` | 1st fallback |
| `OPENROUTER_MODEL_FALLBACK_2` | `meta-llama/llama-3.2-3b-instruct:free` | 2nd fallback |
| `OPENROUTER_MODEL_FALLBACK_3` | `openai/gpt-4o-mini` | 3rd fallback (paid) |
| `OPENAI_API_KEY` | — | OpenAI key (for direct or fallback) |
| `OPENAI_MODEL` | `gpt-4o-mini` | OpenAI model to use |
| `OPENROUTER_CONNECT_TIMEOUT` | `5` | TCP connect timeout (seconds) |
| `OPENROUTER_READ_TIMEOUT` | `30` | Response read timeout (seconds) |
| `OPENROUTER_WRITE_TIMEOUT` | `10` | Request write timeout (seconds) |
| `OPENROUTER_POOL_TIMEOUT` | `5` | Connection pool timeout (seconds) |
| `OPENROUTER_MAX_ATTEMPTS` | `10` | Max retry attempts before giving up |
| `OPENROUTER_INITIAL_DELAY` | `0.5` | Initial retry backoff delay (seconds) |
| `OPENROUTER_MAX_DELAY` | `8` | Max retry backoff delay (seconds) |
| `LLM_MAX_TOKENS` | `700` | Max tokens in LLM response |
| `LLM_TEMPERATURE` | `0.95` | Sampling temperature (higher = more creative) |
| `LLM_TOP_P` | `0.95` | Nucleus sampling top-p |
| `LLM_PRESENCE_PENALTY` | `0.4` | Presence penalty |
| `LLM_FREQUENCY_PENALTY` | `0.2` | Frequency penalty |

### Server internal variables (set by docker-compose, don't change)

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string (built from POSTGRES_* vars) |
| `REDIS_URL` | Redis connection string (includes REDIS_PASSWORD) |
| `PORT` | API listen port (`8000`) |
| `LLM_BASE` | LLM service URL (`http://llm:8010`) |
| `RUN_MODE` | `worker` for queue worker, empty for API |
| `LLM_QUEUE_STREAM` | Redis Stream name (`llm_jobs`) |
| `LLM_QUEUE_GROUP` | Redis consumer group (`llm_workers`) |
| `CHAT_EVENT_CHANNEL` | Redis Pub/Sub channel (`chat_events`) |
| `COOKIE_DOMAIN` | Cookie domain (`.trumpus.tech` in prod) |
| `COOKIE_SECURE` | `true` in prod (HTTPS) |
| `TRUST_PROXY` | `true` when behind Caddy/Nginx |
| `CORS_ORIGINS` | Allowed CORS origins |
| `OAUTH_REDIRECT_ALLOWLIST` | Allowed OAuth redirect URIs |
| `MAIL_TEMPLATES_DIR` | Email templates path inside container |
| `VITE_API_BASE` | Frontend API base (build arg, `/api/v1`) |

---

## Password Reset Flow

1. User submits email → API generates reset token → sends email via SMTP
2. Email contains `https://trumpus.tech/reset-password?token=...`
3. On mobile: if app installed, OS opens via App Links / Universal Links
4. Web or app reset page sets new password → user is logged in

---

## Google OAuth Setup

1. Create OAuth 2.0 credentials in [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
2. Add authorized redirect URI: `https://trumpus.tech/api/v1/auth/google/callback`
3. Copy Client ID and Client Secret into `.env`

---

## Mobile App (Expo)

Location: `client-app/`

Config: edit `client-app/app.json` → `extra.apiBaseUrl`

```bash
cd client-app
npm install
npx expo start
```

Android build:
```bash
npx eas build -p android --profile production
```

---

## Assets

Persona avatars in `client-web/src/assets/`:
`DonaldTrump.png`, `ElonMask.png`, `KaneyWest.png`, `RichardNixon.png`, `AndrewJackson.png`, `MarjorieTaylorGreene.png`, `TuckerCarlson.png`, `LyndonBJohnson.png`, `MarkZuckerberg.png`, `JeffreyEpstein.png`

Other: `auth-bg.png`, `google.svg`, `eagle.png`
