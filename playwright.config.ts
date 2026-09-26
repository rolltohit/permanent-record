import { defineConfig, devices } from "@playwright/test";

// Smoke test against a local Supabase (npx supabase start && npm run seed).
export default defineConfig({
  testDir: "e2e",
  globalSetup: "./e2e/global-setup.ts",
  timeout: 60_000,
  use: {
    baseURL: "http://127.0.0.1:3000",
    ...devices["Pixel 7"],
    launchOptions: process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
  },
  webServer: {
    command: "npm run dev -- --hostname 127.0.0.1 --port 3000",
    url: "http://127.0.0.1:3000/login",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
