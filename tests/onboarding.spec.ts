import { test, expect, type Page } from "@playwright/test";

/**
 * Dedicated onboarding explainer suite.
 *
 * Verifies FINAL_REMAINING_WORK.md gate item 1 (Onboarding — DONE): the
 * collapsed four-step explainer on /dashboard. Runs against the desktop,
 * mobile and tablet Playwright projects. Asserts real user-visible content
 * and the expand/collapse behaviour, not merely element existence.
 */

async function signIn(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Display name").fill("Alex Buyer");
  await page.getByLabel("Demo role").selectOption("buyer");
  const button = page.getByRole("button", { name: "Continue" });
  await expect(button).toBeVisible();
  // The server renders a real POST form; React swaps in a `javascript:` guard
  // when it takes the form over during hydration. Wait for the guard before
  // clicking so the click is not swallowed.
  await expect(button.locator("xpath=ancestor::form[1]")).not.toHaveAttribute(
    "action",
    /^javascript:/,
    { timeout: 60_000 },
  );
  await button.click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

test("onboarding explainer starts collapsed, expands to the four steps, and collapses again", async ({ page }) => {
  await signIn(page);

  const onboarding = page
    .locator("details")
    .filter({ hasText: "How FairHold works in four steps" })
    .first();
  const summary = onboarding.locator("summary");

  // Gate item 1: the explainer starts collapsed (no `open` attribute, step content hidden).
  await expect(onboarding).not.toHaveAttribute("open");
  await expect(onboarding.getByText("Step 1")).toBeHidden();
  await expect(onboarding.getByText("Agree")).toBeHidden();

  // Gate item 1: clicking the summary expands the four steps.
  await summary.click();
  await expect(onboarding).toHaveAttribute("open");
  await expect(onboarding.getByText("Step 1")).toBeVisible();

  // Gate item 1: all four step titles are visible when expanded.
  // `exact: true` avoids matching "Hold" inside "FairHold" (summary) or
  // "hold" inside a step body (substring/case-insensitive matches).
  await expect(onboarding.getByText("Agree", { exact: true })).toBeVisible();
  await expect(onboarding.getByText("Hold", { exact: true })).toBeVisible();
  await expect(onboarding.getByText("Prove", { exact: true })).toBeVisible();
  await expect(onboarding.getByText("Approve", { exact: true })).toBeVisible();

  // Gate item 1: all four step bodies are visible when expanded.
  await expect(
    onboarding.getByText(
      "Write the scope and split it into milestones, each with acceptance criteria and an amount.",
    ),
  ).toBeVisible();
  await expect(
    onboarding.getByText(
      "The buyer places an authorization hold. It reserves funds; it is not escrow and moves no money.",
    ),
  ).toBeVisible();
  await expect(
    onboarding.getByText(
      "The seller submits evidence and a link. The buyer accepts it or asks for a specific change.",
    ),
  ).toBeVisible();
  await expect(
    onboarding.getByText(
      "A human approves. Only then does the provider capture that milestone; the audit trail records it.",
    ),
  ).toBeVisible();

  // Gate item 1: the required approval sentence is present.
  await expect(
    onboarding.getByText(
      /A human approves\. Only then does the provider capture that milestone/,
    ),
  ).toBeVisible();

  // Gate item 1: the link to the guided demo (/demo) is present.
  const demoLink = onboarding.getByRole("link", { name: "guided demo" });
  await expect(demoLink).toBeVisible();
  await expect(demoLink).toHaveAttribute("href", "/demo");

  // Gate item 1: a second click on the summary collapses the explainer.
  await summary.click();
  await expect(onboarding).not.toHaveAttribute("open");
  await expect(onboarding.getByText("Step 1")).toBeHidden();
  await expect(onboarding.getByText("Agree")).toBeHidden();
});
