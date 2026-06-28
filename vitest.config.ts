import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  plugins: [react()],
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
    setupFiles: ["./test/setup.ts"],
    include: ["test/unit/**/*.test.{ts,tsx}"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: [
        "src/server/features/bookings/**",
        "src/server/platform/tenant/**",
        "src/server/platform/db/**",
        "src/server/platform/auth/**",
        "src/server/adapters/voice/vapi/**",
      ],
    },
  },
});
