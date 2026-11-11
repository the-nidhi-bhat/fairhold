# FairHold sprint handoff

Last updated: 2026-11-06

## Current state

- Branch: `feat/deal-milestone-foundation`
- Remote: `origin https://github.com/the-nidhi-bhat/fairhold.git`
- Working tree: clean.
- All release work is committed and pushed; see "Release pass — 2026-11-06"
  at the end of this file for hashes and command output.
- No uncommitted files remain, including the PayPal worktree files listed in
  earlier checkpoints below (committed in `574efde`).

Canonical state files for this project: `TASKS.md`, `DECISIONS.md`,
`QA_REPORT.md`, and `FAIRHOLD_STATE.md`. `README.md` is the entry point;
`DEPLOYMENT.md` records the hosting requirements and which of them the Vercel
preview satisfies.

## Open items

- Live PayPal sandbox verification: blocked, no sandbox credentials or public
  webhook endpoint in this environment.
- Live AI provider verification: blocked, no `GEMINI_API_KEY`/`GEMINI_MODEL`.
- Hosted PostgreSQL + durable evidence storage in production: not configured.
  The Vercel preview therefore serves reads from an empty JSON store and
  refuses writes instead of pretending to persist them.

## Authentication checkpoint

- Authentication commit: `8c7498665053ef24ffe16b57be7d77e5fdcc6921`
- Added signed, HTTP-only demo sessions and buyer/seller/reviewer roles.
- Dashboard and deal routes filter or deny deals server-side.
- Mutating deal actions require authentication and server-side role checks.
- Audit actors now identify the signed demo identity instead of `"system"`.
- Typecheck: passed.
- ESLint: passed.
- Production build: passed.
- Test suite: 148 total, 127 passed, 21 skipped, 0 failed.
- PostgreSQL integrations remain skipped because `FAIRHOLD_TEST_DATABASE_URL`
  is absent.
- Protected PayPal worktree files remain untouched by authentication commits.

## Independent review of commit 68d9e92

### Findings

1. The dashboard summary uses every key returned by `paymentStatusFor()`:
   `not_authorized`, `authorization_pending`, `authorization_simulated`,
   `authorization_sandbox`, and `no_payment`.
2. Corrected finding: commit `68d9e92` combined
   `authorization_simulated` and `no_payment` under “Other states”, which made a
   cancelled deal look like a simulated authorization and did not distinguish
   the categories.
3. The labels now distinguish all five states:
   - Not authorized
   - Buyer approval pending
   - PayPal sandbox authorized
   - Simulated authorized
   - No payment
4. Counts are derived directly from `paymentStatusFor(deal).key`, so each deal
   contributes exactly once to one category.
5. No `.data/fairhold.json` is present, so the JSON development store has zero
   deals; therefore every dashboard payment count is currently zero in the
   default development store unless another backend or persisted store supplies
   deals.

### Correction commit

- `3e555fd` separates `authorization_simulated` and `no_payment`.
- `1c9fbe0` routes dashboard aggregation through the exhaustive
  `PaymentStatusKey` summary and adds a test proving the category total equals
  the number of deals.

## Verification

- `npm run typecheck`: pass
- `npm run lint`: pass
- Complete test runner summary before final invariant coverage: 141 tests
  total, 121 passed, 20 skipped, 0 failed, 0 cancelled,
  0 todo.
- The 20 skipped tests require `FAIRHOLD_TEST_DATABASE_URL`.

## Final dashboard verification

- Dashboard correction commit: `1c9fbe0`
- `npm run typecheck`: pass
- `npm run lint`: pass
- Complete test runner summary: 142 tests, 122 passed, 0 failed, 20 skipped,
  0 cancelled, 0 todo.
- The 20 skipped PostgreSQL integration tests require
  `FAIRHOLD_TEST_DATABASE_URL`.
- The five `PaymentStatusKey` categories are represented once in
  `PaymentSummary`; `summarizePaymentStatuses()` throws if category totals do
  not equal the input deal count.
- Unit coverage verifies one representative deal in each category and a total
  of exactly five deals.

## Protected work

Do not stage, modify, revert, or commit the three pre-existing uncommitted PayPal
files unless the next owner explicitly takes responsibility for those changes.
The dashboard correction was committed separately and does not include them.

## PostgreSQL persistence verification

