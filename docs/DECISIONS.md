# Decisions

- Mobile: React Native + Expo
- Web client: React + Vite (same UI flows as mobile, but separate app)
- Admin: React + Vite
- Backend: Go + PostgreSQL
- Realtime: WebSocket
- Auth: email+password + Google OAuth
- Encryption: TLS + field-level encryption at rest

Notes:
- Google auth: unified OAuth flow with backend, mobile via Expo AuthSession.
- LLM service: separate Python worker calling server API.

