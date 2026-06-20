"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { clearSession, getAccessToken, getRefreshToken, saveSession, touchAuthCookie, type AuthSession, type AuthUser } from "@/lib/auth";
import { canAccessRoute, isPublicRoute } from "@/lib/permissions";
import { ensureAuthSession, logoutSession, startAuthKeepAlive } from "@/lib/api";

type AuthContextType = {
  user: AuthUser | null;
  loading: boolean;
  isAuthenticated: boolean;
  setSession: (session: AuthSession) => void;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  isAuthenticated: false,
  setSession: () => undefined,
  logout: async () => undefined,
  refreshUser: async () => undefined,
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [canNavigate, setCanNavigate] = useState(false);
  const pathname = usePathname();
  const router = useRouter();

  const setSession = useCallback((session: AuthSession) => {
    saveSession(session);
    setUser(session.user);
  }, []);

  const logout = useCallback(async () => {
    try {
      await logoutSession();
    } catch {
      // ignore network errors on logout
    } finally {
      clearSession();
      setUser(null);
      router.replace("/login");
    }
  }, [router]);

  const refreshUser = useCallback(async () => {
    if (!getAccessToken() && !getRefreshToken()) {
      setUser(null);
      return;
    }
    const me = await ensureAuthSession();
    if (!me) {
      clearSession();
      setUser(null);
      return;
    }
    touchAuthCookie();
    setUser(me);
  }, []);

  useEffect(() => {
    setCanNavigate(true);
  }, []);

  useEffect(() => {
    const bootstrap = async () => {
      if (!getAccessToken() && !getRefreshToken()) {
        setUser(null);
        setLoading(false);
        return;
      }
      touchAuthCookie();
      const me = await ensureAuthSession();
      if (!me) {
        clearSession();
        setUser(null);
      } else {
        touchAuthCookie();
        setUser(me);
      }
      setLoading(false);
    };
    void bootstrap();
  }, []);

  useEffect(() => {
    if (!user) return;
    return startAuthKeepAlive();
  }, [user]);

  useEffect(() => {
    if (!canNavigate || loading) return;
    if (isPublicRoute(pathname)) return;
    if (!user) {
      const loginTarget = `/login?next=${encodeURIComponent(pathname)}`;
      if (pathname !== "/login") {
        window.requestAnimationFrame(() => {
          router.replace(loginTarget);
        });
      }
      return;
    }
    if (!canAccessRoute(pathname, user.role) && pathname !== "/") {
      window.requestAnimationFrame(() => {
        router.replace("/");
      });
    }
  }, [canNavigate, loading, pathname, router, user]);

  const value = useMemo(
    () => ({
      user,
      loading,
      isAuthenticated: Boolean(user),
      setSession,
      logout,
      refreshUser,
    }),
    [user, loading, setSession, logout, refreshUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