- Commit: `48ef93a`
- Corrected malformed milestone and evidence SQL placeholders.
- Replaced the nonexistent `deals.authorization_id` reference with an existence
  lookup on `payment_authorizations`.
- Preserved the deal currency when creating an authorization instead of hardcoding
  USD.
- Added `FOR UPDATE` locks to milestone and evidence mutation queries.
- Added integration coverage for milestone updates and evidence metadata.
- Added schema-contract regressions for placeholders, authorization columns,
  evidence columns, and row locking.
- `npm run typecheck`: pass
- `npm run lint`: pass
- Focused schema-contract suite: 10 passed, 0 failed, 0 skipped.
- Complete suite: 146 tests, 125 passed, 0 failed, 21 skipped, 0 cancelled.
- PostgreSQL integration tests did not execute because
  `FAIRHOLD_TEST_DATABASE_URL` was not set.
- Run them on Windows with an isolated PostgreSQL database:
  `$env:FAIRHOLD_TEST_DATABASE_URL="postgresql://user:password@localhost:5432/fairhold_test"`
- Then run:
  `npm test`
- PostgreSQL integration coverage is not reported as passing until an actual
  isolated test database runs those tests.

## Remaining database issues

- Live PostgreSQL integration execution still requires an isolated test database.
- The integration suite should be rerun after any PostgreSQL environment change.
- JSON and PostgreSQL consistency remains supported by domain-level unit coverage,
  but live PostgreSQL roundtrips still require the isolated database.

## Next task

Recommended next task: payment-safe buyer/seller flow hardening or final QA:

1. Run and repair the PostgreSQL integration suite against an isolated database.
2. Verify authorization and capture locking under real concurrency.
3. Then move to buyer/seller access control and MVP flow QA.

## MVP continuation checkpoint

- HEAD after verified continuation units: `a8c2c02`.
- Verified commits:
  - `248b9c4` hardened the protected PayPal sandbox adapter and its regressions.
  - `b712448` added advisory UI, payment-history UI, landing copy, demo notes,
    and responsive create-deal loading state.
  - `a8c2c02` surfaced milestone and evidence advisory in deal detail without
    granting AI payment authority.
- Authentication, deterministic rules, buyer/seller/reviewer server actions,
  PostgreSQL persistence corrections, PayPal adapter operations, webhook
  handling, AI parsing/fallback, and responsive core screens are implemented.
- Verification at this checkpoint:
  - `npm run typecheck`: passed.
  - `npm run lint`: passed.
  - `npm run build`: passed.
  - Tests: 152 total; 131 passed; 21 skipped; 0 failed.
- PostgreSQL integration execution remains blocked by the unset
  `FAIRHOLD_TEST_DATABASE_URL`.
- Live PayPal sandbox execution remains blocked by unavailable sandbox
  credentials and is not represented as passing.
- Browser automation was not available as an executed final verification
  environment.

## Remaining limitations and next recommended task

1. Execute PostgreSQL integrations with an isolated database using:
   `$env:FAIRHOLD_TEST_DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/fairhold_test"`
   then `npm test`.
2. Exercise live PayPal sandbox operations with sandbox credentials.
3. Run desktop/mobile browser smoke tests against the authenticated flows.
4. Perform final origin fetch, diff review, secret scan, and normal branch push.

## Payment Integrity Remediation 2 checkpoint

- Code commit: `7a96547`
- Implemented provider-confirmed capture ledger persistence in the operation
  transaction, ambiguous network outcomes as PENDING, approval-gated webhook
  milestone completion, capture ownership quarantine, migration relationship
  preflight, and JSON-mode real-payment guards.
- Verification after the implementation:
  - `npm run typecheck`: passed.
  - `npm run lint`: passed.
  - `npm test`: 161 tests total, 140 passed, 21 skipped, 0 failed.
  - `npm run build`: passed.
- PostgreSQL integration: not run; `FAIRHOLD_TEST_DATABASE_URL` is unset.
- Live PayPal sandbox: not run.
- Remaining risks include cross-system PostgreSQL/PayPal crash uncertainty and
  unexecuted migration/concurrency/webhook integration tests. A confirmed
  PayPal result is conserved through the operation plus capture ledger design,
  while response-loss uncertainty must be reconciled from PayPal.

## Post-audit hardening checkpoint

