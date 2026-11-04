import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests/e2e",
  projects: [
    { name: "chromium", use: { browserName: "chromium" } },
    { name: "firefox", use: { browserName: "firefox", launchOptions: {} } },
  ],
  timeout: 45000,
  workers: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://127.0.0.1:5178",
    headless: true,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    launchOptions: process.env.CHAOS_CHROMIUM
      ? { executablePath: process.env.CHAOS_CHROMIUM }
      : {},
  },
  webServer: {
    command: "npm run dev -- --mode e2e",
    url: "http://127.0.0.1:5178",
    reuseExistingServer: false,
    timeout: 30000,
  },
});
