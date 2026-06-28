import { config } from "dotenv";

// Load env BEFORE importing any server module (which validates env on import).
config({ path: ".env.local" });

// Integration tests run against the TEST database, ISOLATED to a dedicated schema
// (`app_test`) so truncation never touches real/seeded data in `public` — important when
// DATABASE_URL_TEST points at the same database as DATABASE_URL.
export const TEST_SCHEMA = "app_test";
if (process.env.DATABASE_URL_TEST) {
  const base = process.env.DATABASE_URL_TEST;
  const sep = base.includes("?") ? "&" : "?";
  process.env.DATABASE_URL = base.includes("schema=")
    ? base
    : `${base}${sep}schema=${TEST_SCHEMA}`;
}
if (!process.env.NODE_ENV) {
  Object.assign(process.env, { NODE_ENV: "test" });
}
// Default secrets so the suite can at least load + skip when no test DB is configured.
process.env.JWT_ACCESS_SECRET ||= "test-access-secret";
process.env.JWT_REFRESH_SECRET ||= "test-refresh-secret";
process.env.CREDENTIAL_ENCRYPTION_KEY ||= Buffer.alloc(32, 7).toString("base64");

// Inject the fake voice provider so NO test ever calls real Vapi (doc 04 standing rule).
// Dynamic import runs AFTER env is populated above.
const { setVoiceProvider } = await import("@server/config/providers");
const { FakeVoiceProvider } = await import(
  "@server/adapters/voice/fake/fake.provider"
);
setVoiceProvider(new FakeVoiceProvider());
