import {
  createContext, useCallback, useContext, useEffect, useMemo, useState,
  type ReactNode,
} from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { authService } from '../services';
import { setAccessToken, setAuthFailureHandler } from '../services/api';
import type { CurrentUser, PermissionCode } from '../types';

interface AuthValue {
  user: CurrentUser | null;
  /** True until the initial session-restore attempt finishes. */
  isLoading: boolean;
  login: (email: string, password: string) => Promise<CurrentUser>;
  logout: () => Promise<void>;
  can: (permission: PermissionCode) => boolean;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const queryClient = useQueryClient();

  const clearSession = useCallback(() => {
    setAccessToken(null);
    setUser(null);
    queryClient.clear();
  }, [queryClient]);

  // Restore the session on boot. The access token lives only in memory, so a
  // page reload has nothing to read — but the HttpOnly refresh cookie survives,
  // and the Axios interceptor turns the resulting 401 into a refresh + retry.
  useEffect(() => {
    let cancelled = false;
    authService
      .me()
      .then((me) => {
        if (!cancelled) setUser(me);
      })
      .catch(() => {
        if (!cancelled) setUser(null);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Lets the Axios interceptor clear React state on a failed refresh, rather
  // than hard-reloading the page and losing any unsaved form input.
  useEffect(() => {
    setAuthFailureHandler(clearSession);
    return () => setAuthFailureHandler(null);
  }, [clearSession]);

  const login = useCallback(
    async (email: string, password: string) => {
      const response = await authService.login(email, password);
      setAccessToken(response.access_token);
      setUser(response.user);
      return response.user;
    },
    [],
  );

  const logout = useCallback(async () => {
    try {
      await authService.logout();
    } finally {
      // Clear locally even if the network call fails — the user asked to leave.
      clearSession();
    }
  }, [clearSession]);

  const refresh = useCallback(async () => {
    setUser(await authService.me());
  }, []);

  const can = useCallback(
    (permission: PermissionCode) => user?.permissions.includes(permission) ?? false,
    [user],
  );

  const value = useMemo(
    () => ({ user, isLoading, login, logout, can, refresh }),
    [user, isLoading, login, logout, can, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
