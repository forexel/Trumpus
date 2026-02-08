const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? 'http://localhost:8000/api/v1'

const LAST_CHAT_KEY = 'last_chat_id'
const CLIENT_ID_KEY = 'client_id'
const CLIENT_EMAIL_KEY = 'client_email'
const ACCESS_TOKEN_KEY = 'access_token'
const REFRESH_TOKEN_KEY = 'refresh_token'
const ACCESS_EXPIRES_KEY = 'access_expires'

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
  return localStorage.getItem(CLIENT_ID_KEY) ?? ''
}

export function getWsBase() {
  return API_BASE.replace(/^http/, 'ws')
}

export function getAccessToken() {
  return localStorage.getItem(ACCESS_TOKEN_KEY) ?? ''
}

export function getRefreshToken() {
  return localStorage.getItem(REFRESH_TOKEN_KEY) ?? ''
}

function setAuthTokens(tokens: { access_token: string; refresh_token: string; access_expires?: string }) {
  localStorage.setItem(ACCESS_TOKEN_KEY, tokens.access_token)
  localStorage.setItem(REFRESH_TOKEN_KEY, tokens.refresh_token)
  if (tokens.access_expires) {
    localStorage.setItem(ACCESS_EXPIRES_KEY, tokens.access_expires)
  }
}

function clearAuthTokens() {
  localStorage.removeItem(ACCESS_TOKEN_KEY)
  localStorage.removeItem(REFRESH_TOKEN_KEY)
  localStorage.removeItem(ACCESS_EXPIRES_KEY)
}

export function setClientSession(clientId: string, email: string) {
  if (clientId) localStorage.setItem(CLIENT_ID_KEY, clientId)
  if (email) localStorage.setItem(CLIENT_EMAIL_KEY, email)
}

export function clearClientSession() {
  localStorage.removeItem(CLIENT_ID_KEY)
  localStorage.removeItem(CLIENT_EMAIL_KEY)
}

async function refreshAccessToken() {
  const refreshToken = getRefreshToken()
  const res = await fetch(`${API_BASE}/auth/refresh`, {
    method: 'POST',
    headers: refreshToken ? { 'Content-Type': 'application/json' } : undefined,
    credentials: 'include',
    body: refreshToken ? JSON.stringify({ refresh_token: refreshToken }) : undefined,
  })
  if (!res.ok) return false
  const data = (await res.json()) as { access_token: string; refresh_token: string; access_expires?: string }
  if (data.access_token && data.refresh_token) {
    setAuthTokens(data)
    return true
  }
  return false
}

async function fetchWithAuth(input: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers ?? {})
  const token = getAccessToken()
  if (token) headers.set('Authorization', `Bearer ${token}`)
  if (!headers.has('Content-Type') && init.body) {
    headers.set('Content-Type', 'application/json')
  }
  const res = await fetch(input, { ...init, headers, credentials: 'include' })
  if (res.status !== 401) return res

  const refreshed = await refreshAccessToken()
  if (!refreshed) return res
  const retryHeaders = new Headers(init.headers ?? {})
  const newToken = getAccessToken()
  if (newToken) retryHeaders.set('Authorization', `Bearer ${newToken}`)
  if (!retryHeaders.has('Content-Type') && init.body) {
    retryHeaders.set('Content-Type', 'application/json')
  }
  return fetch(input, { ...init, headers: retryHeaders, credentials: 'include' })
}

export function getLastChatId() {
  const saved = localStorage.getItem(LAST_CHAT_KEY)
  return saved ?? ''
}

export function setLastChatId(chatId: string) {
  localStorage.setItem(LAST_CHAT_KEY, chatId)
}

export async function getSession() {
  const headers = new Headers()
  const token = getAccessToken()
  if (token) headers.set('Authorization', `Bearer ${token}`)
  let res = await fetch(`${API_BASE}/auth/session`, { headers, credentials: 'include' })
  if (res.status === 401) {
    const refreshed = await refreshAccessToken()
    if (refreshed) {
      const retryHeaders = new Headers()
      const newToken = getAccessToken()
      if (newToken) retryHeaders.set('Authorization', `Bearer ${newToken}`)
      res = await fetch(`${API_BASE}/auth/session`, { headers: retryHeaders, credentials: 'include' })
    }
  }
  if (!res.ok) {
    clearAuthTokens()
    clearClientSession()
    return null
  }
  const data = (await res.json()) as { client_id: string; email: string }
  setClientSession(data.client_id, data.email)
  return data
}

