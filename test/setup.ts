import "@testing-library/jest-dom/vitest";
import { config } from "dotenv";

// Load .env.local for tests (Next loads it for the app, but Vitest needs it explicitly).
config({ path: ".env.local" });

// Default to the test database when one is configured.
if (process.env.DATABASE_URL_TEST) {
  process.env.DATABASE_URL = process.env.DATABASE_URL_TEST;
}
// NODE_ENV is typed readonly by Next's env augmentation; assign via Object.assign.
if (!process.env.NODE_ENV) {
  Object.assign(process.env, { NODE_ENV: "test" });
}
