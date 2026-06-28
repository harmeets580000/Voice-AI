/**
 * Typed browser API client built on `@contracts`. The ONLY way the web app talks to the
 * backend — it never imports `src/server/**`. Attaches the active org header for the
 * super-admin org switcher and sends cookies (httpOnly JWT) automatically.
 */

let activeOrgId: string | null = null;

/** Set by the org-switcher (super-admin). Sent as X-Org-Id on every request. */
export function setActiveOrgId(orgId: string | null) {
  activeOrgId = orgId;
}
export function getActiveOrgId() {
  return activeOrgId;
}

export interface ApiError {
  code: string;
  message: string;
  details?: unknown;
}

export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly body: ApiError,
  ) {
    super(body.message);
    this.name = "ApiRequestError";
  }
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (activeOrgId) headers["X-Org-Id"] = activeOrgId;

  const res = await fetch(`/api${path}`, {
    method,
    headers,
    credentials: "include",
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (res.status === 204) return undefined as T;

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err: ApiError = json?.error ?? {
      code: "internal_error",
      message: "Request failed",
    };
    throw new ApiRequestError(res.status, err);
  }
  return json as T;
}

export const api = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, body),
  patch: <T>(path: string, body?: unknown) => request<T>("PATCH", path, body),
  put: <T>(path: string, body?: unknown) => request<T>("PUT", path, body),
  del: <T>(path: string) => request<T>("DELETE", path),
};
