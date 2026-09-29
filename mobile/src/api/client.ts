import { apiConfig } from '../config';
import { storage } from '../lib/storage';
import type { ApiErrorBody, AuthResponse } from './types';

const ACCESS = 'sr.access';
const REFRESH = 'sr.refresh';

let accessToken: string | null = null;
let refreshToken: string | null = null;
const listeners = new Set<() => void>();

export const session = {
  get access() {
    return accessToken;
  },
  async load() {
    accessToken = await storage.get(ACCESS);
    refreshToken = await storage.get(REFRESH);
  },
  async set(access: string, refresh: string) {
    accessToken = access;
    refreshToken = refresh;
    await storage.set(ACCESS, access);
    await storage.set(REFRESH, refresh);
    listeners.forEach((l) => l());
  },
  async clear() {
    accessToken = null;
    refreshToken = null;
    await storage.remove(ACCESS);
    await storage.remove(REFRESH);
    listeners.forEach((l) => l());
  },
  get refresh() {
    return refreshToken;
  },
  subscribe(fn: () => void) {
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  },
};

export class ApiError extends Error {
  constructor(
    message: string,
    public code: string,
    public status: number,
    public details?: unknown,
  ) {
    super(message);
  }
}

let refreshing: Promise<boolean> | null = null;
async function tryRefresh(): Promise<boolean> {
  if (!refreshToken) return false;
  refreshing ??= (async () => {
    try {
      const res = await fetch(`${apiConfig.baseUrl}/api/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
      if (!res.ok) {
        await session.clear();
        return false;
      }
      const data = (await res.json()) as AuthResponse;
      await session.set(data.accessToken, data.refreshToken);
      return true;
    } catch {
      return false;
    } finally {
      setTimeout(() => (refreshing = null), 0);
    }
  })();
  return refreshing;
}

async function request<T>(method: string, path: string, body?: unknown, headers: Record<string, string> = {}, retried = false): Promise<T> {
  let res: Response;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    res = await fetch(`${apiConfig.baseUrl}/api${path}`, {
      method,
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        ...headers,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(`Немає зʼєднання з сервером (${apiConfig.baseUrl}). Перевірте, що телефон і компʼютер в одній Wi-Fi мережі.`, 'NETWORK', 0);
  } finally {
    clearTimeout(timer);
  }
  if (res.status === 204) return undefined as T;
  const data = (await res.json().catch(() => null)) as (ApiErrorBody & T) | null;
  if (!res.ok) {
    const err = data?.error;
    if (res.status === 401 && err?.code === 'TOKEN_INVALID' && !retried && (await tryRefresh())) {
      return request<T>(method, path, body, headers, true);
    }
    let message = err?.message ?? `Помилка ${res.status}`;
    if (err?.code === 'VALIDATION_ERROR' && Array.isArray(err.details) && err.details[0]) message = (err.details[0] as { message: string }).message;
    throw new ApiError(message, err?.code ?? 'HTTP', res.status, err?.details);
  }
  return data as T;
}

function qs(params?: Record<string, unknown>) {
  if (!params) return '';
  const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '');
  if (!entries.length) return '';
  return '?' + entries.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`).join('&');
}

export const api = {
  get: <T,>(path: string, params?: Record<string, unknown>) => request<T>('GET', path + qs(params)),
  post: <T,>(path: string, body?: unknown, headers?: Record<string, string>) => request<T>('POST', path, body ?? {}, headers),
  patch: <T,>(path: string, body?: unknown) => request<T>('PATCH', path, body ?? {}),
};

export function imageUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  return url.startsWith('/') ? `${apiConfig.baseUrl}${url}` : url;
}
