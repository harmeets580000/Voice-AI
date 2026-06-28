"use client";

import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@features/auth/AuthProvider";
import { api } from "@shared/api/client";
import type { OrgListResponse } from "@contracts/organizations";
import { Role } from "@domain/enums";

const PLATFORM = "__platform__";

/**
 * Super-admin org switcher. Org users never see it (locked to their own org).
 * Selecting an org sets the active org → the api client sends X-Org-Id on every request
 * and React Query re-fetches scoped data.
 */
export function OrgSwitcher() {
  const { user, activeOrgId, setActiveOrg } = useAuth();

  const enabled = user?.role === Role.SUPER_ADMIN;

  const { data } = useQuery({
    queryKey: ["organizations"],
    queryFn: () => api.get<OrgListResponse>("/organizations"),
    enabled,
  });

  if (!enabled) return null;

  const orgs = data?.organizations ?? [];

  return (
    <select
      aria-label="Active organization"
      value={activeOrgId ?? PLATFORM}
      onChange={(e) =>
        setActiveOrg(e.target.value === PLATFORM ? null : e.target.value)
      }
      className="rounded-lg border border-border bg-card px-2.5 py-1.5 text-sm text-text transition-colors hover:bg-surface focus:border-accent focus:outline-none"
    >
      <option value={PLATFORM}>All organizations (platform view)</option>
      {orgs.map((o) => (
        <option key={o.id} value={o.id}>
          {o.name}
        </option>
      ))}
    </select>
  );
}

/** Visible banner showing which org a super-admin is currently acting as. */
export function ActingAsBanner() {
  const { user, activeOrgId } = useAuth();
  const { data } = useQuery({
    queryKey: ["organizations"],
    queryFn: () => api.get<OrgListResponse>("/organizations"),
    enabled: user?.role === Role.SUPER_ADMIN && !!activeOrgId,
  });

  if (user?.role !== Role.SUPER_ADMIN || !activeOrgId) return null;
  const org = data?.organizations.find((o) => o.id === activeOrgId);

  return (
    <div
      role="status"
      className="bg-accent-tint px-4 py-1.5 text-center text-sm text-accent"
    >
      Acting as <strong>{org?.name ?? activeOrgId}</strong>
    </div>
  );
}
