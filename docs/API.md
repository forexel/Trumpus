# API

Base URL: `/api/v1`

## Health
- GET `/health`

## Auth
- POST `/auth/register` (stub)
- POST `/auth/login` (stub)
- POST `/auth/forgot-password`
- POST `/auth/reset-password`
- GET `/auth/session`
- POST `/auth/logout`

### Google OAuth (client-web)
- GET `/auth/google/start?redirect={url}`
- GET `/auth/google/callback`

### Password Reset

- POST `/auth/forgot-password`
	- body: `{ "email": "user@mail.com" }`
	- response: `{ "sent": true }`
	- Sends a reset link via SMTP if the user exists.

- POST `/auth/reset-password`
	- token flow: `{ "token": "...", "new_password": "..." }`
	- legacy flow: `{ "email": "...", "old_password": "...", "new_password": "..." }`
	- response: `{ "access_token": "...", "refresh_token": "...", "email": "...", "client_id": "..." }`

## Client
- GET `/clients/{clientId}/chats`
- POST `/clients/{clientId}/chats`

## Chats
- GET `/chats/{chatId}/messages`
- POST `/chats/{chatId}/messages`

## Admin
- POST `/admin/login`
- GET `/admin/session`
- POST `/admin/logout`
- GET `/admin/clients`
- GET `/admin/chats`
- GET `/admin/chats/{chatId}/messages`
- POST `/admin/chats/{chatId}/messages`
- POST `/admin/chats/{chatId}/read`

## LLM (planned)
- POST `/llm/respond`
