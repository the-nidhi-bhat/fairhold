import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";

test.describe("UI/UX audit screenshots", () => {
  test("landing page", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/FairHold/);
    await page.screenshot({ path: "audit-shots/landing-desktop.png", fullPage: true });
  });

  test("login page", async ({ page }) => {
    await page.goto("/login");
    await page.screenshot({ path: "audit-shots/login-desktop.png", fullPage: true });
  });

  test("demo page", async ({ page }) => {
    await page.goto("/demo");
    await page.screenshot({ path: "audit-shots/demo-desktop.png", fullPage: true });
  });

  test("sign in as buyer", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Display name").fill("Alex Buyer");
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page).toHaveURL("/dashboard");
    await page.screenshot({ path: "audit-shots/dashboard-buyer-desktop.png", fullPage: true });
  });

  async function signInAs(page: Page, name: string, role: string) {
  await page.goto("/login");
  await page.getByLabel("Display name").fill(name);
  await page.getByLabel("Demo role").selectOption(role);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page).toHaveURL("/dashboard");
}

test("sign in as seller", async ({ page }) => {
  await signInAs(page, "Jamie Seller", "seller");
  await page.screenshot({ path: "audit-shots/dashboard-seller-desktop.png", fullPage: true });
});

test("sign in as reviewer", async ({ page }) => {
  await signInAs(page, "Morgan Reviewer", "reviewer");
  await page.screenshot({ path: "audit-shots/dashboard-reviewer-desktop.png", fullPage: true });
});

test("landing page mobile", async ({ page }) => {
  await page.goto("/");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "audit-shots/landing-mobile.png", fullPage: true });
});

test("login page mobile", async ({ page }) => {
  await page.goto("/login");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "audit-shots/login-mobile.png", fullPage: true });
});

test("dashboard buyer mobile", async ({ page }) => {
  await signInAs(page, "Alex Buyer", "buyer");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "audit-shots/dashboard-buyer-mobile.png", fullPage: true });
});

test("landing page tablet", async ({ page }) => {
  await page.goto("/");
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.screenshot({ path: "audit-shots/landing-tablet.png", fullPage: true });
});
});
