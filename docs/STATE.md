# FairHold — release state (2026-11-13)

## Branch
`main` — identical to `origin/main`.

History for this release (no force-push, no history rewrite, no `--reset --hard`):

```
d6a08d4    release: harden sign-out, correct release documentation, ship the re-rendered film   <- origin/main
0c92be3    docs(release): record the 3-minute product film in the release report
f603cb8    feat(video): add the 3-minute FairHold product film
d36a257    fix(data): honour the explicit JSON pin in production only when no database is configured
05c4274    release: curate repository, add reviewer role, publish final report
3838590    chore: integrate final branding and release preparation
186147d    feat: premium shield logo branding
92a0615    chore(deps): sync package-lock.json for CI npm ci validation   <- origin/main before this release
```

`feat/sprint-functional-completion` is preserved locally and remotely. The repository has no
branch protection requiring a pull request, so releases are published with a fast-forward
`git push origin main`. This release was pushed as `d36a257..d6a08d4` with no force, no
`reset --hard` and no history rewrite.

## Verified this release (evidence)
- `npm ci` → clean install completed (8 vulnerabilities: 7 moderate, 1 high — advisory only)
- `npm run typecheck` → exit 0
- `npm run lint` → **exit 0** (verified 2026-11-13). `production/brag-video/source/*.cjs` were converted to `.mjs` (the `@typescript-eslint/no-require-imports` failures and the one unused variable are gone), and the whole repository lints clean — `npx eslint app components tests lib scripts` also exits 0.
- `npm test` → **296 tests, 268 pass, 0 fail, 28 skip, exit 0** (the 28 skips are the
  PostgreSQL-requiring suites — 14 `postgres:` data suites and 14 `webhook:` integration
  suites — which need `FAIRHOLD_TEST_DATABASE_URL` pointing at an isolated PostgreSQL
  instance. **That instance was not available in the verification environment for this
  release, so the PostgreSQL-backed suites are unverified here.** The 296/296 figure is the
  expected result with an isolated PostgreSQL 16; it has not been observed in this release.)
- `npm run build` → exit 0, Next.js 16.4.3 Turbopack, 11 routes (including the new
  `POST /logout`)
- `npm run test:e2e` → **93/93** across the three default Playwright Chromium projects
  (desktop, mobile, tablet), 31 tests each, exit 0
- `node scripts/run-e2e.mjs --project=desktop-firefox` → 31/31, exit 0
- `node scripts/run-e2e.mjs --project=desktop-webkit` → **31/31**, exit 0, clean first pass
  on the release run. An earlier pre-release WebKit run showed a single flake —
  `tests/evidence-lifecycle.spec.ts:376`, a 10 s `expect` timeout on a client-side RSC
  navigation under load — which did not reproduce.
- `scripts/run-e2e.mjs:34` hardcodes `PROJECTS = ["desktop-chromium", "mobile-chromium",
  "tablet-chromium"]`, so **Firefox and WebKit are opt-in by name and are not part of
  `npm run test:e2e`**. Each needs its own `--project=…` invocation.
- Judge journey against production → **previously verified** (2026-11-12) as **22/22
  checks passed** (landing, roles, simulation disclosure, guided demo, sign-in, dashboard,
  deal creation, mobile overflow, zero console errors). **It was not re-executed in full
  during this release.** The checks that *were* re-run from this session are listed in
  `RELEASE_REPORT.md` §4 — landing page, `/login` form fields, sign-in as `Alex Buyer`,
  `/dashboard`, and the signed-in deal page rendering "Create PayPal sandbox
  authorization". The console-error, mobile-overflow, shield-geometry and audit-trail
  checks were not re-run and are not claimed as re-verified.
- Production HTML verified to serve the approved shield branding:
  `<link rel="icon" href="/fairhold-shield.svg" type="image/svg+xml">` and navbar
  `<use href="/fairhold-shield.svg">`

## Defects found and fixed in this release
- **Sign-out could be swallowed by the hydration window (WebKit).** The sign-out control
  was a server-action form (`<form action={logoutAction}>`). A server-action form is inert
  until React hydrates and swaps the action for a `javascript:` guard; a click landing
  inside that takeover window was swallowed and the user stayed signed in. The suite
  guard (`not.toHaveAttribute("action", /^javascript:/)`) is satisfied instantly by the SSR
  markup, so it never proved hydration — the archived QA report records the same defect on
  the tablet project in an earlier sprint, mitigated test-side only. Fixed at the root:
  sign-out is now a native form post to `POST /logout` (`app/logout/route.ts`), which
  clears the cookie and returns `303 See Other` to `/`. POST-only on purpose — a GET
  logout would let any third-party page sign a user out with an image tag. Five
  regression tests were added in `tests/progressive-enhancement.spec.ts`: the control is a
  native `POST` form, `POST /logout` returns `303` and clears the cookie, hydration does not
  take the form over, `GET /logout` is refused with `405` without touching the session, and
  `POST /logout` redirects to the application root.
- **A production data-backend rule broke the end-to-end harness.** Requiring PostgreSQL
  unconditionally in production meant the Playwright servers (which run `next start`,
  i.e. `NODE_ENV=production`, with `DATABASE_URL` blanked and `FAIRHOLD_DATA_BACKEND=json`
  pinned) selected PostgreSQL with no URL and every render threw. The pin is now honoured
  in production *only* when no real `DATABASE_URL` is configured, so a configured
  PostgreSQL always wins and a real outage still fails loudly.

