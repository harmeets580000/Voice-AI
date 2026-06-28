"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  useCallback,
} from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@shared/api/client";
import { TOKEN_CSS_VARS, defaultTheme } from "@theme/tokens";
import type { Theme, ThemeMode, ThemeTokens } from "@theme/tokens";
import type { GetThemeResponse } from "@contracts/theme";

interface ThemeState {
  theme: Theme;
  mode: ThemeMode;
  setMode: (m: ThemeMode) => void;
  /** Apply a theme live (used by the config page preview without saving). */
  previewTheme: (t: Theme | null) => void;
}

const ThemeContext = createContext<ThemeState | null>(null);

/** Imperatively write a mode's tokens onto :root as CSS variables + set data-theme. */
export function applyTokensToRoot(tokens: ThemeTokens, mode: ThemeMode) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  for (const [name, cssVar] of Object.entries(TOKEN_CSS_VARS)) {
    const value = tokens[name as keyof ThemeTokens];
    if (value) root.style.setProperty(cssVar, value);
  }
  root.setAttribute("data-theme", mode);
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [preview, setPreview] = useState<Theme | null>(null);
  const [mode, setModeState] = useState<ThemeMode>(defaultTheme.defaultMode);

  // Resolved theme for the active org (re-fetches when X-Org-Id changes via the switcher).
  const { data } = useQuery({
    queryKey: ["theme"],
    queryFn: () => api.get<GetThemeResponse>("/theme"),
    // Don't block the app if unauthenticated; fall back to default.
    retry: false,
  });

  const theme: Theme = useMemo(
    () => preview ?? (data?.theme as Theme) ?? defaultTheme,
    [preview, data],
  );

  // Initialize mode from the theme's default the first time it loads.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setModeState(theme.defaultMode);
  }, [theme.defaultMode]);

  // Write CSS variables whenever the resolved theme or mode changes.
  useEffect(() => {
    const tokens = mode === "dark" ? theme.dark : theme.light;
    applyTokensToRoot(tokens, mode);
  }, [theme, mode]);

  const setMode = useCallback((m: ThemeMode) => setModeState(m), []);
  const previewTheme = useCallback((t: Theme | null) => setPreview(t), []);

  return (
    <ThemeContext.Provider value={{ theme, mode, setMode, previewTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeState {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
