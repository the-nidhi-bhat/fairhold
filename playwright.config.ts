import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  // The journeys sign in and out three times and cross every route in dev mode,
  // where Turbopack compiles routes on demand. On a OneDrive-synced checkout that
  // easily exceeds the 30s default even though every assertion holds, so the
  // budget is explicit here. Assertions themselves are unchanged.
  timeout: 90_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: "http://localhost:3100",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "desktop-chromium", use: { ...devices["Desktop Chrome"] } },
    {
      name: "mobile-chromium",
      use: { ...devices["Pixel 5"] },
    },
    {
      name: "tablet-chromium",
      use: { ...devices["iPad (gen 7)"] },
    },
  ],
  webServer: {
    command: "npm run dev -- --port 3100",
    url: "http://localhost:3100/login",
    reuseExistingServer: true,
    env: {
      FAIRHOLD_DEMO_BUYERS: "Alex Buyer",
      FAIRHOLD_DEMO_SELLERS: "Jamie Seller",
      FAIRHOLD_DEMO_REVIEWERS: "Morgan Reviewer",
    },
    timeout: 120_000,
  },
});
