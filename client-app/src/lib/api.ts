import { API_BASE_URL } from '../config';
import { getAccessToken, getClientId, refreshTokens } from './auth';
import * as SecureStore from 'expo-secure-store';
import { PERSONA_PROMPTS } from './personaPrompts';

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

export type OfflineContextItem = {
  sender: 'client' | 'admin';
  content: string;
  created_at: string;
};

const OFFLINE_CHATS_CACHE_PREFIX = 'offline_chats_v1:';
const OFFLINE_MESSAGES_CACHE_PREFIX = 'offline_messages_v1:';
const OFFLINE_CONTEXT_CACHE_PREFIX = 'offline_context_v1:';
const OFFLINE_MESSAGES_CACHE_MAX = 300;
const OFFLINE_CONTEXT_MAX_ITEMS = 16;
const OFFLINE_CONTEXT_SNIPPET_MAX = 220;

function chatsCacheKey(clientId: string) {
  return `${OFFLINE_CHATS_CACHE_PREFIX}${clientId}`;
}

function messagesCacheKey(chatId: string) {
  return `${OFFLINE_MESSAGES_CACHE_PREFIX}${chatId}`;
}

function contextCacheKey(chatId: string) {
  return `${OFFLINE_CONTEXT_CACHE_PREFIX}${chatId}`;
}

async function readCachedJSON<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await SecureStore.getItemAsync(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

async function writeCachedJSON(key: string, value: unknown) {
  try {
    await SecureStore.setItemAsync(key, JSON.stringify(value));
  } catch {
    // Ignore local cache errors so online flow keeps working.
  }
}

async function readCachedChats(clientId: string): Promise<ChatItem[]> {
  if (!clientId) return [];
  return readCachedJSON<ChatItem[]>(chatsCacheKey(clientId), []);
}

async function writeCachedChats(clientId: string, chats: ChatItem[]) {
  if (!clientId) return;
  await writeCachedJSON(chatsCacheKey(clientId), chats);
}

async function readCachedMessages(chatId: string): Promise<MessageItem[]> {
  if (!chatId) return [];
  return readCachedJSON<MessageItem[]>(messagesCacheKey(chatId), []);
}

function toOfflineContextItems(messages: MessageItem[]): OfflineContextItem[] {
  const out: OfflineContextItem[] = [];
  const start = Math.max(0, messages.length - OFFLINE_CONTEXT_MAX_ITEMS);
  for (let i = start; i < messages.length; i++) {
    const m = messages[i];
    if (!m || !m.content) continue;
    let content = m.content.trim();
    if (!content) continue;
    if (content.length > OFFLINE_CONTEXT_SNIPPET_MAX) {
      content = `${content.slice(0, OFFLINE_CONTEXT_SNIPPET_MAX).trimEnd()}...`;
    }
    out.push({
      sender: m.sender,
      content,
      created_at: m.created_at,
    });
  }
  return out;
}

async function writeCachedContext(chatId: string, messages: MessageItem[]) {
  if (!chatId) return;
  await writeCachedJSON(contextCacheKey(chatId), toOfflineContextItems(messages));
}

async function writeCachedMessages(chatId: string, messages: MessageItem[]) {
  if (!chatId) return;
  const trimmed = messages.length > OFFLINE_MESSAGES_CACHE_MAX ? messages.slice(-OFFLINE_MESSAGES_CACHE_MAX) : messages;
  await writeCachedJSON(messagesCacheKey(chatId), trimmed);
  await writeCachedContext(chatId, trimmed);
}

async function appendCachedMessage(chatId: string, message: MessageItem) {
  if (!chatId || !message?.id) return;
  const current = await readCachedMessages(chatId);
  if (current.some((m) => m.id === message.id)) return;
  current.push(message);
  await writeCachedMessages(chatId, current);
}

export async function getOfflineShortContext(chatId: string): Promise<OfflineContextItem[]> {
  if (!chatId) return [];
  return readCachedJSON<OfflineContextItem[]>(contextCacheKey(chatId), []);
}

export function getPersonaPrompt(persona?: string) {
  if (!persona) return '';
  return PERSONA_PROMPTS[persona] ?? '';
}

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
  try {
    const res = await fetchWithAuth(`/clients/${clientId}/chats`);
    if (res.status === 401) throw new Error('unauthorized');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const items = (data?.items ?? []) as ChatItem[];
    await writeCachedChats(clientId, items);
    return items;
  } catch (err) {
    if ((err as Error)?.message === 'unauthorized') throw err;
    return readCachedChats(clientId);
  }
}

export async function createChat(persona: string, title = '') {
  const clientId = await getClientId();
  if (!clientId) throw new Error('Missing client_id');
  const res = await fetchWithAuth(`/clients/${clientId}/chats`, {
    method: 'POST',
    body: JSON.stringify({ persona, title }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const created = (await res.json()) as ChatItem;
  const cached = await readCachedChats(clientId);
  await writeCachedChats(clientId, [created, ...cached.filter((c) => c.id !== created.id)]);
  return created;
}

export async function fetchMessages(chatId: string) {
  try {
    const res = await fetchWithAuth(`/chats/${chatId}/messages`);
    if (res.status === 401) throw new Error('unauthorized');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const items = (data?.items ?? []) as MessageItem[];
    await writeCachedMessages(chatId, items);
    return items;
  } catch (err) {
    if ((err as Error)?.message === 'unauthorized') throw err;
    const cached = await readCachedMessages(chatId);
    if (cached.length > 0) {
      await writeCachedContext(chatId, cached);
    }
    return cached;
  }
}

export async function sendMessage(chatId: string, content: string, persona?: string) {
  const personaPrompt = getPersonaPrompt(persona);
  const res = await fetchWithAuth(`/chats/${chatId}/messages`, {
    method: 'POST',
    body: JSON.stringify({ content, persona, persona_prompt: personaPrompt || undefined }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const msg = (await res.json()) as MessageItem;
  await appendCachedMessage(chatId, msg);
  return msg;
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
