import { z } from "zod";

/**
 * Validated server-side environment. Import `env` anywhere on the server.
 * NEVER import this from a client component — it would leak secrets into the bundle.
 *
 * Next.js loads `.env.local` automatically for the app. For standalone scripts and
 * the test runner we also pull in dotenv (see vitest setup / prisma seed).
 */

const isTest = process.env.NODE_ENV === "test";

const EnvSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),

  // Database — required to run, but allowed empty at build/scaffold time so the app
  // can compile before the user provides a connection string.
  DATABASE_URL: z.string().default(""),
  DATABASE_URL_TEST: z.string().optional().default(""),

  // Auth
  JWT_ACCESS_SECRET: z.string().min(1, "JWT_ACCESS_SECRET is required"),
  JWT_REFRESH_SECRET: z.string().min(1, "JWT_REFRESH_SECRET is required"),
  ACCESS_TOKEN_TTL: z.string().default("15m"),
  REFRESH_TOKEN_TTL: z.string().default("7d"),

  // Secrets-at-rest (AES-256-GCM, 32-byte base64). Validated lazily where used so the
  // app can boot for non-crypto routes even if this is unset during scaffolding.
  CREDENTIAL_ENCRYPTION_KEY: z.string().default(""),

  // Vapi
  VAPI_API_KEY: z.string().default(""),
  VAPI_BASE_URL: z.string().default("https://api.vapi.ai"),
  PUBLIC_API_BASE_URL: z.string().default("http://localhost:3000"),

  // Simulator LLM (Anthropic). Powers the per-assistant text-chat tester (Claude tool loop).
  ANTHROPIC_API_KEY: z.string().default(""),
  SIMULATOR_MODEL: z.string().default("claude-opus-4-8"),

  // App
  PORT: z.coerce.number().default(3000),
  WEB_ORIGIN: z.string().default("http://localhost:3000"),

  // Which adapter implements each port (lets us swap Vapi -> Retell later).
  VOICE_PROVIDER: z.enum(["vapi", "fake"]).default("vapi"),

  // Background auto-sync of Vapi calls (in-process poller; see instrumentation.ts).
  // NOTE: do NOT use z.coerce.boolean — Boolean("false") is true. Parse the string explicitly.
  AUTO_SYNC_ENABLED: z
    .string()
    .default("false")
    .transform((v) => v === "true"),
  AUTO_SYNC_INTERVAL_SECONDS: z.coerce.number().default(60),
});

export type Env = z.infer<typeof EnvSchema>;

function loadEnv(): Env {
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid environment variables:\n${issues}`);
  }
  return parsed.data;
}

export const env = loadEnv();

/** The active DB URL — points at the test DB under NODE_ENV=test. */
export const databaseUrl = isTest
  ? env.DATABASE_URL_TEST || env.DATABASE_URL
  : env.DATABASE_URL;
