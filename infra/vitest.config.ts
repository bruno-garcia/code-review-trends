import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    // Each test file gets its own Pulumi mock context
    isolate: true,
    sequence: {
      concurrent: false,
    },
  },
});
