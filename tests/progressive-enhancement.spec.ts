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

  // Regression cover for the swallowed sign-out click. Sign-out used to be a
  // server action, so the form was inert until React hydrated and took it
  // over; a click landing inside that takeover window did nothing and the
  // user stayed signed in. WebKit reproduced it. The control is now a plain
  // POST form, so it no longer depends on hydration at all.
  //
  // The header is streamed through <Suspense>, so with client JavaScript
  // disabled the control never reaches the DOM. The assertion is therefore
  // made against the server-rendered markup, which is what actually decides
  // whether the control needs hydration.
  test("the sign-out control is a native POST form, not a hydration-dependent server action", async ({
    page,
    context,
  }) => {
    await page.goto("/login");
    await page.getByLabel("Display name").fill("Alex Buyer");
    await page.getByLabel("Demo role").selectOption("buyer");
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page).toHaveURL(/\/dashboard/);

    const html = await (await context.request.get("/dashboard")).text();
    const logoutForm = html.match(
      /<form[^>]*action="\/logout"[^>]*>[\s\S]*?<\/form>/,
    );
    expect(logoutForm).not.toBeNull();

    const form = logoutForm?.[0] ?? "";
    expect(form).toContain('method="post"');
    // A React server-action form always advertises itself with a hidden
    // $ACTION_ID input. A native form never does.
    expect(form).not.toContain("$ACTION_ID");
  });

  test("POST /logout clears the session cookie", async ({ page, context }) => {
    await page.goto("/login");
    await page.getByLabel("Display name").fill("Alex Buyer");
    await page.getByLabel("Demo role").selectOption("buyer");
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page).toHaveURL(/\/dashboard/);

    const hasSessionCookie = async (): Promise<boolean> =>
      (await context.cookies()).some(
        (cookie) => cookie.name === "fairhold_session",
      );
    expect(await hasSessionCookie()).toBe(true);

    const response = await context.request.post("/logout", { maxRedirects: 0 });
    expect(response.status()).toBe(303);
    expect(await hasSessionCookie()).toBe(false);
  });

  // The 405 is documented behaviour in API_REFERENCE.md, and it is the only
  // thing standing between a third-party page and a forced sign-out: a GET
  // logout would be reachable with a plain <a href> or an <img src>. Without
  // this test a refactor that added a GET handler would pass the whole suite.
  test("GET /logout is refused with 405 and leaves the session untouched", async ({
    page,
    context,
  }) => {
    await page.goto("/login");
    await page.getByLabel("Display name").fill("Alex Buyer");
    await page.getByLabel("Demo role").selectOption("buyer");
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page).toHaveURL(/\/dashboard/);

    const hasSessionCookie = async (): Promise<boolean> =>
      (await context.cookies()).some(
        (cookie) => cookie.name === "fairhold_session",
      );
    expect(await hasSessionCookie()).toBe(true);

    const response = await context.request.get("/logout");
    expect(response.status()).toBe(405);

    // A refused GET must not sign the user out either.
    expect(await hasSessionCookie()).toBe(true);
  });

  // The status code alone does not pin the redirect target: a 303 to any other
  // path would still satisfy the previous test. This one asserts where the
  // user actually lands - the application root, on the app's own origin.
  test("POST /logout redirects to the application root", async ({
    page,
    context,
  }) => {
    await page.goto("/login");
    await page.getByLabel("Display name").fill("Alex Buyer");
    await page.getByLabel("Demo role").selectOption("buyer");
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page).toHaveURL(/\/dashboard/);

    const response = await context.request.post("/logout", { maxRedirects: 0 });
    expect(response.status()).toBe(303);

    const location = response.headers()["location"];
    expect(location).toBeTruthy();

    // The route builds an absolute URL from the request, so the assertion is
    // on the pathname and the origin rather than on a literal string.
    const origin = new URL(page.url()).origin;
    const target = new URL(location as string, origin);
    expect(target.pathname).toBe("/");
    expect(target.origin).toBe(origin);
  });
});

// The same control, checked once the page has hydrated. React takes over a
// server-action form and rewrites its action to a `javascript:` guard; a
// native form is left alone. This proves the sign-out click cannot land in a
// hydration takeover window.
test.describe("sign-out control", () => {
  test.use({ javaScriptEnabled: true });

  test("hydration does not take the sign-out form over", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Display name").fill("Alex Buyer");
    await page.getByLabel("Demo role").selectOption("buyer");
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page).toHaveURL(/\/dashboard/);

    const form = page
      .getByRole("button", { name: /Sign out/ })
      .locator("xpath=ancestor::form[1]");
    await expect(form).toHaveAttribute("method", "post");
    await expect(form).toHaveAttribute("action", "/logout");
    await expect(form).not.toHaveAttribute("action", /^javascript:/);
  });
});
