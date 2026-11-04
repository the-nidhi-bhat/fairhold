# FairHold MVP QA report

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
- With no `AI_API_KEY`/`AI_MODEL`, the UI reports the deterministic fallback
  source. Live provider calls were not executed and are not claimed.
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
