# Changelog

Notable changes, newest first. Grouped by milestone rather than by commit; the full commit history is the authoritative record.

## Unreleased — demo, precision and presentation pass (2026-11-08)

### Added

- Public guided demo at `/demo`: a browser-only walkthrough that reuses the real
  deterministic rules, keeps state in `localStorage`, labels every payment
  SIMULATED and never calls a payment provider. Ten reducer tests plus five
  Playwright journeys cover it.
- Dashboard search (`?q=`) and status filter (`?status=`), "N of M shown", a
  filtered empty state with Clear, and an attention-count chip.
- Collapsed four-step onboarding explainer on the dashboard.
- "Costs and limits" section on the deal page: no FairHold platform fee exists in
  this build, provider merchant fees sit outside the ledger, USD-only integer
  cents.
- `lib/domain/money.ts` — `summarizeDealMoney` and `parseAmountToCents`, with
  exact integer-cent parsing and no float math.
- Evidence orphan cleanup in the storage layer, with a test.
- GitHub Actions CI with a PostgreSQL 16 service and a CI-only placeholder
  session secret.
- Launch video project in `videos/fairhold-launch/`: 100 s master, 30 s cut,
  thumbnail, contact sheet, SRT captions, brief, storyboard and script.
- `FINAL_RELEASE_REPORT.md` and `FINAL_REMAINING_WORK.md`.

### Changed

- README, TESTING, TASKS, DECISIONS, QA_REPORT and CHANGELOG describe the new
  demo, money, dashboard, fee and video evidence, and keep the unverified items
  unverified.

### Verified

- `npm run typecheck`, `npm run lint`, `npm run build`: pass.
- `npm test` against isolated PostgreSQL 16: 193 pass, 0 fail, 0 skip.
- `npx playwright test`: 27 passed across desktop, mobile and tablet Chromium.
- `npx hyperframes check`: 0 errors, layout 0 issues, 53/53 contrast AA.

## Release and presentation pass (2026-11-07)

### Added

- Premium documentation set: `ARCHITECTURE.md`, `DATABASE.md`, `API_REFERENCE.md`, `PAYMENT_FLOW.md`, `AI_DESIGN.md`, `SECURITY.md`, `SETUP.md`, `USER_GUIDE.md`, `TESTING.md`, `DEPLOYMENT.md`, `DEMO_GUIDE.md`, `RELEASE_CHECKLIST.md`, `QA_REPORT.md`, `HANDOFF.md`.
- Original hero artwork at `public/fairhold-hero.svg` — obsidian and graphite surfaces, deep crimson accents, warm-white wordmark.

### Changed

- `README.md` replaced with a product README: hero, philosophy, problem, solution, role workflows, milestone and payment lifecycles, AI boundary, architecture, database, security, setup, testing, deployment, demo, limitations.
- `playwright.config.ts`: per-test timeout raised to 90 s and assertion timeout to 10 s. Dev-mode route compilation plus an on-OneDrive checkout made the default 30 s too short; every failure observed was a timeout, never an assertion mismatch, and the same assertions pass with the larger budget.
- Landing page, layout, dashboard, deal detail, login, error/loading/not-found states and shared components restyled onto the FairHold design system (obsidian surfaces, graphite insets, crimson accent, warm white type) with CSS-only motion that respects `prefers-reduced-motion`.

### Verified

- `npm run typecheck`, `npm run lint`, `npm run build`: pass.
- `npm test` against isolated PostgreSQL 16: 172 pass, 0 fail, 0 skip.
- `npm run test:e2e`: 9 pass across desktop, mobile and tablet Chromium.

## `f5e48bc` — verification evidence and blockers

- Recorded full verification evidence and the remaining external blockers in the project state documents.

## `518f13c` — end-to-end browser coverage

- Playwright journeys for the buyer/seller lifecycle, access control and deal creation across three viewport profiles.

## `574efde` — ledger, revision and reconciliation alignment

- Aligned the capture ledger, revision handling and reconciliation behaviour across the JSON and PostgreSQL stores.

## `0707ef4` — access guard and fail-closed actions

- Deal access checked before the streaming shell renders, so a non-participant sees a not-found page rather than a blank streamed one.
- Server actions fail closed on missing session, role or access.

## `f210cf2` — deal and milestone foundation complete

- Deal creation, milestone authoring, status transitions, evidence submission and review, approvals and payment operations wired end to end.

## `c58554b` — design system

- Established the premium FairHold visual system: tokens, surfaces, panels, buttons, chips, section labels, motion primitives.

## `1e921a5`, `6a1838c`, `7a96547` — payment integrity

- Durable capture state machine with reservations.
- Capture reservations and reconciliation hardened against double-processing.
- Provider-confirmed capture integrity: an approval is recorded only when the provider confirms settlement.

## `a75a9f1`, `1ee9538`, `5fa65ad` — access control

- Signed demo sessions with expiry, role authorization and server-side allowlists.
- Allowlists fail closed and are re-checked on every read.
- Reviewer access limited to explicit per-deal grants.

## `a8c2c02` — advisory without authority

- AI milestone proposal and evidence advisory with schema validation, deterministic fallbacks and no write path to state or payments.

## `248b9c4` — PayPal sandbox operations

- Authorization, order confirmation, capture with `final_capture`, void, request-id idempotency, timeout and network classification as pending.
- Webhook signature verification and a fail-closed webhook endpoint.

## `41014cf`, `e636356` — evidence, rules and approval

- Evidence validation with magic-number type sniffing.
- Deterministic recommendation engine with reason codes and evidence fingerprints.
- Human approval gate that refuses to approve `HOLD` or `DISPUTE`.

## `ca6b49b`, `0a2106b` — dashboard, deals and milestones

- Domain types, validation, state machines, data layer and payment adapter interface.
- Dashboard, deal detail and milestone experience.

## `ca6229b` … `2906392` — foundation

- Next.js 16 application scaffold, lint and typecheck configuration, application shell, and the initial PayPal sandbox kill-test harness.

## Known limitations at this release

- Demo authentication only; not production identity verification.
- PayPal sandbox transactions not verified: no credentials or webhook id configured.
- Live AI provider calls not verified: no API key configured.
- No production deployment; the repository is not linked to a Vercel project.
- Evidence files are stored on local disk.
- Browser coverage is Chromium only; no automated accessibility audit is wired in.
