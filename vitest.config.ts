import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": `${import.meta.dirname}/src`,
    },
  },
  test: {
    globals: true,
    setupFiles: ["tests/setup.ts"],
    // Well above Testing Library's wait (tests/setup.ts), so a missing element
    // fails with its query's message.
    testTimeout: 15_000,
    // A DOM costs each file's setup, so only `.test.tsx` files get one by default; a
    // `.ts` test that needs it asks with `// @vitest-environment jsdom`.
    projects: [
      {
        extends: true,
        test: { name: "dom", environment: "jsdom", include: ["tests/**/*.test.tsx"] },
      },
      {
        extends: true,
        test: { name: "node", environment: "node", include: ["tests/**/*.test.ts"] },
      },
    ],
  },
});
