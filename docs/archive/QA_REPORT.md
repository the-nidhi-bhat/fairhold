# FairHold MVP QA report

> **Superseded (2026-11-13) — PayPal sandbox credentials.** The findings in this file that report
> no PayPal sandbox credentials in Production — including "sandbox credentials were unavailable",
> "`PAYPAL_*` and the demo allowlists" being absent from every scope, and the live-sandbox row
> being blocked on missing credentials — are **incorrect** as to the credentials. PayPal **sandbox**
> credentials (`PAYPAL_ENV`, `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`) **are** configured in the
> Production scope: they are inherited at **team** level, which is why a project-scoped
> `vercel env ls` does not list them for Production. The signed-in workspace therefore uses the
> **PayPal sandbox** provider — authorizing a deal there creates a **real order in the PayPal
> sandbox** that the buyer must approve in a PayPal sandbox account. PayPal **Live** remains
> architecturally impossible: `readPayPalConfig()` returns `null` unless `PAYPAL_ENV` is exactly
> `sandbox`, so no live adapter can be built and no live money can move. The guided `/demo` page is
> a separate, browser-only path that uses the in-app **simulated** provider and says so on screen.
> The *public webhook*, `PAYPAL_WEBHOOK_ID` and an approved + captured sandbox order remain
> outstanding. See [RELEASE_REPORT.md](../../RELEASE_REPORT.md) §2 and §8. The original text is
> retained below for history.

## Baseline observed 2026-11-01

- Typecheck: passed after generated Next.js types settled.
- ESLint: passed.
- Production build: passed.
- Tests: 146 total; 125 passed; 21 skipped; 0 failed.
- All 21 skipped tests require an isolated PostgreSQL test database.
- `FAIRHOLD_TEST_DATABASE_URL` is not set.

## Required before MVP claim

## Critical integrity remediation verification

- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm test`: 160 tests total, 139 passed, 21 skipped, 0 failed.
- `npm run build`: passed.
- PostgreSQL integration tests remain skipped because
  `FAIRHOLD_TEST_DATABASE_URL` was unset.
- Live PayPal sandbox operations and browser/E2E flows remain unverified.

- Execute PostgreSQL integrations against an isolated database.
- Exercise buyer/seller authorization and forbidden-access cases.
- Exercise PayPal sandbox authorization and reconciliation where credentials exist.
- Run desktop and mobile browser verification.
- Verify no protected secrets are present in commits.

## MVP continuation verification — 2026-11-01

- Typecheck: passed.
- ESLint: passed.
- Production build: passed.
- Node test runner: 152 tests total, 131 passed, 21 skipped, 0 failed.
- 21 PostgreSQL integration tests remain skipped because
  `FAIRHOLD_TEST_DATABASE_URL` was not set.
- Browser/E2E: not executed; browser automation and authenticated desktop/mobile
  sessions were not available in the verification environment.
- Live PayPal sandbox: not executed; sandbox credentials were unavailable.

## Post-audit hardening verification

- Authentication correction commit: `a75a9f1`.
- Payment state correction commit: `1e921a5`.
- TypeScript: passed.
- ESLint: passed.
- Production build: passed.
- Node test runner: 157 total, 136 passed, 21 skipped, 0 failed.
- PostgreSQL integration tests: skipped; isolated database unavailable.
- Live PayPal: not executed.
- Browser/E2E: not executed.
- PayPal adapter unit tests are included in the passing suite; network operations
  are simulated by transport doubles and not claimed as live sandbox proof.

## Payment Integrity Remediation 2 — implementation checkpoint

- Provider-confirmed PostgreSQL captures are written to the payment operation
  and capture ledger in the same transaction; the two records do not depend on
  a later milestone approval write.
- Capture transport/timeouts preserve PENDING ambiguous outcomes; generic
  network failures no longer become definite FAILED captures.
- Webhook reconciliation records provider evidence, validates capture ownership,
  and does not complete a milestone unless an authorized human CAPTURE approval
  already exists.
- Real sandbox PayPal actions are refused in JSON mode.
- PostgreSQL integration still was not executed because
  `FAIRHOLD_TEST_DATABASE_URL` is unset.

## Full evidence pass - 2026-11-04

Everything below was executed in this workspace. Nothing in this section is a
projection; each claim names the command or test that produced it.

### Environment

- Isolated PostgreSQL 16 test container `fairhold-pg-test`
  (`postgres:16-alpine`, `127.0.0.1:55432`, database `fairhold_test`,
  role `fairhold`). This is a dedicated test container, not the developer's
  Supabase stack (that stack was left untouched).
- Browser tests run against a dedicated Playwright-managed dev server on
  `http://localhost:3100` (JSON demo store, demo payment provider).
