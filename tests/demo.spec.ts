import { expect, test } from "@playwright/test";

/**
 * The guided demo is the public, browser-only experience. It must work with no
 * database, no session and no payment provider, and it must never claim a real
 * PayPal transaction.
 */
test.describe("guided demo", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/demo", { waitUntil: "networkidle" });
    await expect(page.getByText(/DEMO MODE/)).toBeVisible();
  });

  test("runs the whole lifecycle and updates the money summary", async ({ page }) => {
    const providerCalls: string[] = [];
    page.on("request", (request) => {
      if (/paypal/i.test(request.url())) providerCalls.push(request.url());
    });

    const cards = page.locator("li.milestone-card");
    await expect(cards).toHaveCount(2);

    // Buyer places the simulated hold.
    await page.getByRole("button", { name: "Place simulated hold" }).click();
    const moneyStrip = page
      .locator("dl")
      .filter({ hasText: "Authorized" })
      .filter({ hasText: "Captured" })
      .first();
    await expect(moneyStrip).toContainText("$2,000.00");

    // Seller submits evidence for the second milestone.
    await page.getByRole("button", { name: /Jamie Seller/ }).click();
    const secondCard = cards.nth(1);
    await secondCard.getByLabel("Evidence note").fill(
      "Responsive build is live at 375, 768 and 1440 with a handoff note.",
    );
    await secondCard.getByRole("button", { name: "Submit evidence" }).click();
    await expect(secondCard.getByText(/Awaiting review/i).first()).toBeVisible();

    // Buyer accepts the delivered evidence and approves the milestone.
    await page.getByRole("button", { name: /Alex Buyer/ }).click();
    const firstCard = cards.nth(0);
    await firstCard.getByRole("button", { name: "Accept evidence" }).click();
    await expect(
      firstCard.getByRole("button", { name: "Approve milestone" }),
    ).toBeEnabled();
    await firstCard.getByRole("button", { name: "Approve milestone" }).click();

    await expect(firstCard.getByText(/Human decision recorded/)).toBeVisible();
    await expect(moneyStrip).toContainText("$1,200.00");
    await expect(firstCard.getByText(/SIMULATED capture/)).toBeVisible();

    // The demo never contacts PayPal.
    expect(providerCalls).toEqual([]);
  });

  test("a reviewer cannot approve or review evidence", async ({ page }) => {
    const firstCard = page.locator("li.milestone-card").first();
    await page.getByRole("button", { name: /Morgan Reviewer/ }).click();
    await expect(firstCard.getByText(/cannot act on it/i)).toBeVisible();
    await expect(
      firstCard.getByRole("button", { name: "Accept evidence" }),
    ).toHaveCount(0);
    await expect(
      firstCard.getByRole("button", { name: "Approve milestone" }),
    ).toHaveCount(0);
  });

  test("requesting changes requires a reason and blocks approval", async ({ page }) => {
    await page.getByRole("button", { name: "Place simulated hold" }).click();
    const firstCard = page.locator("li.milestone-card").first();
    await firstCard.getByRole("button", { name: "Request changes" }).click();
    await expect(page.getByRole("status")).toContainText(/explain what needs to change/i);

    await firstCard
      .getByLabel(/What needs to change/i)
      .fill("Navigation states are missing.");
    await firstCard.getByRole("button", { name: "Request changes" }).click();
    await expect(firstCard.getByText(/Changes requested/i).first()).toBeVisible();
    await expect(
      firstCard.getByRole("button", { name: "Approve milestone" }),
    ).toBeDisabled();
  });

  test("keeps its state across a reload and resets on demand", async ({ page }) => {
    await page.getByRole("button", { name: "Place simulated hold" }).click();
    await expect(page.getByText("Authorized").first()).toBeVisible();

    await page.reload();
    await expect(page.getByText(/DEMO MODE/)).toBeVisible();
    await expect(page.getByText("Authorized").first()).toBeVisible();

    await page.getByRole("button", { name: "Reset demo" }).click();
    await expect(page.getByText("Ready for Authorization").first()).toBeVisible();
  });

  test("fits the viewport without horizontal scrolling", async ({ page }) => {
    const overflow = await page.evaluate(() => {
      const documentWidth = document.documentElement.scrollWidth;
      return {
        documentWidth,
        viewportWidth: window.innerWidth,
      };
    });
    expect(overflow.documentWidth).toBeLessThanOrEqual(overflow.viewportWidth + 1);
  });
});
