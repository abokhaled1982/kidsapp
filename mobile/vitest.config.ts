import { defineConfig } from "vitest/config";
import path from "node:path";

// Der "@/..."-Alias aus tsconfig.json muss auch fuer die Tests gelten.
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  test: {
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },
});
