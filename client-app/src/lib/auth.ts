import * as SecureStore from 'expo-secure-store';
import { API_BASE_URL } from '../config';

const ACCESS_KEY = 'access_token';
const REFRESH_KEY = 'refresh_token';
const ACCESS_EXPIRES_KEY = 'access_expires';
const CLIENT_ID_KEY = 'client_id';
const CLIENT_EMAIL_KEY = 'client_email';

export type AuthTokens = {
  access_token: string;
  refresh_token: string;
  access_expires?: string;
  email?: string;
  client_id?: string;
};

export async function saveTokens(tokens: AuthTokens) {
  if (tokens.access_token) await SecureStore.setItemAsync(ACCESS_KEY, tokens.access_token);
  if (tokens.refresh_token) await SecureStore.setItemAsync(REFRESH_KEY, tokens.refresh_token);
  if (tokens.access_expires) await SecureStore.setItemAsync(ACCESS_EXPIRES_KEY, tokens.access_expires);
  if (tokens.client_id) await SecureStore.setItemAsync(CLIENT_ID_KEY, tokens.client_id);
  if (tokens.email) await SecureStore.setItemAsync(CLIENT_EMAIL_KEY, tokens.email);
}

export async function getAccessToken() {
  return SecureStore.getItemAsync(ACCESS_KEY);
}

export async function getRefreshToken() {
  return SecureStore.getItemAsync(REFRESH_KEY);
}

export async function getClientId() {
  return SecureStore.getItemAsync(CLIENT_ID_KEY);
}

export async function clearTokens() {
  await SecureStore.deleteItemAsync(ACCESS_KEY);
  await SecureStore.deleteItemAsync(REFRESH_KEY);
  await SecureStore.deleteItemAsync(ACCESS_EXPIRES_KEY);
  await SecureStore.deleteItemAsync(CLIENT_ID_KEY);
  await SecureStore.deleteItemAsync(CLIENT_EMAIL_KEY);
}

export async function refreshTokens() {
  const refresh = await getRefreshToken();
  if (!refresh) return null;
  const res = await fetch(`${API_BASE_URL}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: refresh }),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as AuthTokens;
  if (data.access_token && data.refresh_token) {
    await saveTokens(data);
    return data;
  }
  return null;
}

export async function getSession() {
  const token = await getAccessToken();
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let res = await fetch(`${API_BASE_URL}/auth/session`, { headers });
  if (res.status === 401) {
    const refreshed = await refreshTokens();
    if (refreshed?.access_token) {
      res = await fetch(`${API_BASE_URL}/auth/session`, {
        headers: { Authorization: `Bearer ${refreshed.access_token}` },
      });
    }
  }
  if (!res.ok) return null;
  return (await res.json()) as { client_id: string; email: string };
}