- Authentication commit: `a75a9f1`
  - Buyer and seller demo names are allowlisted from server environment.
  - Reviewers require both a server allowlist entry and deal-specific grant in
    `FAIRHOLD_REVIEWER_DEALS`.
  - Signed sessions are rechecked against the server allowlist.
- Payment commit: `1e921a5`
  - Capture and void operations are durable before provider invocation.
  - Stable operation and provider request identities are reused for retries.
  - Capture amounts are limited to authorization remaining balance.
  - Webhook completion reconciles operations, ledger rows and milestone
    completion; duplicate provider captures remain protected by unique provider
    references.
  - Ambiguous/PENDING outcomes are persisted and are not treated as captures.
- Verification:
  - `npm run typecheck`: passed.
  - `npm run lint`: passed.
  - `npm run build`: passed.
  - Full unit suite: 157 tests, 136 passed, 21 skipped, 0 failed.
  - PostgreSQL integrations skipped: `FAIRHOLD_TEST_DATABASE_URL` was unset.
  - Live PayPal sandbox operations remain unverified.
- The protected PayPal worktree was preserved and was not committed.

## Critical integrity remediation

- Authentication commit: `1ee9538`.
  - Buyer and seller allowlists have no implicit identities.
  - Missing allowlists and malformed reviewer grants fail closed.
- Payment commit: `6a1838c`.
  - Migration `0004` now upgrades UUID identifiers and adds the milestone relationship.
  - Capture operations reserve capacity under PostgreSQL deal locks and JSON write locks.
  - Provider capture webhooks reconcile by operation invoice/idempotency correlation,
    and terminal completion cannot be regressed.
