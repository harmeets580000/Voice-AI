import { authRepository } from "./auth.repository";
import { verifyPassword } from "@server/platform/auth/password";
import { signToken } from "@server/platform/auth/jwt";
import { AppError } from "@server/platform/http/errors";
import type { AuthUser } from "@contracts/auth";
import type { Role } from "@domain/enums";

interface DbUser {
  id: string;
  email: string;
  name: string | null;
  role: string;
  organizationId: string | null;
  isActive: boolean;
  passwordHash: string;
}

export function toAuthUser(u: DbUser): AuthUser {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role as AuthUser["role"],
    organizationId: u.organizationId,
  };
}

export async function issueTokensFor(user: {
  id: string;
  role: string;
  organizationId: string | null;
}) {
  const payload = {
    sub: user.id,
    role: user.role as Role,
    organizationId: user.organizationId,
  };
  const [accessToken, refreshToken] = await Promise.all([
    signToken(payload, "access"),
    signToken(payload, "refresh"),
  ]);
  return { accessToken, refreshToken };
}

/** Validate credentials. Throws 401 on any failure (no user-enumeration leak). */
export async function authenticate(
  email: string,
  password: string,
): Promise<DbUser> {
  const user = (await authRepository.findByEmail(email)) as DbUser | null;
  if (!user || !user.isActive) {
    throw AppError.unauthorized("Invalid email or password");
  }
  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    throw AppError.unauthorized("Invalid email or password");
  }
  return user;
}

export async function getUserById(id: string): Promise<DbUser> {
  const user = (await authRepository.findById(id)) as DbUser | null;
  if (!user || !user.isActive) {
    throw AppError.unauthorized("User not found or inactive");
  }
  return user;
}