- The application itself still runs with the demo provider because
  `DATABASE_URL` is not set for the app process. Real PayPal sandbox actions
  remain unavailable in that configuration by design.

### Commands and results

| Command | Result |
| --- | --- |
| `npm run typecheck` | pass (`next typegen && tsc --noEmit`) |
| `npm run lint` | pass (eslint, no output) |
| `$env:FAIRHOLD_TEST_DATABASE_URL=...; npm test` | 172 tests, 172 pass, 0 fail, 0 skipped (12.9s) |
| `npx playwright test` | 9 passed (1.6m): 3 journeys x desktop/mobile/tablet |
| `npm run build` | pass; routes `/`, `/dashboard`, `/deals/new`, `/deals/[id]` are Partial Prerender (`◐`), `/login` and both API routes are dynamic (`ƒ`) |

The previous 21 skipped PostgreSQL tests now execute and pass. Skip count is 0
when `FAIRHOLD_TEST_DATABASE_URL` is set; without it the PostgreSQL suites
still skip rather than fail silently.

### PostgreSQL verification

- Integration suites for deals and webhooks run against the real PostgreSQL
  server, not an in-memory double.
- Each integration test file gets its own schema, so files cannot collide.
- The migration runner serializes concurrent migration attempts with a
  PostgreSQL advisory lock; repeat runs are idempotent.
- Verified behaviors include: authorization and capture ledger rows written in
  the same transaction, capture amounts recorded on the ledger, simulated-flag
  persistence, held-decision revision (a later acceptance supersedes an earlier
  rejection and vice versa), webhook reconciliation without a correlation
  fallback, duplicate webhook acknowledgement, and serialized capture
  allocation.
- Not verified: behaviour across a full database server restart (data is
  verified through separate connections and processes, not a restart cycle).

### Browser end-to-end matrix

All three journeys pass at desktop (1280px), mobile (Pixel-class) and tablet
emulation.

1. `evidence-lifecycle.spec.ts:78` - buyer authorization, seller evidence
   upload + link, download (headers and bytes), buyer rejection with note,
   persisted rejection, seller resubmission, buyer acceptance, buyer approval
   to a simulated CAPTURE, payment history entry, reload persistence, and
   double-payment disabled (`ALREADY_PROCESSED`).
2. `evidence-lifecycle.spec.ts:196` - access control: anonymous evidence
   download returns 404, an unknown display name is rejected at login
   (`?error=invalid`), and a signed-in non-participant gets the not-found
   surface for a deal they cannot access.
3. `evidence-lifecycle.spec.ts:234` - buyer creates a deal, buyer cannot see
   milestone authoring controls, seller adds a milestone, and the buyer sees
   the persisted milestone and the deal on the dashboard.

The tests assert the rendered not-found UI for an inaccessible deal rather than
HTTP 404. The route is Partial Prerender: the streamed shell is sent with
status 200 before the dynamic segment discovers the missing deal, so the
status code is not a reliable signal. The not-found UI itself is asserted.

### Defects found and fixed in this pass

1. Inaccessible/unknown deals rendered a blank page in the browser instead of
   the not-found UI. The guard ran inside the Suspense boundary after the shell
   had streamed. The guard is now evaluated in the page component before the
   shell is returned; a regression test asserts the not-found heading.
2. Cross-account and wrong-role server actions previously surfaced as HTTP 500
   errors. They now return inline form errors (`forbidden`) or redirect with
   `?actionError=forbidden`.
3. Test infrastructure defect: earlier browser runs reused a stale, wedged dev
   server on port 3000, producing invalid blank-page results. Playwright now
   owns a dedicated server on port 3100.
4. Evidence-download assertion defect: emulated Chromium ignores
   `Content-Disposition` for `suggestedFilename()`. The test now asserts the
   response status, the attachment header and the exact bytes, then separately
   verifies the downloaded file contents.

### Security review (lightweight, evidence-based)

Verified by test:

- Evidence download requires a session, deal participation and an attached
  file; anonymous requests get 404.
- Login rejects names outside the configured allowlists.
- Deal pages reject non-participants.
- Buyer-only approval controls are not rendered for sellers, and seller-only
  evidence-submission controls are not rendered for buyers.