- Verification:
  - `npm run typecheck`: passed.
  - `npm run lint`: passed.
  - `npm test`: 160 total, 139 passed, 21 skipped, 0 failed.
  - `npm run build`: passed.
  - PostgreSQL integrations remain unverified because
    `FAIRHOLD_TEST_DATABASE_URL` is unset.
  - Live PayPal sandbox and browser verification remain unverified.

  ## Local walkthrough authorization fix — 2026-11-02

  - Commit: `037257c` — `fix(deals): return authorization errors inline`
  - Fixed forbidden deal and milestone status mutations so the server action
    redirects back to the deal with an accessible inline role-denied message
    instead of rendering an HTTP 500 error page.
  - Added role-gated deal-status, milestone-status, edit, and add-milestone UI
    controls so buyers no longer see seller-only mutation controls.
  - Server-side role enforcement remains intact. The UI gate is not an
    authorization replacement.
  - Verification:
    - `npm run typecheck`: passed.
    - `npm run lint`: passed.
    - `npm test`: 161 total, 140 passed, 21 skipped, 0 failed.
    - `npm run build`: passed.
    - `git diff --check`: passed for the committed implementation.
    - PostgreSQL integrations remain unexecuted because
      `FAIRHOLD_TEST_DATABASE_URL` is unset.
    - Live PayPal operations remain unverified and were not attempted.
  - Browser verification of the inline query-state banner and role-gated controls
    was limited by the demo session state becoming unavailable during the local
    server/rebuild cycle. Re-authenticate before completing broader walkthrough QA.
  - Existing unstaged launch fix in `lib/auth/session.ts` was preserved and not
    included in commit `037257c`.

  ## Phase 2A-2C UI foundation — 2026-11-02

  - Added a single graphite, warm-neutral and deep-crimson visual system in
    `app/globals.css`, with dark-mode and reduced-motion support.
  - Updated the shared shell, landing page, demo sign-in, create-deal flow,
    dashboard, and deal detail surfaces to use the shared system.
  - The landing page now leads with a transaction-flow preview instead of a
    generic marketing hero, and explains AI versus deterministic authority.
  - The dashboard preserves the five real payment-summary categories while
    presenting clearer responsive deal cards and empty/loading states.
  - Browser smoke-checks confirmed the landing, dashboard, create-deal form, and
    deal-detail route render on the local JSON demo workspace. Authentication
    state is stored in signed browser cookies and may require re-sign-in after
    server restarts or rebuilds.
  - No payment-domain logic or payment provider behavior was changed.
  - Existing uncommitted `lib/auth/session.ts` work remains preserved and was not
    staged.
  - Verification after this UI unit:
    - `npm run typecheck`: passed.
    - `npm run lint`: passed.
    - `npm test`: 161 total, 140 passed, 21 skipped, 0 failed.
    - `npm run build`: passed.
    - Local routes loaded successfully during browser smoke checks.
  - Remaining UI work: complete deal-detail section styling and buyer/seller
    walkthrough verification at desktop, tablet, and mobile widths. PostgreSQL
    integration and live PayPal sandbox remain unavailable in this workspace.

  ## Phase 2B workflow excellence — 2026-11-02

  - Commit: `4dd980a` — `feat(workflows): improve buyer and seller queues`
  - Added persisted-state buyer pending-review and seller active/rejected-evidence
    dashboard queues.
  - Added server-role-aware evidence controls: sellers can submit evidence,
    buyers and reviewers can review it, and approval controls stay separate from
    seller controls.
  - Added workflow unit coverage for buyer pending evidence and seller active
    and rejected evidence.
  - Verification:
    - `npm run typecheck`: passed.
    - `npm run lint`: passed.
    - `npm test`: 163 total, 142 passed, 21 skipped, 0 failed.
    - `npm run build`: passed.
    - Focused workflow suite: 2 passed, 0 failed, 0 skipped.
  - Browser walkthrough at `http://localhost:3000`:
    - Buyer landing and dashboard loaded; the payment summary showed one
      `Needs authorization` deal and no fabricated records.
    - Buyer deal detail showed the persisted agreement, milestone, evidence
      history, advisory HOLD state, payment limitation, and activity timeline.
    - Seller sign-in loaded a role-specific dashboard with one active milestone.
    - Seller deal detail exposed evidence submission and milestone controls while
      hiding buyer evidence-review and approval controls.
    - Payments remained unmodified, simulated, and not executed.
  - PostgreSQL integration tests remain unexecuted because
    `FAIRHOLD_TEST_DATABASE_URL` is unset.
  - Live PayPal sandbox operations remain unexecuted.
  - Existing uncommitted `lib/auth/session.ts` modification was preserved and not
    committed in this unit.

  ## Full evidence pass - 2026-11-04

  - Isolated PostgreSQL 16 container `fairhold-pg-test` (port 55432) used for
    integration tests; the developer's Supabase stack was not touched.
  - `npm test` with `FAIRHOLD_TEST_DATABASE_URL`: 172 total, 172 passed,
    0 skipped, 0 failed. The previously skipped PostgreSQL suites now execute.
  - `npx playwright test`: 9 passed (3 journeys x desktop, mobile, tablet)
    against a Playwright-managed dev server on port 3100.
    - Lifecycle: authorization, upload/download, rejection, resubmission,
      acceptance, simulated capture, history, persistence, double-pay blocked.
    - Access control: anonymous download 404, unknown login rejected,
      non-participant deal shows not-found, role-gated controls.
    - Deal creation and seller milestone authoring with buyer visibility.
  - `npm run typecheck`, `npm run lint`, `npm run build`: passed.
  - Defect fixed: inaccessible/unknown deals rendered a blank page because the
    guard ran inside the Suspense boundary after the Partial Prerender shell had
    streamed. The guard now runs before the shell; a regression test asserts the
    not-found UI. HTTP status stays 200 for this streamed route by design.
  - Defect fixed: cross-account/wrong-role server actions no longer return
    HTTP 500; they return inline errors or `?actionError=forbidden`.
  - Test infrastructure fixed: a stale wedged dev server on port 3000 had been
    producing invalid blank-page results. Playwright now owns port 3100.
  - Still blocked, not faked: live PayPal sandbox (needs `DATABASE_URL`, public
    HTTPS webhook endpoint, `PAYPAL_WEBHOOK_ID`; app currently runs the demo
    provider) and live AI provider calls (needs `GEMINI_API_KEY`/`GEMINI_MODEL`).
  - Browser coverage is Chromium-only; no axe/Lighthouse run. Mobile and tablet
    are emulated viewports.
  - See `QA_REPORT.md` for the full evidence matrix and `TASKS.md` for the
    remaining/blocked list.

## Release pass — 2026-11-06 (deployment verified 2026-11-07)

### Committed and pushed

17 commits on `feat/deal-milestone-foundation`, on top of `f5e48bc`:

