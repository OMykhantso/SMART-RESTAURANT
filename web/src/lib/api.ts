import axios, { AxiosError, type AxiosRequestConfig } from 'axios';
import type { ApiErrorBody, AuthResponse } from './types';

const ACCESS_KEY = 'sr.access';
const REFRESH_KEY = 'sr.refresh';

export const tokens = {
  get access() {
    return localStorage.getItem(ACCESS_KEY);
  },
  get refresh() {
    return localStorage.getItem(REFRESH_KEY);
  },
  set(access: string, refresh: string) {
    localStorage.setItem(ACCESS_KEY, access);
    localStorage.setItem(REFRESH_KEY, refresh);
    window.dispatchEvent(new Event('sr:tokens'));
  },
  clear() {
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
    window.dispatchEvent(new Event('sr:tokens'));
  },
};

export const http = axios.create({ baseURL: '/api', timeout: 20000 });

http.interceptors.request.use((config) => {
  const access = tokens.access;
  if (access) config.headers.set('Authorization', `Bearer ${access}`);
  return config;
});

/** Single-flight оновлення access-токена: паралельні 401 чекають один і той самий refresh. */
let refreshing: Promise<string | null> | null = null;
async function refreshAccess(): Promise<string | null> {
  const refresh = tokens.refresh;
  if (!refresh) return null;
  refreshing ??= axios
    .post<AuthResponse>('/api/auth/refresh', { refreshToken: refresh })
    .then((res) => {
      tokens.set(res.data.accessToken, res.data.refreshToken);
      return res.data.accessToken;
    })
    .catch(() => {
      tokens.clear();
      return null;
    })
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

http.interceptors.response.use(
  (res) => res,
  async (error: AxiosError<ApiErrorBody>) => {
    const original = error.config as AxiosRequestConfig & { _retry?: boolean };
    const code = error.response?.data?.error?.code;
    if (error.response?.status === 401 && code === 'TOKEN_INVALID' && !original._retry && tokens.refresh) {
      original._retry = true;
      const fresh = await refreshAccess();
      if (fresh) {
        original.headers = { ...(original.headers ?? {}), Authorization: `Bearer ${fresh}` };
        return http.request(original);
      }
    }
    if (error.response?.status === 401 && code === 'UNAUTHORIZED' && !tokens.refresh) tokens.clear();
    return Promise.reject(error);
  },
);

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

export function toApiError(e: unknown): ApiError {
  if (e instanceof ApiError) return e;
  if (axios.isAxiosError(e)) {
    const body = e.response?.data as ApiErrorBody | undefined;
    if (body?.error) return new ApiError(body.error.message, body.error.code, e.response!.status, body.error.details);
    if (!e.response) return new ApiError('Сервер недоступний. Перевірте, чи запущено backend.', 'NETWORK', 0);
    return new ApiError(`Помилка ${e.response.status}`, 'HTTP', e.response.status);
  }
  return new ApiError(e instanceof Error ? e.message : 'Невідома помилка', 'UNKNOWN', 0);
}

export function errorMessage(e: unknown): string {
  const err = toApiError(e);
  if (err.code === 'VALIDATION_ERROR' && Array.isArray(err.details) && err.details[0]) {
    return (err.details as { message: string }[])[0].message;
  }
  return err.message;
}

export async function get<T>(url: string, params?: Record<string, unknown>): Promise<T> {
  try {
    return (await http.get<T>(url, { params })).data;
  } catch (e) {
    throw toApiError(e);
  }
}

export async function send<T>(method: 'post' | 'patch' | 'put' | 'delete', url: string, data?: unknown, headers?: Record<string, string>): Promise<T> {
  try {
    return (await http.request<T>({ method, url, data, headers })).data;
  } catch (e) {
    throw toApiError(e);
  }
}

export const api = {
  get,
  post: <T,>(url: string, data?: unknown, headers?: Record<string, string>) => send<T>('post', url, data, headers),
  patch: <T,>(url: string, data?: unknown) => send<T>('patch', url, data),
  del: <T,>(url: string) => send<T>('delete', url),
};
