import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
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
