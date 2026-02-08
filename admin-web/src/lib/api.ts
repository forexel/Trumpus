const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? 'http://localhost:8000/api/v1'

export type AdminChatSummary = {
  id: string
  title: string
  persona: string
  unread_for_admin: number
}

export type AdminClient = {
  id: string
  name: string
  chats: AdminChatSummary[]
}

export type AdminChat = {
  id: string
  client_id: string
  client_name: string
  title: string
  persona: string
  unread_for_admin: number
  last_message_at: string
}

export type Message = {
  id: string
  chat_id: string
  sender: 'client' | 'admin'
  content: string
  created_at: string
}

export function getWsBase() {
  return API_BASE.replace(/^http/, 'ws')
}

async function apiFetch(path: string, options: RequestInit = {}) {
  const headers = new Headers(options.headers)
  headers.set('Content-Type', 'application/json')
  const res = await fetch(`${API_BASE}${path}`, { ...options, headers, credentials: 'include' })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.error || `Request failed: ${res.status}`)
  }
  return res.json()
}

export async function adminLogin(username: string, password: string) {
  return apiFetch('/admin/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  }) as Promise<{ ok: boolean }>
}

export async function getAdminSession() {
  return apiFetch('/admin/session') as Promise<{ ok: boolean }>
}

export async function adminLogout() {
  return apiFetch('/admin/logout', { method: 'POST' }) as Promise<{ ok: boolean }>
}

export async function fetchClients() {
  return apiFetch('/admin/clients') as Promise<{ items: AdminClient[] }>
}

export async function fetchChats() {
  return apiFetch('/admin/chats') as Promise<{ items: AdminChat[] }>
}

export async function fetchChatMessages(chatId: string) {
  return apiFetch(`/admin/chats/${chatId}/messages`) as Promise<{
    chat: AdminChat
    messages: Message[]
  }>
}

export async function sendChatMessage(chatId: string, content: string) {
  return apiFetch(`/admin/chats/${chatId}/messages`, {
    method: 'POST',
    body: JSON.stringify({ content }),
  }) as Promise<Message>
}

export async function markChatRead(chatId: string) {
  return apiFetch(`/admin/chats/${chatId}/read`, {
    method: 'POST',
  })
}
