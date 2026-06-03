import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import type { LoginInput, User } from '@stockmaster/shared';
import { authApi } from './api';

export interface AuthState {
  user: User | null;
  isAuthed: boolean;
  status: 'loading' | 'ready';
  login: (input: LoginInput) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready'>('loading');

  // Bootstrap: try to mint an access token from the refresh cookie, then load the user.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const ok = await authApi.refresh();
      if (ok) {
        try {
          const { user: me } = await authApi.me();
          if (!cancelled) setUser(me);
        } catch {
          /* ignore */
        }
      }
      if (!cancelled) setStatus('ready');
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (input: LoginInput) => {
    const { user: me } = await authApi.login(input);
    setUser(me);
  }, []);

  const logout = useCallback(async () => {
    await authApi.logout();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, isAuthed: user !== null, status, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
