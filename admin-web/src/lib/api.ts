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

export type AnalyticsBucket = {
  new_registrations: number
  dau: number
  new_chats: number
  new_messages: number
  home_visitors: number
}

export type AnalyticsSeriesPoint = {
  day: string
  value: number
}

export type AnalyticsResponse = {
  day: string
  period: {
    from: string
    to: string
  }
  day_metrics: AnalyticsBucket
  period_metrics: AnalyticsBucket
  totals: {
    registrations: number
    chats: number
    messages: number
  }
  today: {
    new_registrations: { value: number; delta: number }
    new_chats: { value: number; delta: number }
    new_messages: { value: number; delta: number }
    home_visitors: { value: number; delta: number }
  }
  series: {
    visits_by_day: AnalyticsSeriesPoint[]
    registrations_by_day: AnalyticsSeriesPoint[]
    dau_by_day: AnalyticsSeriesPoint[]
    chats_by_day: AnalyticsSeriesPoint[]
    messages_by_day: AnalyticsSeriesPoint[]
  }
}

export function getWsBase() {
  return API_BASE.replace(/^http/, 'ws')
}

async function apiFetch(path: string, options: RequestInit = {}) {
  const headers = new Headers(options.headers)
  headers.set('Content-Type', 'application/json')
  const res = await fetch(`${API_BASE}${path}`, { ...options, headers, credentials: 'include' })
  if (!res.ok) {
    if (res.status === 401) {
      if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
        window.location.href = '/login'
      }
      throw new Error('unauthorized')
    }
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

export async function deleteAdminChat(chatId: string) {
  return apiFetch(`/admin/chats/${chatId}`, {
    method: 'DELETE',
  }) as Promise<{ ok: boolean; chat_id: string }>
}

export async function sendChatMessage(chatId: string, content: string) {
  return apiFetch(`/admin/chats/${chatId}/messages`, {
    method: 'POST',
    body: JSON.stringify({ content }),
  }) as Promise<Message>
}

export async function resendClientMessage(chatId: string, messageId: string) {
  return apiFetch(`/admin/chats/${chatId}/messages/${messageId}/resend`, {
    method: 'POST',
  }) as Promise<{ ok: boolean; queued: boolean; chat_id: string; message_id: string }>
}

export async function fetchMessageDebugPlan(chatId: string, messageId: string) {
  return apiFetch(`/admin/chats/${chatId}/messages/${messageId}/debug`) as Promise<{
    ok: boolean
    chat_id: string
    message: Message
    debug: Record<string, unknown>
  }>
}

export async function markChatRead(chatId: string) {
  return apiFetch(`/admin/chats/${chatId}/read`, {
    method: 'POST',
  })
}

export async function fetchAnalytics(day: string, from: string, to: string) {
  const q = new URLSearchParams({ day, from, to })
  return apiFetch(`/admin/analytics?${q.toString()}`) as Promise<AnalyticsResponse>
}

export async function generateSyntheticDay(day: string, visitsTarget?: number) {
  const payload: { day: string; visits_target?: number } = { day }
  if (Number.isFinite(visitsTarget) && (visitsTarget ?? 0) > 0) {
    payload.visits_target = Math.floor(visitsTarget as number)
  }
  return apiFetch('/admin/synthetic/generate', {
    method: 'POST',
    body: JSON.stringify(payload),
  }) as Promise<{
    ok: boolean
    day: string
    visits_target: number
    registrations_target: number
    registrations_created: number
    chats_created: number
    messages_created: number
    note: string
  }>
}
