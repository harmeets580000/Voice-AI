"use client";

import { createContext, useContext, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@shared/api/client";
import { formatDateTime } from "@shared/format";
import {
  DEFAULT_DATE_FORMAT,
  type SettingsResponse,
  type DateFormat,
} from "@contracts/settings";

interface SettingsState {
  dateFormat: DateFormat;
  formatDate: (value: string | Date | null | undefined) => string;
}

const SettingsContext = createContext<SettingsState | null>(null);

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  // Refetches on org switch (AuthProvider invalidates queries) so the format follows the
  // active org. `retry: false` so it falls back to the default when unauthenticated.
  const { data } = useQuery({
    queryKey: ["settings"],
    queryFn: () => api.get<SettingsResponse>("/settings"),
    retry: false,
  });

  const dateFormat = (data?.dateFormat ?? DEFAULT_DATE_FORMAT) as DateFormat;

  const formatDate = useCallback(
    (value: string | Date | null | undefined) =>
      formatDateTime(value, dateFormat),
    [dateFormat],
  );

  return (
    <SettingsContext.Provider value={{ dateFormat, formatDate }}>
      {children}
    </SettingsContext.Provider>
  );
}

/** Returns `formatDate(value)` bound to the active org's configured pattern. */
export function useFormatDate() {
  const ctx = useContext(SettingsContext);
  if (!ctx) return (v: string | Date | null | undefined) => formatDateTime(v);
  return ctx.formatDate;
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  return ctx;
}
