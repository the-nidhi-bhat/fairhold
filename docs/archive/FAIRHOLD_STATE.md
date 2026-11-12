# FairHold implementation state

Updated 2026-11-04.

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
