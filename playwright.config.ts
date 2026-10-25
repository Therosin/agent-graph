import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  use: {
    baseURL: "http://127.0.0.1:3005",
    browserName: "chromium",
    ...(process.env.PLAYWRIGHT_CHANNEL
      ? { channel: process.env.PLAYWRIGHT_CHANNEL }
      : {}),
    headless: true,
    viewport: { width: 1120, height: 760 },
  },
  webServer: {
    command: "bun packages/backend/main.ts",
    url: "http://127.0.0.1:3005/api/status",
    env: { BACKEND_PORT: "3005" },
    reuseExistingServer: false,
  },
  outputDir: ".logs/playwright",
});
