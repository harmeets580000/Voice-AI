/**
 * JWT issue/verify using `jose` (Web Crypto — works in Node and Edge). Access + refresh
 * tokens carry the user's identity, role, and org. Verified on every protected request.
 */

import { SignJWT, jwtVerify, errors as joseErrors } from "jose";
import { env } from "@server/config/env";
import type { Role } from "@domain/enums";

export interface JwtPayload {
  sub: string; // user id
  role: Role;
  organizationId: string | null;
  /** "access" | "refresh" — refresh tokens can't be used as access tokens. */
  typ: "access" | "refresh";
}

const accessSecret = new TextEncoder().encode(env.JWT_ACCESS_SECRET);
const refreshSecret = new TextEncoder().encode(env.JWT_REFRESH_SECRET);

function secretFor(typ: "access" | "refresh") {
  return typ === "access" ? accessSecret : refreshSecret;
}

export async function signToken(
  payload: Omit<JwtPayload, "typ">,
  typ: "access" | "refresh",
): Promise<string> {
  const ttl = typ === "access" ? env.ACCESS_TOKEN_TTL : env.REFRESH_TOKEN_TTL;
  return new SignJWT({ ...payload, typ })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(ttl)
    .sign(secretFor(typ));
}

export class TokenError extends Error {
  constructor(
    message: string,
    readonly reason: "expired" | "invalid",
  ) {
    super(message);
    this.name = "TokenError";
  }
}

export async function verifyToken(
  token: string,
  typ: "access" | "refresh",
): Promise<JwtPayload> {
  try {
    const { payload } = await jwtVerify(token, secretFor(typ));
    if (payload.typ !== typ) {
      throw new TokenError(`Expected a ${typ} token`, "invalid");
    }
    return payload as unknown as JwtPayload;
  } catch (err) {
    if (err instanceof TokenError) throw err;
    if (err instanceof joseErrors.JWTExpired) {
      throw new TokenError("Token expired", "expired");
    }
    throw new TokenError("Invalid token", "invalid");
  }
}

/** Test/utility: sign a token with an explicit expiration (epoch seconds). */
export async function signTokenWithExp(
  payload: Omit<JwtPayload, "typ">,
  typ: "access" | "refresh",
  expEpochSeconds: number,
): Promise<string> {
  return new SignJWT({ ...payload, typ })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(expEpochSeconds)
    .sign(secretFor(typ));
}
