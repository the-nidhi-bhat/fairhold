# FairHold MVP task state

Updated 2026-11-06.

## Verified in the 2026-11-06 release pass

- `npm run typecheck`, `npm run lint`, `npm run build`: pass.
- `npm test` with `FAIRHOLD_TEST_DATABASE_URL` pointed at an isolated PostgreSQL
  16 container: 172 tests, 172 pass, 0 skipped, 0 failed (19.2s).
- `npx playwright test`: 9 passed (3 journeys x desktop, mobile, tablet) in 2.1m
  against a warm production build on port 3100.
- Automated visual and interaction audit: 14 browser probes across desktop 1440,
  mobile 390, tablet 820 and reduced motion. No console errors, no horizontal
  overflow, one rendered `h1` per page, no image without `alt`, no unlabelled
  visible control, visible focus ring, reduced motion honoured.
- Defects investigated to root cause and dismissed as harness artifacts (not
  application defects): the hydration attribute mismatch came from the audit
  tool's screenshot `caret-color: transparent` injection, and the second
  dashboard `h1` belongs to a retained, non-rendered login subtree.
- Release work committed in 17 reviewable commits and pushed to
  `origin/feat/deal-milestone-foundation`; local and remote HEAD match and the
  tree is clean.

## Verified in the 2026-11-04 pass

- `npm run typecheck`, `npm run lint`, `npm run build`: pass.
- `npm test` with `FAIRHOLD_TEST_DATABASE_URL` pointed at an isolated PostgreSQL
  16 container: 172 tests, 172 pass, 0 skipped, 0 failed.
- `npx playwright test`: 9 passed (3 journeys x desktop, mobile, tablet).
- Buyer/seller lifecycle: authorization hold, evidence upload and download,
  rejection with note, revision and resubmission, acceptance, simulated capture,
  payment history, reload persistence, and double-payment prevention.
- Access control: anonymous download 404, unknown identity rejected at login,
  non-participant deal access shows not-found, role-gated controls.
- Deal creation and milestone authoring across both roles, with dashboard
  visibility.
- Not-found rendering after hoisting the deal guard out of the Suspense
  boundary (previously blank in the browser).
- PostgreSQL approval/capture ledger fixes, revision supersession, migration
  advisory locking, and webhook reconciliation regression tests.

## Remaining, executable in this workspace

- Optional: Firefox/WebKit runs and a Lighthouse/axe accessibility pass
  (Chromium-only today).
- Optional: verify PostgreSQL behaviour across a physical server restart.
- Optional: add a production authentication story; demo login remains
  name+role only.

## Blocked by external configuration

- Live PayPal sandbox lifecycle (authorization, capture, partial capture, void,
  webhook verification, duplicate delivery): requires `DATABASE_URL` so the app
  uses PostgreSQL-backed accounting, a public HTTPS webhook endpoint, and
  `PAYPAL_WEBHOOK_ID`. The app currently uses the demo provider by design, and
  real sandbox actions are refused without PostgreSQL.
- Live AI provider calls: require non-placeholder `AI_API_KEY` and `AI_MODEL`.
  The deterministic fallback is what is verified today.

## Not claimed

- Production readiness. This remains a demo-grade application with simulated
  payments unless the sandbox configuration above is supplied.
- PayPal escrow. An authorization is a provider hold, never escrow or
  settlement.