Verified by code inspection:

- Server actions re-check role and deal access server-side; they do not trust
  client-supplied identity or payment state.
- Payment amount/status are never accepted from form input.
- Real PayPal actions are refused in JSON mode, and ambiguous outcomes remain
  PENDING rather than being reported as success.

Known limitations (not defects introduced here, and not fixed in this pass):

- Demo authentication is name+role based, protected only by signed cookies and
  server allowlists. It is not production authentication.
- There is no login rate limiting and no explicit CSRF token beyond Next.js
  server-action protections.
- Role and scope discipline in agent workflows is instruction-level; it is not
  technically enforced.

### PayPal sandbox status - blocked, not faked

- Adapter and webhook unit tests pass with transport doubles; they are not
  evidence of live sandbox execution.
- Live sandbox lifecycle verification is blocked by configuration outside this
  workspace: the app has no `DATABASE_URL` (so it deliberately uses the demo
  provider), no public HTTPS endpoint for webhook delivery, and no
  `PAYPAL_WEBHOOK_ID`. `PAYPAL_ENV=sandbox` plus non-placeholder client
  credentials are present but insufficient on their own.
- No payment success was fabricated, and the UI continues to state that
  simulated actions make no PayPal request.

### AI advisory status - fallback verified, live provider blocked

- The advisory path validates provider output and falls back to the
  deterministic proposal on timeout, non-OK responses, or invalid JSON.
- With no `GEMINI_API_KEY`/`GEMINI_MODEL`, the UI reports the deterministic fallback
  source. The integration now has UI and server-action call sites; live provider
  calls were not executed and are not claimed.
- Advisory output never changes deal or payment state; a human decision is
  still required.

### Tooling limits

- Browsers: Chromium only (desktop, mobile and tablet emulation). Firefox and
  WebKit were not run.
- No axe or Lighthouse run; contrast, semantics and keyboard behaviour were
  reviewed manually and through targeted assertions, not a full audit.
- Mobile and tablet results are emulated viewports, not physical devices.

### Skills availability

- Accessible in this environment: the OpenCode skill set injected into the
  session (accessibility, creative-frontend, ui-designer, ui-styling,
  design-system, testing-qa, webapp-testing, browser-automation,
  fullstack-nextjs-supabase, advanced-sql, sql-query-helper, auth-security,
  api-engineering, observability, devops-cicd, llm-app-engineering,
  rag-engineering, ai-evaluation, systematic-debugging,
  test-driven-development, verification-before-completion,
  git-workflow-hygiene, and others).
- `opencode debug skill` is not available in this CLI version.
- The GitHub Copilot skill registry is not reachable from this environment, so
  no Copilot skill claims are made.

---

## Release pass - 2026-11-06

Scope of this pass: finish the premium UI pass, complete the documentation set,
run the full regression matrix, record evidence, create a reviewable commit
history, and prepare the deployment. No product rules changed: AI still only
advises, deterministic rules decide, humans approve, PayPal executes, and the
audit trail records what happened. Authorization remains a provider hold, never
escrow.

### Repository state

- Branch: `feat/deal-milestone-foundation`
- Release commits: 17 (`4094832` ... `e18a449`) on top of `f5e48bc`
- Working tree: clean at the time of the test runs below
- No secrets, `.env` files, `.data/` artifacts, test databases or build caches
  were committed. A high-confidence secret-pattern scan of every staged file
  returned no matches.

### Commands and exact results

| Command | Result |
| --- | --- |
| `npm run typecheck` (`next typegen && tsc --noEmit`) | Pass, no output |
| `npm run lint` (`eslint`) | Pass, no findings |
| `npm test` with `FAIRHOLD_TEST_DATABASE_URL` | 172 tests, 172 pass, 0 fail, 0 cancelled, 0 skipped, 0 todo, 19.2s |
| `npm run build` | Pass - Next.js 16.4.3 Turbopack, compiled in 7.9s, TypeScript 11.6s, 9/9 static pages |
| `npx playwright test` | 9 passed (2.1m) - 3 journeys x desktop, mobile, tablet |

The PostgreSQL run used an isolated PostgreSQL 16 container
(`fairhold-pg-test`, `127.0.0.1:55432`, database `fairhold_test`, role
`fairhold`). The developer's Supabase containers were not touched. Without
`FAIRHOLD_TEST_DATABASE_URL` the same suite reports 148 pass and 24 skipped, by
design; the PostgreSQL suites are skipped rather than silently mocked.

