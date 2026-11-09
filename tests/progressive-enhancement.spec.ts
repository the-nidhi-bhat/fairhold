import { expect, test } from "@playwright/test";

// Server actions in a server component render as a real POST form (with a
// $ACTION_ID field) during SSR; React only swaps in its javascript: guard when
// it hydrates. This test holds the sign-in form to that promise with client
// JavaScript disabled, so the pre-hydration submit path is covered instead of
// assumed.
//
// Deliberately out of scope: the dashboard body. It is streamed through
// <Suspense>, and streamed regions need client JavaScript to complete, so a
// JavaScript-disabled client sees the shell and the skeleton. That is a real
// limit, recorded in FINAL_RELEASE_REPORT.md, not something this test hides.
test.describe("progressive enhancement", () => {
  test.use({ javaScriptEnabled: false });

  test("the sign-in form posts and authenticates without client JavaScript", async ({
    page,
  }) => {
    await page.goto("/login");
    await expect(page.getByLabel("Display name")).toBeVisible();
    await page.getByLabel("Display name").fill("Alex Buyer");
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(
      page.getByRole("navigation", { name: "Primary" }),
    ).toBeVisible();
  });
});
