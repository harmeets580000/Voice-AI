"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@shared/api/client";
import { useAuth } from "@features/auth/AuthProvider";
import type { DashboardResponse, DashboardPeriod } from "@contracts/analytics";

/** Fetches the role-aware dashboard. Re-keyed by active org so it refetches on org switch. */
export function useDashboard(period: DashboardPeriod) {
  const { activeOrgId } = useAuth();
  return useQuery({
    queryKey: ["dashboard", activeOrgId, period],
    queryFn: () =>
      api.get<DashboardResponse>(`/dashboard?period=${period}`),
    staleTime: 60_000,
  });
}
