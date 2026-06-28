// Push the Prisma schema into the dedicated `app_test` schema on the TEST database, so
// integration tests have their tables isolated from `public` (dev/seed) data.
import { config } from "dotenv";
import { spawnSync } from "node:child_process";

config({ path: ".env.local" });

const base = process.env.DATABASE_URL_TEST || process.env.DATABASE_URL;
if (!base) {
  console.error("DATABASE_URL_TEST (or DATABASE_URL) is not set");
  process.exit(1);
}
const sep = base.includes("?") ? "&" : "?";
const url = base.includes("schema=") ? base : `${base}${sep}schema=app_test`;

const res = spawnSync(
  "npx",
  ["prisma", "db", "push", "--skip-generate", "--accept-data-loss"],
  { stdio: "inherit", shell: true, env: { ...process.env, DATABASE_URL: url } },
);
process.exit(res.status ?? 1);