export async function logout() {
  await fetch(`${API_BASE}/auth/logout`, { method: 'POST', credentials: 'include' })
  clearAuthTokens()
  clearClientSession()
}

export async function fetchChats(clientId: string) {
  const res = await fetchWithAuth(`${API_BASE}/clients/${clientId}/chats`)
  if (!res.ok) throw new Error('Failed to load chats')
  return (await res.json()) as { items: ChatSummary[] }
}

export async function createChat(clientId: string, persona: string) {
  const res = await fetchWithAuth(`${API_BASE}/clients/${clientId}/chats`, {
    method: 'POST',
    body: JSON.stringify({ persona }),
  })
  if (!res.ok) throw new Error('Failed to create chat')
  const created = (await res.json()) as ChatSummary
  setLastChatId(created.id)
  return created
}

export async function fetchMessages(chatId: string) {
  const res = await fetchWithAuth(`${API_BASE}/chats/${chatId}/messages`)
  if (!res.ok) throw new Error('Failed to load messages')
  return (await res.json()) as { items: Message[] }
}

export function deleteChat(_chatId: string): void {
  // Not implemented on the server yet.
}

export async function sendMessage(chatId: string, content: string, persona?: string) {
  const res = await fetchWithAuth(`${API_BASE}/chats/${chatId}/messages`, {
    method: 'POST',
    body: JSON.stringify({ content, persona }),
  })
  if (!res.ok) throw new Error('Failed to send message')
  return (await res.json()) as Message
}

// Update chat title
export function updateChatTitle(_chatId: string, _title: string): void {
  // Not implemented on the server yet.
}

export async function login(email: string, password: string) {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ email, password }),
  })
  if (!res.ok) {
    throw new Error(await parseAuthError(res, 'Invalid email or password'))
  }
  const data = (await res.json()) as { access_token: string; refresh_token: string; email: string; client_id: string; access_expires?: string }
  if (data.access_token && data.refresh_token) {
    setAuthTokens(data)
  }
  setClientSession(data.client_id, data.email)
  return data
}

export async function register(email: string, password: string) {
  const res = await fetch(`${API_BASE}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ email, password }),
  })
  if (!res.ok) {
    throw new Error(await parseAuthError(res, 'Registration failed'))
  }
  const data = (await res.json()) as { access_token: string; refresh_token: string; email: string; client_id: string; access_expires?: string }
  if (data.access_token && data.refresh_token) {
    setAuthTokens(data)
  }
  setClientSession(data.client_id, data.email)
  return data
}

async function parseAuthError(res: Response, fallback: string) {
  if (res.status === 429) return 'Too many requests. Try again later.'
  let raw = ''
  try {
    const data = (await res.json()) as { error?: string }
    raw = data?.error ?? ''
  } catch {
    return fallback
  }
  const normalized = raw.trim().toLowerCase()
  if (normalized === 'invalid email') return 'Invalid email address.'
  if (normalized.startsWith('password length')) return 'Password must be 6-128 characters.'
  if (normalized === 'invalid credentials') return 'Email or password is incorrect.'
  if (normalized === 'user already exists') return 'An account with this email already exists.'
  if (normalized === 'invalid json') return 'Invalid request. Please try again.'
  if (normalized !== '') return raw
  return fallback
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

export async function resetPassword(token: string, newPassword: string) {
  const res = await fetch(`${API_BASE}/auth/reset-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ token, new_password: newPassword }),
  })
  if (!res.ok) throw new Error('Failed to reset password')
  const data = (await res.json()) as { access_token: string; refresh_token: string; email: string; client_id: string; access_expires?: string }
  if (data.access_token && data.refresh_token) {
    setAuthTokens(data)
  }
  setClientSession(data.client_id, data.email)
  return data
}

export async function resetPasswordWithOld(email: string, oldPassword: string, newPassword: string) {
  const res = await fetch(`${API_BASE}/auth/reset-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ email, old_password: oldPassword, new_password: newPassword }),
  })
  if (!res.ok) throw new Error('Failed to reset password')
  const data = (await res.json()) as { access_token: string; refresh_token: string; email: string; client_id: string; access_expires?: string }
  if (data.access_token && data.refresh_token) {
    setAuthTokens(data)
  }
  setClientSession(data.client_id, data.email)
  return data
}