| Commit | Message |
| --- | --- |
| `4094832` | feat(design): introduce the obsidian design tokens and motion system |
| `10a5b42` | feat(ui): rebuild the app shell around a persistent, accessible header |
| `22a0f9f` | feat(landing): rebuild the landing page as a product proof, not a pitch |
| `6e3226f` | feat(ui): restyle the demo sign-in page and keep the role gate explicit |
| `5f02056` | feat(ui): restyle the dashboard and its loading, empty and failure states |
| `d05b6c5` | feat(ui): restyle the deal workspace and its state surfaces |
| `dfa7e5d` | feat(ui): restyle deal creation with a clearer agreement brief |
| `4075bad` | feat(ui): derive status tone and progress from design tokens |
| `dcdb8f1` | feat(brand): add the original FairHold hero artwork |
| `84fad04` | chore(repo): ignore the Vercel link directory and pulled env files |
| `3a6b7a1` | test(e2e): budget for dev-mode compile latency without touching assertions |
| `6983851` | docs: document the architecture, schema, HTTP surface and payment lifecycle |
| `5abda64` | docs: document the AI advisory boundary and the security model |
| `8a4aa02` | docs: add setup, testing and deployment guides |
| `dbea9cc` | docs: add the user, demo and release guides |
| `3c0a18b` | docs: add the implementation changelog |
| `e18a449` | docs(readme): rewrite the README around what the product actually does |

`git push origin feat/deal-milestone-foundation` reported
`f5e48bc..e18a449`. After `git fetch`, local HEAD and
`origin/feat/deal-milestone-foundation` both resolved to
`e18a449b9056740251ccc23055da7852e3f7dd5c`, and
`git rev-list --left-right --count` showed `0 17` (no divergence).

### Verification

- `npm run typecheck`: pass.
- `npm run lint`: pass.
- `npm test` with an isolated PostgreSQL 16 container: 172 tests, 172 pass,
  0 skipped, 0 failed (19.2s).
- `npm run build`: pass, compiled in 7.9s, TypeScript 11.6s, 9/9 static pages.
- `npx playwright test`: 9 passed in 2.1m (3 journeys x desktop, mobile,
  tablet). Earlier intermittent failures were traced to OneDrive dev-compile
  latency; the failing journey passed alone in 23.1s on a warm server.
- Automated visual audit: 14 probes, no console errors, no horizontal overflow,
  one rendered `h1` per page, no missing `alt`, visible focus ring, reduced
  motion honoured. See `QA_REPORT.md` for the full matrix.

### Deployment

- Vercel project `fairhold` (`prj_vdIpZADs1M7qk17mPs96ubFhcZJp`) in team
  `thenidhibhat-6721s-projects`. It is not Git-connected, so pushes do not
  trigger deployments.
