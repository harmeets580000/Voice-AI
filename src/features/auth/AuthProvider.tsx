"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { AuthUser, MeResponse, LoginResponse } from "@contracts/auth";
import { api, setActiveOrgId } from "@shared/api/client";

interface AuthState {
  user: AuthUser | null;
  loading: boolean;
  /** Active org for super-admin org switcher (null = platform view). */
  activeOrgId: string | null;
  login: (email: string, password: string) => Promise<AuthUser>;
  logout: () => Promise<void>;
  setActiveOrg: (orgId: string | null) => void;
  refreshMe: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

const ORG_STORAGE_KEY = "activeOrgId";

function readStoredOrg(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(ORG_STORAGE_KEY) || null;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeOrgId, setActiveOrgState] = useState<string | null>(null);

  const refreshMe = useCallback(async () => {
    try {
      const res = await api.get<MeResponse>("/auth/me");
      setUser(res.user);
      // Restore the super-admin's last selected org from localStorage so a refresh
      // keeps them in the same org (org users are always pinned to their own org).
      if (res.user.role === "super_admin") {
        const stored = readStoredOrg();
        setActiveOrgId(stored);
        setActiveOrgState(stored);
      } else {
        setActiveOrgId(null);
        setActiveOrgState(null);
      }
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // refreshMe is async; setState runs after the awaited fetch, not synchronously.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refreshMe();
  }, [refreshMe]);

  const setActiveOrg = useCallback(
    (orgId: string | null) => {
      setActiveOrgId(orgId);
      setActiveOrgState(orgId);
      // Persist so the selection survives reloads (per user request).
      if (typeof window !== "undefined") {
        if (orgId) window.localStorage.setItem(ORG_STORAGE_KEY, orgId);
        else window.localStorage.removeItem(ORG_STORAGE_KEY);
      }
      // Refetch all scoped data (lists, theme, settings) for the newly active org.
      void queryClient.invalidateQueries();
    },
    [queryClient],
  );

  const login = useCallback(
    async (email: string, password: string) => {
      const res = await api.post<LoginResponse>("/auth/login", {
        email,
        password,
      });
      setUser(res.user);
      // Fresh login starts in platform view (clears any stored selection).
      setActiveOrg(null);
      return res.user;
    },
    [setActiveOrg],
  );

  const logout = useCallback(async () => {
    await api.post("/auth/logout");
    setUser(null);
    setActiveOrg(null);
  }, [setActiveOrg]);

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        activeOrgId,
        login,
        logout,
        setActiveOrg,
        refreshMe,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
