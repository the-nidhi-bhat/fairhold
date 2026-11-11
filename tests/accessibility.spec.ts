import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Accessibility audits using axe-core, injected into each page under test.
 *
 * These tests run against the production build served by Playwright's
 * webServer (one server per device project). They assert zero axe violations
 * on impact levels "serious" and "critical" for the most important
 * user-facing routes.
 *
 * Tooling limit: axe-core is run programmatically via Playwright page
 * evaluation; this is not a full WCAG conformance audit. Results are
 * heuristic and complement the manual checks already recorded in QA_REPORT.md.
 */

const AXE_SOURCE = readFileSync(
  join(process.cwd(), "node_modules", "axe-core", "axe.min.js"),
  "utf8",
);

const routes = [
  { path: "/", label: "landing" },
  { path: "/login", label: "login" },
  { path: "/demo", label: "guided demo" },
];

async function runAxe(page: Page, context: string) {
  await page.addScriptTag({ content: AXE_SOURCE });
  const results = (await page.evaluate(() => {
    return (window as unknown as { axe: { run: (doc: Document, opts: unknown) => { violations?: Array<unknown> } } }).axe.run(document, {
      runOnly: ["cat:aria", "cat:color", "cat:keyboard", "cat:landmarks", "cat:language", "cat:meta", "cat:name-role-value", "cat:pointer", "cat:semantics", "cat:structure", "cat:tables"],
      resultTypes: ["violations"],
    });
  })) as { violations?: Array<{ impact?: string; description?: string }> };
  const violations = results.violations ?? [];
  if (violations.length > 0) {
    console.log(`\n${context} axe violations:`);
    for (const v of violations) {
      console.log(`  - impact=${String(v.impact)} description=${String(v.description)}`);
    }
  }
  expect(violations.filter((v) => v.impact === "critical" || v.impact === "serious")).toEqual([]);
}

for (const route of routes) {
  test(`axe accessibility: ${route.label} (${route.path})`, async ({ page }) => {
    await page.goto(route.path, { waitUntil: "networkidle" });
    await runAxe(page, route.label);
  });
}

test("axe accessibility: dashboard as buyer", async ({ page }) => {
  await page.goto("/login", { waitUntil: "networkidle" });
  await page.getByLabel("Display name").fill("Alex Buyer");
  await page.getByLabel("Demo role").selectOption("buyer");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await runAxe(page, "dashboard-buyer");
});

test("axe accessibility: dashboard as seller", async ({ page }) => {
  await page.goto("/login", { waitUntil: "networkidle" });
  await page.getByLabel("Display name").fill("Jamie Seller");
  await page.getByLabel("Demo role").selectOption("seller");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await runAxe(page, "dashboard-seller");
});
