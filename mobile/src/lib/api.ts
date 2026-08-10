import Constants from 'expo-constants';
import { BackupSnapshot, SessionUser } from '../types';

export interface AuthResponse {
  token: string;
  user: SessionUser;
}

function resolveApiUrl() {
  const fromEnv = process.env.EXPO_PUBLIC_API_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/$/, '');
  const hostUri = Constants.expoConfig?.hostUri;
  const host = hostUri?.split(':')[0];
  return `http://${host || '10.0.2.2'}:8080/api/v1`;
}

export const API_URL = resolveApiUrl();

export async function apiRequest<T>(path: string, options: RequestInit = {}, token?: string): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(`${API_URL}${path}`, {
      ...options,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || `请求失败（${response.status}）`);
    return payload as T;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw new Error('连接服务超时，请检查服务地址或网络');
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export function registerAccount(name: string, email: string, password: string) {
  return apiRequest<AuthResponse>('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ name, email: email.trim().toLowerCase(), password }),
  });
}

export function loginAccount(email: string, password: string) {
  return apiRequest<AuthResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
  });
}

export function uploadBackup(token: string, snapshot: BackupSnapshot) {
  return apiRequest<{ backedUpAt: string }>('/sync', {
    method: 'POST',
    body: JSON.stringify({ snapshot }),
  }, token);
}

export function downloadLatestBackup(token: string) {
  return apiRequest<{ snapshot: BackupSnapshot | null; backedUpAt?: string }>('/sync/latest', {}, token);
}
