# FairHold MVP task state

> **Superseded (2026-11-13) — PayPal sandbox credentials.** The task items in this file that
> report no PayPal sandbox credentials — "Live PayPal sandbox lifecycle: no credentials, no public
> HTTPS webhook, no `PAYPAL_WEBHOOK_ID`" — are **incorrect** as to the credentials. PayPal
> **sandbox** credentials (`PAYPAL_ENV`, `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`) **are**
> configured in the Production scope: they are inherited at **team** level, which is why a
> project-scoped `vercel env ls` does not list them for Production. The signed-in workspace
> therefore uses the **PayPal sandbox** provider — authorizing a deal there creates a **real order
> in the PayPal sandbox** that the buyer must approve in a PayPal sandbox account. PayPal **Live**
> remains architecturally impossible: `readPayPalConfig()` returns `null` unless `PAYPAL_ENV` is
> exactly `sandbox`, so no live adapter can be built and no live money can move. The guided `/demo`
> page is a separate, browser-only path that uses the in-app **simulated** provider and says so on
> screen. The *public webhook*, `PAYPAL_WEBHOOK_ID` and an approved + captured sandbox order remain
> outstanding. See [RELEASE_REPORT.md](../../RELEASE_REPORT.md) §2 and §8. The original text is
> retained below for history.

Updated 2026-11-08.

## Verified in the 2026-11-08 pass

- `npm run typecheck`, `npm run lint`, `npm run build`: pass (build emits 10
  routes, including `/demo`).
- `npm test` against an isolated PostgreSQL 16 container
  (`127.0.0.1:55432`, database `fairhold_test`): 193 tests, 193 pass, 0 failed,
  0 skipped.
- `npm run test:e2e`: 60 passed (20 tests on desktop, mobile and tablet Chromium).
  Each project gets its own server, port and data directory, and the suite runs
  against a production build. Coverage includes search, filtered empty state, fee
  transparency, the guided demo and its PayPal-request guard.
- Public guided demo at `/demo`: browser-only, localStorage persistence, reuses
  the deterministic rules, labels every payment SIMULATED, never calls a provider.
- Money is integer cents end to end; typed amounts parse straight to cents.
- Deal page states what is and is not charged (no platform fee exists in this
  build; provider merchant fees sit outside the ledger).
- Launch video: 100 s master + 30 s cut + thumbnail + contact sheet + SRT, in
  `videos/fairhold-launch/`; `hyperframes check` 0 errors, 53/53 contrast AA.

## Not verified in this pass (do not claim)

- Live PayPal sandbox lifecycle: no credentials, no public HTTPS webhook, no
  `PAYPAL_WEBHOOK_ID`.
- Live AI provider: no `GEMINI_API_KEY`/`GEMINI_MODEL`; only the deterministic fallback.
- Hosted PostgreSQL, durable object storage, production deployment.
- Anonymous access to the deployed preview: Vercel Deployment Protection returns
  302 to SSO.

## Verified in the 2026-11-06 release pass

- `npm run typecheck`, `npm run lint`, `npm run build`: pass.
- `npm test` with `FAIRHOLD_TEST_DATABASE_URL` pointed at an isolated PostgreSQL
  16 container: 172 tests, 172 pass, 0 skipped, 0 failed.
- `npx playwright test`: 9 passed (3 journeys x desktop, mobile, tablet).
- Automated visual and interaction audit: 14 browser probes across desktop 1440,
  mobile 390, tablet 820 and reduced motion. No console errors, no horizontal
  overflow, one rendered `h1` per page, no image without `alt`, no unlabelled
  visible control, visible focus ring, reduced motion honoured.
- Release work committed and pushed to `origin/feat/deal-milestone-foundation`.

## Remaining, executable in this workspace

- Optional: assert the dashboard onboarding explainer in Playwright (today it is
  rendered but not asserted).
- Optional: cut the ten-minute `DEMO_GUIDE.md` script down to a three-minute
  spoken script.
- Optional: Firefox/WebKit runs (`npx playwright install firefox webkit`).
- Optional: an axe or Lighthouse accessibility pass; today's evidence is
  heuristic.

## Blocked by external configuration

- Public demo access: Vercel Deployment Protection covers the preview. Fixing it
  is an owner-side configuration decision.
- Live PayPal sandbox lifecycle: requires `DATABASE_URL`, a public HTTPS webhook
  endpoint and `PAYPAL_WEBHOOK_ID`.
- Live AI provider calls: require non-placeholder `GEMINI_API_KEY` and `GEMINI_MODEL`.
- Hosted PostgreSQL, backups/restore, durable evidence storage, monitoring,
  email notifications: require accounts or paid resources.

## Not claimed

- Production readiness. This is a demo-grade application with simulated payments
  unless the configuration above is supplied.
- PayPal escrow. An authorization is a provider hold, never escrow or settlement.
- Refunds. Not implemented; a void exists, a capture refund does not.
