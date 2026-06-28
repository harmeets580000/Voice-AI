/**
 * httpOnly cookie helpers for the access + refresh JWTs. The browser never reads these
 * (httpOnly); the fetch wrapper sends them automatically with credentials: "include".
 */

import { cookies } from "next/headers";

export const ACCESS_COOKIE = "access_token";
export const REFRESH_COOKIE = "refresh_token";

const isProd = process.env.NODE_ENV === "production";

const baseOptions = {
  httpOnly: true,
  secure: isProd,
  sameSite: "lax" as const,
  path: "/",
};

// Access cookie lifetime is short; refresh is long. We let the JWT exp be the real
// authority and give cookies generous maxAge so the JWT (not the cookie) gates access.
export async function setAuthCookies(accessToken: string, refreshToken: string) {
  const store = await cookies();
  store.set(ACCESS_COOKIE, accessToken, { ...baseOptions, maxAge: 60 * 60 });
  store.set(REFRESH_COOKIE, refreshToken, {
    ...baseOptions,
    maxAge: 60 * 60 * 24 * 7,
  });
}

export async function clearAuthCookies() {
  const store = await cookies();
  store.set(ACCESS_COOKIE, "", { ...baseOptions, maxAge: 0 });
  store.set(REFRESH_COOKIE, "", { ...baseOptions, maxAge: 0 });
}

export async function readAccessToken(): Promise<string | null> {
  const store = await cookies();
  return store.get(ACCESS_COOKIE)?.value ?? null;
}

export async function readRefreshToken(): Promise<string | null> {
  const store = await cookies();
  return store.get(REFRESH_COOKIE)?.value ?? null;
}