Build route output:

```
◐ /                                      ◐ /dashboard
◐ /_not-found                            ◐ /deals/[id]
ƒ /api/evidence/[dealId]/[evidenceId]    ◐ /deals/new
ƒ /api/paypal/webhook                    ƒ /login
```

### Playwright matrix and failure analysis

All 9 journeys (buyer/seller lifecycle, access control, deal creation and
milestone authoring) pass on desktop, mobile (Pixel 5) and tablet (iPad)
emulation.

Earlier runs in this pass failed, and the failures were diagnosed rather than
suppressed. No assertion, timeout-sensitive test body or product behaviour was
changed:

- A production-server run returned 6 passed / 3 failed, all three in
  `[tablet-chromium]`, in 4.3m. One failure reported the deal page as
  "Deal not found" with the header showing "Demo sign in"; the other two were
  90s locator timeouts after a stalled `/login` navigation.
- A fresh dev-server run returned 8 passed / 1 failed in 14.1m, failing in
  `signIn` because `/login` did not redirect within the 10s expectation.
- Re-running the failing tablet journey alone against the now-warm server
  passed in 23.1s, and the final full run against a warm production build
  passed 9/9 in 2.1m.

Conclusion: the failures are compile/serve latency on a OneDrive-synced
checkout, not application defects. The `playwright.config.ts` budget (90s test,
10s expectation) is documented in a comment as an environment budget; it does
not relax any assertion.

### Defects investigated in this pass

Two findings from the automated visual audit were investigated to root cause
and are **not** application defects:

1. **Hydration attribute mismatch** reported on every audited page. The dev
   server's stream log showed the diff was
   `style={{caret-color:"transparent"}}` on the `#title`, `#clientName`,
   `#freelancerName` and `#agreement` inputs. That style is injected by the
   audit harness while taking screenshots. Fresh contexts with no screenshot
   injection produce no console output at all.
2. **Two `h1` elements on `/dashboard`.** The second heading belongs to the
   retained LoginPage subtree that Next.js keeps in the DOM after navigation;
   it is not rendered (no layout box) and is absent from the accessibility
   tree. Counting only rendered elements, every page has exactly one `h1`.

The audit script was hardened to ignore non-rendered elements and hidden
server-action inputs, then moved outside the repository so it is never
committed.

### Visual and interaction audit (automated, 14 probes)

Viewports: desktop 1440, mobile 390 (iPhone 13), tablet 820, plus a
reduced-motion context. Real browser navigation, no mocked data.

- Horizontal overflow: none (`scrollWidth == clientWidth` on every probe).
- Console errors: 0 on every probe.
- Rendered `h1` count: 1 per page.
- Images without `alt`: 0.
- Unlabelled visible form controls: 0.
- Keyboard: first Tab reaches the skip link; second Tab reaches the brand link
  with a visible `outline: solid 2px` focus ring.
- Reduced motion: `.reveal` resolves to `animation-name: fairhold-rise` with
  `animation-duration: 1e-05s` and `opacity: 1`, so content is visible
  immediately and no motion plays.
- States exercised: landing, login, dashboard (populated), deal detail, deal
  creation and deal not-found.
- Screenshots and `report.json`: `C:\Users\theni\AppData\Local\Temp\opencode\fairhold-shots-final\`.

### Tooling limits for this pass

- Chromium only; Firefox and WebKit were not run.
- No axe or Lighthouse run. Contrast, semantics and keyboard behaviour were
  checked by targeted assertions and manual review, not a full audit.
- Mobile and tablet are emulated viewports, not physical devices.
- Browser screenshots were captured for human review; the release agent cannot
  view images, so appearance claims rest on the programmatic checks above plus
  those artifacts.
- Independent subagent review and QA delegation were unavailable in this
  environment (provider usage limit); verification was executed directly and
  the commands and outputs are recorded here.

### Still blocked, not faked

- Live PayPal sandbox: no `DATABASE_URL`, no public HTTPS webhook endpoint and
  no `PAYPAL_WEBHOOK_ID`, so the adapter refuses real actions and the app uses
  the demo provider. No sandbox payment was executed or claimed.
- Live AI provider: no `GEMINI_API_KEY`/`GEMINI_MODEL`. Only the deterministic fallback
  is verified; the UI reports the fallback source.
- Hosted PostgreSQL and durable evidence object storage are not configured, so
  a serverless deployment can read the seeded demo data but cannot persist
  writes.

### Deployment verification - 2026-11-07

The Vercel project `fairhold` now has a passing preview build. No production
deployment is claimed.

| Check | Result |
| --- | --- |
| Vercel build | Pass - Next.js preset, compiled 6.8s, TypeScript 5.8s, 9/9 static pages, output deployed in 27s |
| Preview URL | `https://fairhold-dnt7r6md1-thenidhibhat-6721s-projects.vercel.app` (target: preview, status Ready) |
| `/` | 200, 94,660 bytes, landing content present |
| `/login` | 200, 34,895 bytes, buyer/seller/reviewer demo roles present |
| `/dashboard` (no session) | 200, 28,073 bytes, sign-in gate rendered |
| `/deals/[id]` (no session) | 200, not-found view - fails closed, no deal data leaked |
| Public unauthenticated request | 302 to Vercel SSO (deployment protection enabled) |

