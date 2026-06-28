import { z } from "zod";

/**
 * Auth contract — the FE<->BE seam for authentication. A change here breaks compilation
 * on both the route handler (runtime validation) and the web client (types).
 */

export const LoginRequest = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
export type LoginRequest = z.infer<typeof LoginRequest>;

export const RoleEnum = z.enum(["super_admin", "org_admin", "org_staff"]);
export type RoleEnum = z.infer<typeof RoleEnum>;

export const AuthUser = z.object({
  id: z.string(),
  email: z.string().email(),
  name: z.string().nullable(),
  role: RoleEnum,
  // null for super_admin (no fixed org); set for org users.
  organizationId: z.string().nullable(),
});
export type AuthUser = z.infer<typeof AuthUser>;

export const LoginResponse = z.object({
  user: AuthUser,
});
export type LoginResponse = z.infer<typeof LoginResponse>;

export const MeResponse = z.object({
  user: AuthUser,
});
export type MeResponse = z.infer<typeof MeResponse>;

export const RefreshResponse = z.object({
  ok: z.literal(true),
});
export type RefreshResponse = z.infer<typeof RefreshResponse>;
