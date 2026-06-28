import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@server": r("./src/server"),
      "@contracts": r("./src/contracts"),
      "@domain": r("./src/domain"),
      "@features": r("./src/features"),
      "@shared": r("./src/shared"),
      "@theme": r("./src/theme"),
      "@": r("./"),
    },
  },
  test: {
    globals: true,
    environment: "node",
    setupFiles: ["./test/integration/setup.ts"],
    include: ["test/integration/**/*.test.{ts,tsx}"],
    // Integration tests share a DB; run serially to keep truncation deterministic.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
