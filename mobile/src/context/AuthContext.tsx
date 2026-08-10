import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from 'react';
import { loginAccount, registerAccount } from '../lib/api';
import { initDatabase } from '../lib/database';
import { clearSession, loadSession, saveSession } from '../lib/session';
import { cancelReminders } from '../lib/notifications';
import { SessionUser } from '../types';

interface AuthValue {
  ready: boolean;
  user: SessionUser | null;
  token: string | null;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      await initDatabase();
      const session = await loadSession();
      if (session) {
        setUser(session.user);
        setToken(session.token);
      }
      setReady(true);
    })().catch(() => setReady(true));
  }, []);

  const applySession = async (result: { token: string; user: SessionUser }) => {
    await saveSession(result.token, result.user);
    setToken(result.token);
    setUser(result.user);
  };

  const value = useMemo<AuthValue>(() => ({
    ready,
    user,
    token,
    login: async (email, password) => applySession(await loginAccount(email, password)),
    register: async (name, email, password) => applySession(await registerAccount(name, email, password)),
    logout: async () => {
      await cancelReminders().catch(() => undefined);
      await clearSession();
      setUser(null);
      setToken(null);
    },
  }), [ready, user, token]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth 必须在 AuthProvider 内使用');
  return value;
}
