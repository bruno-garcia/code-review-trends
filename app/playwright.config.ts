import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.NEXT_PORT
  ? `http://localhost:${process.env.NEXT_PORT}`
  : "http://localhost:3000";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? "github" : "html",
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: process.env.NEXT_PORT
      ? `npx next dev --port ${process.env.NEXT_PORT}`
      : "npx next dev",
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
