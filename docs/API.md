# API

Base URL: `/api/v1`

## Health
- GET `/health`

## Auth
- POST `/auth/register` (stub)
- POST `/auth/login` (stub)
- POST `/auth/forgot-password` (stub)

### Google OAuth (client-web)
- GET `/auth/google/start?redirect={url}`
- GET `/auth/google/callback`

## Client
- GET `/clients/{clientId}/chats`
- POST `/clients/{clientId}/chats`

## Chats
- GET `/chats/{chatId}/messages`
- POST `/chats/{chatId}/messages`

## Admin
- POST `/admin/login`
- GET `/admin/clients`
- GET `/admin/chats`
- GET `/admin/chats/{chatId}/messages`
- POST `/admin/chats/{chatId}/messages`
- POST `/admin/chats/{chatId}/read`

## LLM (planned)
- POST `/llm/respond`
