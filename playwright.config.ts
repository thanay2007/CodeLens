import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/browser",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  use: {
    ...devices["Desktop Chrome"],
    ...(process.env.CODELENS_BROWSER_CHANNEL
      ? { channel: process.env.CODELENS_BROWSER_CHANNEL }
      : {}),
    baseURL: "http://localhost:3020",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "npm run dev -- --port 3020",
    env: {
      CODELENS_NEXT_DIST_DIR: ".next-browser",
      CODELENS_DATA_DIR: ".data/browser-tests",
      NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "",
      CLERK_SECRET_KEY: "",
      SUPABASE_DATABASE_URL: "",
      DATABASE_URL: "",
    },
    url: "http://localhost:3020",
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