Two deployment defects were found and fixed rather than reported as success:

1. The project was created with the "Other" framework preset and an output
   directory of `public`, so the first deployment published the hero SVG folder
   as a static site and returned 404 for every application route. Fixed with
   `vercel project update fairhold --framework nextjs --auto-detect
   output-directory --auto-detect build-command`, then rebuilt.
2. Vercel assigns a project's first deployment to production. That first
   deployment is the broken static one and still owns the
   `fairhold-beta.vercel.app` alias. It is recorded as a blocker, not promoted.

Environment variable names present in the preview scope (values never printed):
`FAIRHOLD_SESSION_SECRET`, `FAIRHOLD_DEMO_BUYERS`, `FAIRHOLD_DEMO_SELLERS`,
`FAIRHOLD_DEMO_REVIEWERS`, `FAIRHOLD_REVIEWER_DEALS`. The production scope is
empty. `DATABASE_URL`, `PAYPAL_*` and `AI_*` are absent from every scope, so the
deployed instance browses the demo shell, does not persist writes, refuses real
payment actions and uses the deterministic AI fallback.

Not verified on the deployed URL, and therefore not claimed: interactive
sign-in and write journeys in a browser (Vercel Authentication gates the preview
and the CLI does not drive form posts), hosted PostgreSQL behaviour, PayPal
sandbox execution, and live AI calls. Those journeys are verified locally
against a production build by Playwright (9/9).

### Release verification - 2026-11-08

Full gate re-run on the final tree after the demo, money, dashboard, fee and video
work. Nothing was skipped, mocked or weakened.

| Check | Command | Result |
| --- | --- | --- |
| Types | `npm run typecheck` | exit 0 |
| Lint | `npm run lint` | exit 0 |
| Unit + integration | `npm test` with `FAIRHOLD_TEST_DATABASE_URL` → isolated PostgreSQL 16 | 193 tests, 193 pass, 0 fail, 0 skipped (13.9 s) |
| Build | `npm run build` | exit 0, 10 routes including `/demo` |
| Browser | `npx playwright test` | 27 passed (9 journeys × desktop/mobile/tablet Chromium) |
| Video composition | `npx hyperframes@0.8.171 check` | 0 errors, layout 0 issues across 9 samples, 53/53 contrast AA |
| Video output | `ffprobe`, `ffmpeg blackdetect` | 1920×1080/30 fps/3000 frames/100.0 s; no black segment ≥ 0.4 s |

New functional evidence in this pass:

- `/demo` runs the lifecycle in the browser and the money summary follows it; the
  test fails if any request URL mentions PayPal.
- Dashboard search narrows the list, reports "N of M shown", shows a filtered
  empty state and restores it with Clear.
- The deal page renders "Costs and limits" and states that no platform fee exists
  in this build.
- Typed amounts parse to exact integer cents; no float rounding path reaches the
  ledger.

Still blocked, unchanged: live PayPal sandbox (no credentials, no public HTTPS
webhook, no `PAYPAL_WEBHOOK_ID`), live AI provider (no key), hosted PostgreSQL and
durable evidence storage (none configured), and anonymous access to the Vercel
preview (Deployment Protection returns 302 to SSO).

### Flake found by the release gate, and what it taught us (2026-11-08)

The first full run of the release gate returned 23 passed / 1 failed:
`[tablet-chromium] evidence-lifecycle.spec.ts:78` clicked "Sign out" and the URL
stayed on `/dashboard` for the whole 10 s assertion window. Investigation:

