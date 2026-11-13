# FairHold implementation state

Updated 2026-11-04.

> **Superseded (2026-11-13) — PayPal sandbox credentials.** The statements in this file that
> report no PayPal sandbox credentials in Production, and therefore that the app "runs the demo
> provider" there, are **incorrect**. PayPal **sandbox** credentials (`PAYPAL_ENV`,
> `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`) **are** configured in the Production scope: they are
> inherited at **team** level, which is why a project-scoped `vercel env ls` does not list them for
> Production. The signed-in workspace therefore uses the **PayPal sandbox** provider — authorizing a
> deal there creates a **real order in the PayPal sandbox** that the buyer must approve in a PayPal
> sandbox account. PayPal **Live** remains architecturally impossible: `readPayPalConfig()` returns
> `null` unless `PAYPAL_ENV` is exactly `sandbox`, so no live adapter can be built and no live
> money can move. The guided `/demo` page is a separate, browser-only path that uses the in-app
> **simulated** provider and says so on screen. See
> [RELEASE_REPORT.md](../../RELEASE_REPORT.md) §2 and §8. The original text is retained below for
> history.

## Implemented and verified

- App Router UI: landing, demo login, dashboard, deal creation, deal detail,
  milestones, evidence, approvals and activity timeline.
- Server-side demo authentication with allowlists and deal-level access checks.
- Deterministic rules engine for milestone and deal status transitions.
- JSON development persistence and PostgreSQL persistence with per-file test
  schema isolation and concurrency-safe migrations.
- Payment authorization, capture ledger, capture limits, void handling and
  webhook reconciliation. Ambiguous outcomes stay PENDING.
- Demo payment provider with explicit simulated labeling; no provider requests
  are made in demo mode.
- AI milestone and evidence advisory with validated JSON output and
  deterministic fallback; advisory only, never state-changing.
- Automated browser journeys for desktop, mobile and tablet (Chromium).

## Verified evidence

- `npm test` against an isolated PostgreSQL 16 container: 172/172 pass,
  0 skipped.
- `npx playwright test`: 9/9 pass.
- `npm run typecheck`, `npm run lint`, `npm run build`: pass.
- See `QA_REPORT.md` for commands, the acceptance matrix and defects fixed.

## Not demonstrated / blocked

- Live PayPal sandbox execution: blocked on `DATABASE_URL`, a public HTTPS
  webhook endpoint and `PAYPAL_WEBHOOK_ID`. The app runs the demo provider and
  refuses real sandbox actions without PostgreSQL.
- Live AI provider calls: blocked on `GEMINI_API_KEY`/`GEMINI_MODEL`; the deterministic
  fallback is verified.
- Cross-browser (Firefox/WebKit) and physical-device testing: not run.
- Production authentication: demo login is name+role based and not suitable for
  production.
