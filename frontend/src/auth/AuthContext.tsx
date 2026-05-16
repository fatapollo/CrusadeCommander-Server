import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { authApi } from '../api/endpoints';
import type { User } from '../types';

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  adminPasscodeEnabled: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, display_name: string, admin_passcode?: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [adminPasscodeEnabled, setAdminPasscodeEnabled] = useState(false);

  useEffect(() => {
    authApi.me()
      .then(({ user, config_meta }) => {
        setUser(user);
        if (config_meta) setAdminPasscodeEnabled(config_meta.admin_passcode_enabled);
      })
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
    authApi.config().then(c => setAdminPasscodeEnabled(c.admin_passcode_enabled)).catch(() => {});
  }, []);

  const login = async (email: string, password: string) => {
    const { user } = await authApi.login(email, password);
    setUser(user);
  };
  const register = async (email: string, password: string, display_name: string, admin_passcode?: string) => {
    const { user } = await authApi.register(email, password, display_name, admin_passcode);
    setUser(user);
  };
  const logout = async () => {
    await authApi.logout();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, adminPasscodeEnabled, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
