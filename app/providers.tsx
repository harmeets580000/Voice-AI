"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { AuthProvider } from "@features/auth/AuthProvider";
import { ThemeProvider } from "@theme/ThemeProvider";
import { SettingsProvider } from "@features/settings/SettingsProvider";
import { ToastProvider } from "@shared/ui/Toast";

/** App-wide client providers (TanStack Query + Auth + Theme). */
export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 30_000, refetchOnWindowFocus: false, retry: 1 },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <AuthProvider>
          <ThemeProvider>
            <SettingsProvider>{children}</SettingsProvider>
          </ThemeProvider>
        </AuthProvider>
      </ToastProvider>
    </QueryClientProvider>
  );
}