## Repository curation (this release)
- Nine historical root documents moved to `docs/archive/`: `FAIRHOLD_STATE.md`,
  `FINAL_RELEASE_REPORT.md`, `FINAL_REMAINING_WORK.md`, `HANDOFF.md`, `QA_REPORT.md`,
  `TASKS.md`, `DECISIONS.md`, `RELEASE_CHECKLIST.md`, `DEMO.md` — plus a
  `docs/archive/README.md` index explaining what is archived and why.
- Deleted three unreferenced legacy branding files: `public/favicon.svg`,
  `public/shield-logo.svg`, `public/shield-wordmark.svg`.
- Kept `public/fairhold-hero.svg` (still linked from the README footer and CHANGELOG)
  and `public/fairhold-shield.svg` (the approved logo, integrated everywhere).
- `.gitignore` extended with Lighthouse output patterns (`lighthouse-*.json`,
  `*.lighthouse.json`, `lighthouse-report/`, `.lighthouseci/`).
- All documentation links repointed at `docs/archive/…`; `README.md` documentation
  index now leads with `RELEASE_REPORT.md` as the canonical current report.

## Branding
`public/fairhold-shield.svg` is the approved asset and is used for the favicon and the
navbar mark in `app/layout.tsx`. Red-and-black identity preserved.

## Production environment (names and scopes only — values are never read here)
Configured on the Vercel **Production** scope: `DATABASE_URL`, `FAIRHOLD_SESSION_SECRET`,
`NEXT_PUBLIC_APP_URL`, the three demo allowlists, `FAIRHOLD_REVIEWER_DEALS`,
`FAIRHOLD_ALLOW_SIMULATED_PAYMENTS=true`, `GEMINI_API_KEY`, `GEMINI_MODEL`, and the PayPal
**sandbox** credential set `PAYPAL_ENV` / `PAYPAL_CLIENT_ID` / `PAYPAL_CLIENT_SECRET`.

Those `PAYPAL_*` values are inherited at **team** level, so a project-scoped
`vercel env ls` does not list them for Production — the omission in the listing was not an
absence in the environment. **Names only are recorded here; no value is read, printed or
committed.**

Consequence, verified against the live deployment on 2026-11-13: the **signed-in workspace**
uses the **PayPal sandbox** provider — the live deal page renders the button "Create PayPal
sandbox authorization", which is produced only when `provider.mode === "sandbox"`
(`app/deals/[id]/page.tsx:151`, button at lines 370-372). An authorization there creates a
**real order in the PayPal sandbox**, and the buyer must approve it in a PayPal sandbox
account before the hold completes. No live money moves: `readPayPalConfig()` returns `null`
unless `PAYPAL_ENV` is exactly `sandbox`, so **PayPal Live is architecturally refused**.

The **guided demo** (`/demo`) is a separate, browser-only path that uses the in-app
**simulated** provider — no server writes, no provider calls — and says so on screen
("DEMO MODE — SIMULATED PAYMENTS", "Simulated action — no PayPal request was made.").

**Public judge URL: https://fairhold-beta.vercel.app** — no account needed. The
per-deployment URLs and the project alias are behind Vercel Deployment Protection (SSO)
and are not the judge entry point.

## Safety corrections carried in this release
- `resolveDataBackend()` in `lib/data/db.ts` — production **requires** PostgreSQL;
  there is no silent JSON fallback. The only exception is an explicit, auditable
  operator pin (`FAIRHOLD_DATA_BACKEND=json`), honoured in production only when no
  real `DATABASE_URL` is configured, so it can never mask a configured database.
  The deployed production scope does not set it. Covered by regression tests in
  `lib/data/db.test.ts`.
- `getPaymentProvider()` — selects the PayPal **sandbox** provider only when
  `readPayPalConfig()` is non-null (that is, `PAYPAL_ENV` is exactly `sandbox` with
  non-placeholder credentials) **and** PostgreSQL is configured; otherwise it returns the
  in-app demo provider. No silent downgrade mid-flow, no PayPal Live path.
- No PayPal Live, no real money movement, the original $600 capture was not touched.

## External blockers (unchanged — do not wait on)
- PayPal sandbox **lifecycle** verification: the sandbox credentials are present in
  Production, but no sandbox order has been approved, captured or reconciled from this
  environment, and `PAYPAL_WEBHOOK_ID` is not confirmed there (without it the webhook
  route answers `503 webhook not configured`). A public HTTPS webhook URL plus
  `PAYPAL_WEBHOOK_ID` is still required.
- Live Gemini calls (the key is not available in this environment; the deterministic
  fallback is labelled and tested)
- Hosted-PostgreSQL connectivity unverified from this environment; `DATABASE_URL` is a
  Vercel Secret and cannot be inspected here. Confirm it is a dedicated production
  database with a backup/recovery plan before relying on it.
- Object storage for evidence files (currently local disk — does not survive a
  serverless redeploy)
- The reviewer grant (`morgan reviewer:demo-deal-1`) only resolves if a deal with that
  id exists in the production database; otherwise it fails closed harmlessly
- Vercel Deployment Protection (SSO) on direct deployment URLs — left enabled by design

## Next action
Owner completes the actions in `RELEASE_REPORT.md` (§ Manual actions required): confirm the
PayPal **sandbox** credential set and add `PAYPAL_WEBHOOK_ID` (the sandbox credentials are
already in Production), confirmation that the production PostgreSQL is a dedicated instance
with backups, and a decision on the reviewer grant.
