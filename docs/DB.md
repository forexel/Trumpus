# DB (draft)

## Tables (minimal)

### users
- id (uuid)
- email (text, unique)
- password_hash (text, nullable if google-only)
- google_sub (text, nullable, unique)
- created_at, updated_at

### chats
- id (uuid)
- user_id (uuid, fk users)
- title (text)
- created_at, updated_at

### messages
- id (uuid)
- chat_id (uuid, fk chats)
- sender_type (enum: user|admin|llm)
- body_ciphertext (text)
- body_nonce (text)
- created_at

### admin_users
- id (uuid)
- email (text, unique)
- password_hash (text)
- created_at