- The first deployment was auto-assigned to *production* by Vercel (normal for a
  project's first deployment) and returned 404 for every route: the project
  preset was "Other" with output directory `public`, so Vercel published the
  hero SVG folder as a static site and never built Next.js. Fixed with
  `vercel project update fairhold --framework nextjs --auto-detect
  output-directory --auto-detect build-command`.
- Verified preview:
  `https://fairhold-dnt7r6md1-thenidhibhat-6721s-projects.vercel.app`
  (deployment `dpl_BB94J917mbz2if6GLDLgFAckUVg2`, target preview, status Ready).
  Build log: `Compiled successfully in 6.8s`, TypeScript 5.8s, 9/9 static
  pages, `Build Completed in /vercel/output [27s]`.
- Runtime checks on the deployed URL: `/` 94,660 bytes, `/login` 34,895 bytes
  with the three demo role options, `/dashboard` 28,073 bytes showing the
  sign-in gate, and the demo deal route returns the not-found view when
  unauthenticated — it fails closed rather than leaking deal data.
- Environment: the preview scope holds `FAIRHOLD_SESSION_SECRET`,
  `FAIRHOLD_DEMO_BUYERS`, `FAIRHOLD_DEMO_SELLERS`, `FAIRHOLD_DEMO_REVIEWERS`
  and `FAIRHOLD_REVIEWER_DEALS`. Values were written through stdin and never
  printed. The production scope is empty.
- Deployment protection: Vercel Authentication is enabled for all deployments
  except custom domains, so a plain request to the preview URL returns 302 to
  the Vercel SSO flow. Verification used the CLI's protection-aware fetch. A
  public demo link requires the project owner to change Deployment Protection
  (or share a bypass link); that setting was deliberately not weakened here.

### Blocked

- Production deployment is withheld. Production scope has no environment
  variables, there is no hosted PostgreSQL, no durable evidence storage, no
  public PayPal webhook endpoint and no AI credentials. Promoting the preview
  unchanged would produce a demo that cannot persist writes while presenting
  itself as production.
- The first production alias `fairhold-beta.vercel.app` still points at the
  static non-Next build from the initial deploy. It must be replaced by a
  configured deployment, or removed, rather than promoted blind.
- Live PayPal sandbox and live AI provider remain unverified for the same
  reasons recorded in `QA_REPORT.md`. Nothing was faked.

### Next steps

1. Provision managed PostgreSQL and object storage for evidence files, set
   `DATABASE_URL` and the storage configuration, then run `vercel deploy --prod`
   and repeat the runtime checks.
2. Decide whether the hackathon demo should be publicly reachable; if so,
   adjust Deployment Protection in the Vercel dashboard (owner action).
3. Optionally connect the GitHub repository for automatic deployments.

## Session 2026-11-10 - E2E reliability closeout (verified)

The browser suite is now deterministic on this machine. Nothing was skipped,
retried or softened to get there.

### Defects found and fixed

| Defect | Root cause | Fix |
| --- | --- | --- |
| `evidence-lifecycle.spec.ts` could not find "Simulate authorization hold" | `next dev` auto-loads `.env.local`, so a real `DATABASE_URL` made `resolveDataBackend()` return `postgres`; `isPostgresConfigured()` then made `paymentRuntime()` select `PayPalSandboxProvider`, and the button rendered as "Create PayPal sandbox authorization". | Test servers get `DATABASE_URL: ""` (no database configured -> JSON by the normal rule) plus `FAIRHOLD_DATA_BACKEND=json`, a non-production-only pin in `lib/data/db.ts` used when the specs run against `next dev`. Production behaviour is unchanged and there is still no silent JSON fallback. |
| Deal heading matched the wrong element | Ambiguous locator: several `h3` elements on the dashboard. | Locator scoped to the deals-list item (`.mt-4.space-y-3 > li > .panel > .flex > .min-w-0 > h3`), and reuse for the search step so it asserts the same card. |
| Tablet project failed deterministically while desktop and mobile passed | `devices["iPad (gen 7)"]` injects an iOS Safari user agent; Next's client router then takes Safari-only code paths inside a Chromium engine, producing `due to access control checks` fetch failures and a bounce to `/login`. | Tablet project uses a Chromium user agent (derived from Pixel 5) at 810x1080, DPR 2, touch. |
| Suite stalled for minutes at a time | On-demand dev compilation plus three concurrent dev servers on a machine with ~1-2 GB free RAM; the server that lost the race stalled a server-action round trip. | `scripts/run-e2e.mjs` builds once and runs one project at a time (`next start`), so at most one server is resident and the tests exercise the shipped artifact. |
| Duplicate React keys in the advisory panels | Repeated strings were used as keys. | Index-qualified keys on all nine lists in `app/deals/[id]/page.tsx`. |

### Verified evidence

```
npm run test:e2e     # build + desktop + mobile + tablet, twice
  Production build:  passed (13-14s)
  desktop-chromium:  20 passed (37-40s)
  mobile-chromium:   20 passed (45-46s)
  tablet-chromium:   20 passed (43-46s)
  exit code 0 both runs (60/60)

npm test             # FAIRHOLD_SESSION_SECRET set
  tests 239  pass 215  fail 0  skipped 24  exit 0
  (the 24 skips are the PostgreSQL integration suites, skipped only because
   FAIRHOLD_TEST_DATABASE_URL is unset)

npm run typecheck    # exit 0
npm run lint         # exit 0, no warnings
git diff --check     # exit 0
```

### Isolation

Each project owns port, data directory and reset fixture: desktop 3100 /
`%TEMP%\fairhold-e2e\desktop`, mobile 3101 / `...\mobile`, tablet 3102 /
`...\tablet`. `tests/evidence-lifecycle.spec.ts` reads `FAIRHOLD_DATA_DIR` back
from `testInfo.project.use`, so the reset script and the server cannot disagree.

### Not verified here (unchanged)

Live PayPal sandbox operations, live Gemini calls, non-Chromium engines, a real
PostgreSQL run of the integration suites, and anything on the deployed Preview
that needs SSO or owner credentials. These remain unverified, not passing.
