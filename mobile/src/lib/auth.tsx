import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api, session } from '../api/client';
import type { AuthResponse, User } from '../api/types';
import { apiConfig } from '../config';

interface AuthState {
  user: User | null;
  ready: boolean;
  login: (email: string, password: string) => Promise<User>;
  register: (data: { name: string; email: string; phone?: string; password: string }) => Promise<User>;
  logout: () => Promise<void>;
  reload: () => Promise<void>;
}

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const qc = useQueryClient();

  const reload = useCallback(async () => {
    if (!session.access && !session.refresh) {
      setUser(null);
      return;
    }
    try {
      setUser(await api.get<User>('/auth/me'));
    } catch {
      setUser(null);
    }
  }, []);

  useEffect(() => {
    (async () => {
      await apiConfig.load();
      await session.load();
      await reload();
      setReady(true);
    })();
    return session.subscribe(() => {
      if (!session.access) setUser(null);
    });
  }, [reload]);

  const handle = useCallback(
    async (res: AuthResponse) => {
      if (res.user.role !== 'CLIENT') {
        throw new Error('Мобільний застосунок призначений для гостей. Працівники користуються web-панеллю.');
      }
      await session.set(res.accessToken, res.refreshToken);
      qc.clear();
      setUser(res.user);
      return res.user;
    },
    [qc],
  );

  const value = useMemo<AuthState>(
    () => ({
      user,
      ready,
      login: async (email, password) => handle(await api.post<AuthResponse>('/auth/login', { email, password })),
      register: async (data) => handle(await api.post<AuthResponse>('/auth/register', data)),
      logout: async () => {
        if (session.refresh) await api.post('/auth/logout', { refreshToken: session.refresh }).catch(() => undefined);
        await session.clear();
        qc.clear();
        setUser(null);
      },
      reload,
    }),
    [user, ready, handle, reload, qc],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAuth outside provider');
  return ctx;
}
