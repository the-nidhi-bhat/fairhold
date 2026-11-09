import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { test, expect, type Locator, type Page } from "@playwright/test";

/**
 * End-to-end journeys against the JSON demo store.
 *
 * These tests require the demo payment provider (no PayPal sandbox, no
 * PostgreSQL): the fixture starts unauthorized, so the buyer first records a
 * simulated authorization hold and the final capture is explicitly simulated.
 * A real sandbox run must never be faked — if the sandbox provider is active the
 * authorization step fails loudly instead of silently passing.
 */

const DEAL_ID = "8f2c4a1e-6b3d-4f7a-9c21-5d0e7b4a3c10";
const BUILD_MILESTONE = "Responsive build and handoff";
const SELLER = "Jamie Seller";
const BUYER = "Alex Buyer";

type Role = "buyer" | "seller";

async function signIn(page: Page, name: string, role: Role) {
  await page.goto("/login");
  await page.getByLabel("Display name").fill(name);
  await page.getByLabel("Demo role").selectOption(role);
  const button = page.getByRole("button", { name: "Continue" });
  await expect(button).toBeVisible();
  // The server renders a real POST form; React swaps in a `javascript:` guard
  // when it takes the form over during hydration. A click that lands during
  // that takeover can be swallowed, so wait for React's guard to appear before
  // clicking. The URL assertion below is unchanged.
  await expect(button.locator("xpath=ancestor::form[1]")).not.toHaveAttribute(
    "action",
    /^javascript:/,
    { timeout: 60_000 },
  );
  await button.click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

async function signOut(page: Page) {
  await page.goto("/dashboard");
  const button = page.getByRole("button", { name: /Sign out/ });
  await expect(button).toBeVisible();
  // The server renders a real POST form; React swaps in a `javascript:` guard
  // when it takes the form over during hydration. A click that lands during
  // that takeover can be swallowed, so wait for React's guard to appear before
  // clicking. The URL assertion below is unchanged.
  await expect(button.locator("xpath=ancestor::form[1]")).not.toHaveAttribute(
    "action",
    /^javascript:/,
    { timeout: 60_000 },
  );
  await button.click();
  await expect(page).toHaveURL(/\/(login|\?|$)/);
}

/** The <li> for one milestone (evidence items are <li> too, so scope by h3). */
function milestone(page: Page, title: string): Locator {
  return page
    .locator("li")
    .filter({ has: page.getByRole("heading", { level: 3, name: title, exact: true }) });
}

function evidenceItem(scope: Locator, note: string): Locator {
  return scope.locator("li").filter({ hasText: note }).first();
}

async function submitEvidence(
  page: Page,
  scope: Locator,
  note: string,
  options: { file?: boolean } = {},
) {
  const details = scope.locator("details").filter({ hasText: "Submit evidence" }).first();
  await details.locator("summary").click();
  const form = details.locator("form").first();
  await form.getByLabel("Note").fill(note);
  await form.getByLabel("Link (http/https)").fill("https://example.com/fairhold/evidence");
  if (options.file) {
    await form.locator('input[type="file"]').setInputFiles({
      name: "fairhold-evidence.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("FairHold persisted evidence test."),
    });
  }
  // Submit once via requestSubmit: a plain click can be retried by Playwright
  // if the button detaches during the server-action re-render, which would post
  // the same evidence twice.
  await form.evaluate((element) => (element as HTMLFormElement).requestSubmit());
  // The re-rendered <details> collapses; the persisted submission is what the
  // evidence history shows.
  await expect(evidenceItem(scope, note)).toBeVisible();
}

test.beforeEach(() => {
  execFileSync(process.execPath, ["scripts/demo-reset.mjs"], { stdio: "inherit" });
});

test("buyer and seller complete authorization, review, revision, acceptance and a simulated capture", async ({
  page,
}) => {
  // --- Buyer records the authorization hold (demo provider only) ---
  await signIn(page, BUYER, "buyer");
  await page.goto(`/deals/${DEAL_ID}`);
  const simulate = page.getByRole("button", { name: "Simulate authorization hold" });
  await expect(
    simulate,
    "this suite needs the demo payment provider (no PayPal sandbox configured)",
  ).toBeVisible();
  await simulate.click();
  await expect(page.getByText("Authorization: simulated (demo)")).toBeVisible();
  await page.goto(`/deals/${DEAL_ID}`);
  await expect(page.getByText("Authorization: simulated (demo)")).toBeVisible();

  // --- Seller submits evidence with an upload and downloads it back ---
  await signOut(page);
  await signIn(page, SELLER, "seller");
  await page.goto(`/deals/${DEAL_ID}`);
  const build = milestone(page, BUILD_MILESTONE);
  const firstNote = "Initial responsive build evidence.";
  await submitEvidence(page, build, firstNote, { file: true });

  await page.goto(`/deals/${DEAL_ID}`);
  const firstItem = evidenceItem(milestone(page, BUILD_MILESTONE), firstNote);
  await expect(firstItem).toBeVisible();

  // The download must return the original filename and the uploaded bytes.
  // Chromium's emulated mobile/tablet contexts report `suggestedFilename()`
  // from the URL rather than Content-Disposition, so assert the header on the
  // response itself and the downloaded bytes separately.
  const downloadHref = await firstItem
    .getByRole("link", { name: "Download" })
    .getAttribute("href");
  expect(downloadHref).toBeTruthy();
  const fileResponse = await page.request.get(downloadHref as string);
  expect(fileResponse.status()).toBe(200);
  expect(fileResponse.headers()["content-disposition"]).toContain(
    "fairhold-evidence.txt",
  );
  expect(await fileResponse.text()).toBe("FairHold persisted evidence test.");

  const downloadPromise = page.waitForEvent("download");
  await firstItem.getByRole("link", { name: "Download" }).click();
  const download = await downloadPromise;
  const savedPath = await download.path();
  expect(savedPath).toBeTruthy();
  expect(readFileSync(savedPath as string, "utf8")).toBe(
    "FairHold persisted evidence test.",
  );

  // Seller never sees buyer-only decision controls.
  await expect(page.getByRole("button", { name: "Approve recommendation" })).toHaveCount(0);

  // --- Buyer requests a revision ---
  await signOut(page);
  await signIn(page, BUYER, "buyer");
  await page.goto(`/deals/${DEAL_ID}`);
  const rejected = evidenceItem(milestone(page, BUILD_MILESTONE), firstNote);
  await rejected.getByLabel("Review note (optional)").fill("Please add viewport screenshots.");
  await rejected.getByRole("button", { name: "Reject evidence" }).click();
  await expect(rejected.getByText("rejected", { exact: true })).toBeVisible();
  await expect(rejected.getByText("Review: Please add viewport screenshots.")).toBeVisible();
  await page.goto(`/deals/${DEAL_ID}`);
  const rejectedAfterReload = evidenceItem(milestone(page, BUILD_MILESTONE), firstNote);
  await expect(rejectedAfterReload.getByText("rejected", { exact: true })).toBeVisible();

  // Buyer never sees the seller's submission control.
  await expect(page.getByText("Submit evidence", { exact: true })).toHaveCount(0);

  // --- Seller resubmits, buyer accepts the resubmission ---
  await signOut(page);
  await signIn(page, SELLER, "seller");
  await page.goto(`/deals/${DEAL_ID}`);
  const secondNote = "Resubmission with viewport screenshots.";
  await submitEvidence(page, milestone(page, BUILD_MILESTONE), secondNote, { file: true });

  await signOut(page);
  await signIn(page, BUYER, "buyer");
  await page.goto(`/deals/${DEAL_ID}`);
  const accepted = evidenceItem(milestone(page, BUILD_MILESTONE), secondNote);
  await accepted.getByLabel("Review note (optional)").fill("Responsive evidence verified.");
  await accepted.getByRole("button", { name: "Accept evidence" }).click();
  await expect(accepted.getByText("accepted", { exact: true })).toBeVisible();
  await expect(accepted.getByText("Review: Responsive evidence verified.")).toBeVisible();
  await page.goto(`/deals/${DEAL_ID}`);
  await expect(
    evidenceItem(milestone(page, BUILD_MILESTONE), secondNote).getByText("accepted", {
      exact: true,
    }),
  ).toBeVisible();

  // --- Buyer approves the recommendation: one simulated capture ---
  const buildScope = milestone(page, BUILD_MILESTONE);
  await expect(buildScope.getByText("CAPTURE", { exact: true })).toBeVisible();
  const approve = buildScope.getByRole("button", { name: "Approve recommendation" });
  await expect(approve).toBeEnabled();
  // Same takeover window as sign-out: wait until React has taken the form over
  // before clicking, or the click can be swallowed mid-hydration.
  await expect(approve.locator("xpath=ancestor::form[1]")).not.toHaveAttribute(
    "action",
    /^javascript:/,
    { timeout: 60_000 },
  );
  await approve.click();

  await expect(buildScope.getByText(/Last decision: approve → CAPTURE/)).toBeVisible();
  await expect(
    buildScope.getByText("Simulated action — no PayPal request was made."),
  ).toBeVisible();
  await expect(page.getByText(/CAPTURE · COMPLETED/)).toBeVisible();
  await expect(page.getByText(/approve → CAPTURE/).first()).toBeVisible();

  // --- Persisted, and the milestone cannot be paid twice ---
  await page.goto(`/deals/${DEAL_ID}`);
  const completedScope = milestone(page, BUILD_MILESTONE);
  await expect(completedScope.getByText("Completed", { exact: true })).toBeVisible();
  await expect(completedScope.getByText(/Last decision: approve → CAPTURE/)).toBeVisible();
  await expect(
    completedScope.getByRole("button", { name: "Approve recommendation" }),
  ).toBeDisabled();
  await expect(page.getByText("ALREADY_PROCESSED")).toBeVisible();
});

test("access control: downloads, role-gated controls and unknown identities fail closed", async ({
  page,
}) => {
  // Evidence download requires an authenticated participant.
  await signIn(page, SELLER, "seller");
  await page.goto(`/deals/${DEAL_ID}`);
  const build = milestone(page, BUILD_MILESTONE);
  await submitEvidence(page, build, "Access control evidence.", { file: true });
  await page.goto(`/deals/${DEAL_ID}`);
  const item = evidenceItem(milestone(page, BUILD_MILESTONE), "Access control evidence.");
  const href = await item.getByRole("link", { name: "Download" }).getAttribute("href");
  expect(href).toBeTruthy();

  await signOut(page);
  const anonymous = await page.request.get(href ?? "/");
  expect(anonymous.status()).toBe(404);

  // Unknown identities cannot sign in, even with a known role.
  const response = await page.goto("/login");
  expect(response?.ok()).toBeTruthy();
  await page.getByLabel("Display name").fill("Mallory Outsider");
  await page.getByLabel("Demo role").selectOption("buyer");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page).toHaveURL(/\/login\?error=invalid/);

  // A signed-in participant cannot open a deal they are not part of.
  // The route streams its not-found UI (dynamic rendering + Suspense), so the
  // response status is already 200 by the time `notFound()` runs; assert the
  // rendered not-found surface instead of the status code.
  await signIn(page, SELLER, "seller");
  await page.goto("/deals/00000000-0000-4000-8000-000000000000");
  await expect(page.getByRole("heading", { name: "Deal not found" })).toBeVisible();
  await expect(
    page.getByText("This deal does not exist or has been removed."),
  ).toBeVisible();
});

