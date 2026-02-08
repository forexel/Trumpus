import { API_BASE_URL } from '../config';
import { getAccessToken, getClientId, refreshTokens } from './auth';

export type ChatItem = {
  id: string;
  title: string;
  persona: string;
  last_message_at?: string;
};

export type MessageItem = {
  id: string;
  chat_id: string;
  sender: 'client' | 'admin';
  content: string;
  created_at: string;
};

async function fetchWithAuth(path: string, init: RequestInit = {}) {
  const access = await getAccessToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(init.headers || {}),
    ...(access ? { Authorization: `Bearer ${access}` } : {}),
  };
  const res = await fetch(`${API_BASE_URL}${path}`, { ...init, headers });
  if (res.status === 401) {
    const refreshed = await refreshTokens();
    if (!refreshed?.access_token) {
      return res;
    }
    const retryHeaders = {
      ...headers,
      Authorization: `Bearer ${refreshed.access_token}`,
    };
    return fetch(`${API_BASE_URL}${path}`, { ...init, headers: retryHeaders });
  }
  return res;
}

export async function fetchChats() {
  const clientId = await getClientId();
  if (!clientId) return [];
  const res = await fetchWithAuth(`/clients/${clientId}/chats`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return (data?.items ?? []) as ChatItem[];
}

export async function createChat(persona: string, title = '') {
  const clientId = await getClientId();
  if (!clientId) throw new Error('Missing client_id');
  const res = await fetchWithAuth(`/clients/${clientId}/chats`, {
    method: 'POST',
    body: JSON.stringify({ persona, title }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as ChatItem;
}

export async function fetchMessages(chatId: string) {
  const res = await fetchWithAuth(`/chats/${chatId}/messages`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return (data?.items ?? []) as MessageItem[];
}

export async function sendMessage(chatId: string, content: string, persona?: string) {
  const res = await fetchWithAuth(`/chats/${chatId}/messages`, {
    method: 'POST',
    body: JSON.stringify({ content, persona }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as MessageItem;
}

export async function resetPasswordWithToken(token: string, newPassword: string) {
  const res = await fetch(`${API_BASE_URL}/auth/reset-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, new_password: newPassword }),
  });
  if (!res.ok) throw new Error('Failed to reset password');
  return (await res.json()) as {
    access_token: string;
    refresh_token: string;
    access_expires?: string;
    email: string;
    client_id: string;
  };
}

export function getWsBase() {
  return API_BASE_URL.replace(/^http/, 'ws');
}
