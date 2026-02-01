const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? 'http://localhost:8000/api/v1'

export type ChatSummary = {
  id: string
  title: string
  persona: string
  unread_for_admin?: number
}

export type Message = {
  id: string
  chat_id: string
  sender: 'client' | 'admin'
  content: string
  created_at: string
}

export function getClientId() {
  return localStorage.getItem('client_id') ?? ''
}

export async function fetchChats(clientId: string) {
  const res = await fetch(`${API_BASE}/clients/${clientId}/chats`)
  if (!res.ok) throw new Error('Failed to load chats')
  return (await res.json()) as { items: ChatSummary[] }
}

export async function createChat(clientId: string, persona: string) {
  const res = await fetch(`${API_BASE}/clients/${clientId}/chats`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ persona }),
  })
  if (!res.ok) throw new Error('Failed to create chat')
  return (await res.json()) as ChatSummary
}

export async function fetchMessages(chatId: string) {
  const res = await fetch(`${API_BASE}/chats/${chatId}/messages`)
  if (!res.ok) throw new Error('Failed to load messages')
  return (await res.json()) as { items: Message[] }
}

export async function sendMessage(chatId: string, content: string) {
  const res = await fetch(`${API_BASE}/chats/${chatId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  })
  if (!res.ok) throw new Error('Failed to send message')
  return (await res.json()) as Message
}

export async function login(email: string, password: string) {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  if (!res.ok) throw new Error('Invalid email or password')
  return (await res.json()) as { token: string; email: string; client_id: string }
}

export async function register(email: string, password: string) {
  const res = await fetch(`${API_BASE}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  if (!res.ok) throw new Error('Registration failed')
  return (await res.json()) as { token: string; email: string; client_id: string }
}

export async function forgotPassword(email: string) {
  const res = await fetch(`${API_BASE}/auth/forgot-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  })
  if (!res.ok) throw new Error('Failed to send email')
  return (await res.json()) as { sent: boolean }
}

export async function resetPassword(email: string, oldPassword: string, newPassword: string) {
  const res = await fetch(`${API_BASE}/auth/reset-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, old_password: oldPassword, new_password: newPassword }),
  })
  if (!res.ok) throw new Error('Failed to reset password')
  return (await res.json()) as { token: string; email: string; client_id: string }
}