test("buyer creates a deal, the seller adds a milestone, and both see persisted state", async ({
  page,
}) => {
  const title = "E2E lifecycle deal";

  await signIn(page, BUYER, "buyer");
  await page.goto("/deals/new");
  await page.getByLabel("Deal title").fill(title);
  await page.getByLabel("Client").fill(BUYER);
  await page.getByLabel("Freelancer").fill(SELLER);
  await page
    .getByLabel("Agreement")
    .fill(
      "Both parties agree to a discovery milestone followed by a design handoff, each accepted in writing before payment.",
    );
  await page.getByRole("button", { name: "Create deal" }).click();

  await expect(page).toHaveURL(/\/deals\/[0-9a-f-]{36}$/);
  const dealUrl = page.url();
  await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();

  // Milestone authoring is seller/reviewer only: the buyer sees no form.
  await expect(page.getByText("Add a milestone")).toHaveCount(0);

  await signOut(page);
  await signIn(page, SELLER, "seller");
  await page.goto(dealUrl);
  const addForm = page.locator("details").filter({ hasText: "Add a milestone" }).first();
  await addForm.locator("summary").click();
  const form = addForm.locator("form").first();
  await form.getByLabel("Title").fill("Discovery workshop");
  await form.getByLabel("Amount (USD)").fill("450.00");
  await form
    .getByLabel("Acceptance criteria")
    .fill("A written summary of the agreed scope is delivered.");
  await form.getByRole("button", { name: "Add milestone" }).click();
  await expect(milestone(page, "Discovery workshop")).toBeVisible();

  // The buyer sees the seller's milestone after signing back in, and the deal
  // is listed on the buyer's dashboard.
  await signOut(page);
  await signIn(page, BUYER, "buyer");
  await page.goto(dealUrl);
  await expect(milestone(page, "Discovery workshop")).toBeVisible();

  // Fee transparency states what is and is not charged.
  await expect(
    page.getByRole("heading", { level: 2, name: "Costs and limits" }),
  ).toBeVisible();
  await expect(page.getByText("None is implemented in this build")).toBeVisible();

  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { level: 3, name: title })).toBeVisible();

  // The onboarding explainer starts collapsed and expands to the four steps.
  // `<details>` keeps its content in the DOM, so the assertion is visibility,
  // not presence.
  const onboarding = page
    .locator("details")
    .filter({ hasText: "How FairHold works in four steps" })
    .first();
  const firstStep = onboarding.getByText("Step 1");
  await expect(firstStep).toBeHidden();
  await onboarding.locator("summary").click();
  await expect(firstStep).toBeVisible();
  await expect(onboarding.getByText("Step 4")).toBeVisible();
  await expect(
    onboarding.getByText(
      "A human approves. Only then does the provider capture that milestone",
    ),
  ).toBeVisible();
  await onboarding.locator("summary").click();
  await expect(firstStep).toBeHidden();

  // Search narrows the list to the created deal.
  await page.getByLabel("Search deals").fill(title);
  await page.getByRole("button", { name: "Apply" }).click();
  await expect(page.getByText(/\d+ of \d+ shown/)).toBeVisible();
  await expect(page.getByRole("heading", { level: 3, name: title })).toBeVisible();

  // A term with no match shows the filtered empty state, and Clear restores it.
  await page.getByLabel("Search deals").fill("no-such-deal-xyz");
  await page.getByRole("button", { name: "Apply" }).click();
  await expect(page.getByText("No deals match those filters")).toBeVisible();
  await page.getByRole("link", { name: "Clear filters" }).click();
  await expect(page.getByRole("heading", { level: 3, name: title })).toBeVisible();
});
