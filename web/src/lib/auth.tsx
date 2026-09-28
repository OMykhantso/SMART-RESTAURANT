import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api, tokens } from './api';
import type { AuthResponse, Role, User } from './types';

interface AuthState {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<User>;
  register: (data: { name: string; email: string; phone?: string; password: string }) => Promise<User>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  hasRole: (...roles: Role[]) => boolean;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const qc = useQueryClient();

  const refreshUser = useCallback(async () => {
    if (!tokens.access && !tokens.refresh) {
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
    refreshUser().finally(() => setLoading(false));
    const onTokens = () => {
      if (!tokens.access) setUser(null);
    };
    window.addEventListener('sr:tokens', onTokens);
    return () => window.removeEventListener('sr:tokens', onTokens);
  }, [refreshUser]);

  const handleAuth = useCallback(
    (res: AuthResponse) => {
      tokens.set(res.accessToken, res.refreshToken);
      qc.clear();
      setUser(res.user);
      return res.user;
    },
    [qc],
  );

  const value = useMemo<AuthState>(
    () => ({
      user,
      loading,
      login: async (email, password) => handleAuth(await api.post<AuthResponse>('/auth/login', { email, password })),
      register: async (data) => handleAuth(await api.post<AuthResponse>('/auth/register', data)),
      logout: async () => {
        const refresh = tokens.refresh;
        if (refresh) await api.post('/auth/logout', { refreshToken: refresh }).catch(() => undefined);
        tokens.clear();
        qc.clear();
        setUser(null);
      },
      refreshUser,
      hasRole: (...roles) => Boolean(user && roles.includes(user.role)),
    }),
    [user, loading, handleAuth, refreshUser, qc],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

export function homeFor(role: Role | undefined): string {
  switch (role) {
    case 'ADMIN':
      return '/staff';
    case 'STAFF':
      return '/staff';
    case 'KITCHEN':
      return '/kitchen';
    default:
      return '/account';
  }
}
