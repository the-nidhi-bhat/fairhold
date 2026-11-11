import { test, expect } from "@playwright/test";

/**
 * Reproduction test for P0: deal creation causes a server error on the
 * deployed Preview.
 *
 * Locally the JSON store writes to .data/fairhold.json, which works because
 * the dev filesystem is writable. On Vercel Preview (no DATABASE_URL), the
 * same JSON store hits a read-only filesystem and throws an unhandled error,
 * producing a 500 / "This page couldn't load."
 */
test("buyer can create a deal through the form", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Display name").fill("Alex Buyer");
  await page.getByLabel("Demo role").selectOption("buyer");
  const continueButton = page.getByRole("button", { name: "Continue" });
  await expect(continueButton).toBeVisible();
  await expect(
    continueButton.locator("xpath=ancestor::form[1]"),
  ).not.toHaveAttribute("action", /^javascript:/, { timeout: 60_000 });
  await continueButton.click();
  await expect(page).toHaveURL(/\/dashboard$/);

  await page.locator("main").getByRole("link", { name: /New deal/ }).click();
  await expect(page).toHaveURL(/\/deals\/new$/);

  await page.getByLabel("Deal title").fill("Nidhi Inc. Website Redesign");
  await page.getByLabel("Client").fill("Alex Buyer");
  await page.getByLabel("Freelancer").fill("Jamie Seller");
  await page.getByRole("textbox", { name: "Agreement" }).fill(
    "Website redesign including homepage, about page, and contact form. Delivery in 4 weeks. Acceptance: responsive design at 375/768/1440, all pages load under 2 seconds.",
  );
  await page.getByRole("button", { name: "Create deal" }).click();

  // Deal creation should redirect to the deal page, not show a 500.
  await expect(page).toHaveURL(/\/deals\//);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Nidhi Inc. Website Redesign",
  );
});