1. The server does not render an inert form: `/login` and the dashboard emit
   `method="POST"` with a `$ACTION_ID` field, and with client JavaScript disabled
   the sign-in form posts and authenticates (now covered by
   `tests/progressive-enhancement.spec.ts`). What changes is hydration — React
   replaces the action with a `javascript:` guard and takes over submission. A
   click landing inside that takeover window is swallowed. A repeated tablet-only
   run then failed at a different step ("Approve recommendation" never became
   stable), consistent with the same window.
2. A control experiment against `npm start` (production server) failed 3/3 at the
   deal page because this suite's fixture expects the dev server's seeded JSON
   store. That run was invalid and is not treated as a product signal; the server
   was stopped and port 3100 verified free.
3. No `animation: infinite` exists in app CSS, so perpetual CSS motion is not the
   cause of the stability timeout.

Rather than loosen the assertion, the suite waits until React has taken the form
over (`not.toHaveAttribute("action", /^javascript:/)`) before clicking sign-out
and before the capture approval, then asserts the same URL/state as before. Final
run on the hardened suite: see the gate table above; local reruns were 24/24, and
the 2026-11-09 closeout added the no-JavaScript sign-in journey.

The remaining limitation is different from the first diagnosis: the dashboard
body is streamed through `<Suspense>`, so a JavaScript-disabled client sees the
shell and the skeleton. Recorded in `FINAL_RELEASE_REPORT.md` §13 and as the
"JavaScript-disabled dashboard" row in `FINAL_REMAINING_WORK.md`.

### Final delivery verification — 2026-11-12

Every gate was re-run after the final fixes, on this day:

- `npm run typecheck` — exit 0 (`next typegen` + `tsc --noEmit`).
- `npm run lint` — exit 0.
- `npm test` with `FAIRHOLD_TEST_DATABASE_URL` (isolated PostgreSQL 16 at
  `127.0.0.1:55432/fairhold_test`): **294 tests, 294 passing, 0 failing,
  0 skipped, exit 0** (293 prior tests + one new session-secret regression
  test). Without a test database: 294 tests, 266 passing, 28 skipped, exit 0.
- `npm run test:e2e` full matrix against a production build:
  desktop-chromium 26/26, mobile-chromium 26/26, tablet-chromium 26/26,
  desktop-firefox 26/26, desktop-webkit 26/26 — **130/130 passing**, all
  steps exit 0.

**WebKit session loss was a product defect, fixed at the root.** Before the
fix, WebKit failed four tests (`deal-creation-repro.spec.ts:12` and
`evidence-lifecycle.spec.ts:118/243/281`). A retained Playwright trace showed
`POST /login → 200` setting `fairhold_session` with `Secure` over
`http://localhost:3104`, and no later request carrying any cookie: WebKit
silently rejects `Secure` cookies on non-secure origins (Chromium and Firefox
treat localhost as trustworthy), so the session was dropped and every
authorized page redirected to `/login`. `setDemoSession` chose the attribute
from `NODE_ENV === "production"` — wrong for a production build served over
plain HTTP. The flag now derives from the request's `X-Forwarded-Proto` in
`lib/auth/secure-cookie.ts` (unit-tested: no header or `http` → not Secure;
`https`, case-insensitive and first-segment-wins → Secure), so TLS
deployments such as Vercel keep `Secure` while plain-HTTP serving works in
strict browsers. No assertion was weakened; after the fix the full matrix
above passes.

**Vercel state recorded at delivery time.** Production deployment
`dpl_6CkYub9fX7Ezf4NLPJmTbNPro2d5` (Ready, created 2026-11-12 02:19 IST by
the Git integration) reports `githubCommitSha = cc60145…`, identical to
`origin/main`. Direct deployment and preview URLs return 302 to Vercel SSO
(Deployment Protection; never bypassed). The `fairhold-beta.vercel.app`
alias serves `/`, `/login`, `/demo` and `/dashboard` with HTTP 200 and the
correct page title. The production environment scope contains `DATABASE_URL`,
`GEMINI_API_KEY` and `GEMINI_MODEL` but lacks `FAIRHOLD_SESSION_SECRET`,
`PAYPAL_*` and the demo allowlists, so login and payment actions fail closed
until an owner adds them.

Still blocked, unchanged in substance: live PayPal sandbox (no credentials
usable from this environment, no public HTTPS webhook, no verified
`PAYPAL_WEBHOOK_ID` flow), live AI provider calls (key not available here),
hosted-PostgreSQL connectivity verification, durable object-storage evidence,
and authenticated access to the Vercel preview (Deployment Protection
returns 302 to SSO).
