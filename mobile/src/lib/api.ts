import Constants from 'expo-constants';
import { AIDailyContext, AIFoodEstimate, AIHistoryItem, AISummaryRecord, BackupSnapshot, SessionUser } from '../types';

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

export async function apiRequest<T>(path: string, options: RequestInit = {}, token?: string, timeoutMs = 10000): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
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

export function getDailyAISummary(token: string, date: string) {
  return apiRequest<{ summary: AISummaryRecord | null; remaining: number }>(`/ai/daily-summary?date=${encodeURIComponent(date)}`, {}, token);
}

export function generateDailyAISummary(token: string, context: AIDailyContext, force = false) {
  return apiRequest<{ summary: AISummaryRecord; cached: boolean; remaining: number }>('/ai/daily-summary', {
    method: 'POST',
    body: JSON.stringify({ context, force }),
  }, token, 60000);
}

export function getDailyAIPlan(token: string, date: string) {
  return apiRequest<{ plan: AISummaryRecord | null; remaining: number }>(`/ai/daily-plan?date=${encodeURIComponent(date)}`, {}, token);
}

export function generateDailyAIPlan(token: string, date: string, contexts: AIDailyContext[], force = false) {
  return apiRequest<{ plan: AISummaryRecord; cached: boolean; remaining: number }>('/ai/daily-plan', {
    method: 'POST',
    body: JSON.stringify({ date, contexts, force }),
  }, token, 60000);
}

export function getAIHistory(token: string, type: 'all' | 'daily_summary' | 'question' = 'all', limit = 20) {
  return apiRequest<{ items: AIHistoryItem[] }>(`/ai/history?type=${type}&limit=${limit}`, {}, token);
}

export function estimateFoodWithAI(token: string, name: string, description: string) {
  return apiRequest<{ estimate: AIFoodEstimate; remaining: number }>('/ai/food-estimate', {
    method: 'POST',
    body: JSON.stringify({ name, description }),
  }, token, 60000);
}

export function askNutritionAI(token: string, question: string, context: AIDailyContext) {
  return apiRequest<{ answer: string; interactionId: string; remaining: number }>('/ai/ask', {
    method: 'POST',
    body: JSON.stringify({ question, context }),
  }, token, 60000);
}
