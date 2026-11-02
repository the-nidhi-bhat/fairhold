# FairHold

> **Status: under active development.** The Deal & Milestone foundation is in
> place: you can create a deal, add milestones with amounts and acceptance
> criteria, move through workflow states, and see an activity timeline. You can
> also submit **evidence**, get a deterministic **rules recommendation**
> (`CAPTURE` / `HOLD` / `VOID` / `DISPUTE` with reason codes), review the
> evidence, and record a **human approval** decision. Persistence is a
> **PostgreSQL backend** with a JSON dev-store default: run without
> `DATABASE_URL` for zero-config JSON storage, or set `DATABASE_URL` and apply
> `npm run db:migrate` / `npm run db:import` to use PostgreSQL (no silent
> fallback — a configured-but-unreachable database fails loudly). A **PayPal
> webhook endpoint** (`/api/paypal/webhook`) verifies signatures and durably
> reconciles authorization and capture events against PostgreSQL (requires
> `DATABASE_URL` + `PAYPAL_WEBHOOK_ID`). Payments are **simulated** by a demo
> provider by default. Signed demo authentication supports buyer, seller and
> reviewer flows. Structured AI advisory includes a deterministic fallback;
> rules always remain authoritative.

FairHold is an **AI-assisted conditional payment platform** built around PayPal,
where:

> **AI proposes. Rules decide.**

## Concept

Two parties — a buyer and a seller — agree on terms for a payment. The payment
is authorized on PayPal and held pending satisfaction of agreed conditions.
Evidence about whether those conditions were met is submitted, an AI model
produces a *recommendation*, and a deterministic rules engine — not the model —
makes the final decision.

The design principle is deliberate:

- **AI proposes.** The model drafts analysis and recommendations, and explains
  its reasoning.
- **Rules decide.** Release, refund, escalation, or waiting is resolved by
  deterministic, auditable application rules.

The AI layer is never allowed to move money, mutate payment state, or bypass
authorization checks.

### Terminology note

PayPal does not provide escrow in this design. Payments are handled with
PayPal authorization and capture primitives under PayPal's own terms. Any
user-facing wording must describe the mechanism accurately rather than calling
it "escrow".

## Architecture

| Layer | Intent | Status |
| --- | --- | --- |
| Web app | Next.js + TypeScript | Deals, milestones, dashboard, workflow states |
| Data | PostgreSQL | Schema + migrations + data-access layer implemented; JSON dev store (`.data/`, git-ignored) is the default when `DATABASE_URL` is unset |
| Payments | PayPal APIs, server-side only | Interface + simulated demo provider (authorize/capture/void) + PayPal sandbox adapter + verified webhook endpoint (`/api/paypal/webhook`) with durable, idempotent reconciliation; no live call from the app |
| Intelligence | Structured advisory plus deterministic rules | Validated AI-shaped output with deterministic fallback; payment decisions are never delegated to AI |

## Getting started

Requires Node.js 24 and npm.

```bash
npm install
npm run dev        # http://localhost:3000
npm run lint
npm run typecheck
npm test
npm run build
```

### Optional: PostgreSQL persistence

Without `DATABASE_URL`, the app uses the JSON dev store under `.data/`
(git-ignored) — no database needed. To use PostgreSQL instead:

```bash
# 1. Set DATABASE_URL (see .env.example; never commit .env)
# 2. Apply migrations (idempotent, transactional)
npm run db:migrate
# 3. Optional: import existing JSON dev data (idempotent; never deletes the JSON)
npm run db:import
# 4. Integration tests (isolated Postgres required):
#    FAIRHOLD_TEST_DATABASE_URL=postgresql://user:password@localhost:5432/fairhold_test npm test
```

There is no silent fallback: once `DATABASE_URL` is set, a missing or
unreachable database makes the app fail loudly.

## Demo authentication configuration

Demo authentication is not production identity verification. Every buyer and
seller identity must be configured explicitly in `FAIRHOLD_DEMO_BUYERS` and
`FAIRHOLD_DEMO_SELLERS`. Reviewers require names in `FAIRHOLD_DEMO_REVIEWERS`
plus deal grants in `FAIRHOLD_REVIEWER_DEALS`, formatted as
`reviewer-name:deal-id`.

## Payment integrity

Capture operations are reserved durably before provider execution and remain
pending or ambiguous until confirmed. Capture capacity includes completed and
outstanding reservations. Capture webhooks reconcile by operation correlation
and validate deal, milestone, amount and currency before completion. Duplicate
deliveries are idempotent. PayPal authorization is a provider hold, not escrow.
JSON webhooks remain unsupported.

### Optional: PayPal webhook

The webhook endpoint lives at `/api/paypal/webhook`. It is **fail-closed**:
without a configured `PAYPAL_WEBHOOK_ID` or without the PostgreSQL backend it
responds `503` and never processes events. Setup:

1. Configure `DATABASE_URL` (webhook processing requires PostgreSQL — the JSON
   dev store has no webhook inbox) and apply migrations:
   `npm run db:migrate`
2. Register this app's listener URL in the PayPal Developer Dashboard (App
   settings → Webhooks). PayPal only delivers to **HTTPS on port 443**; use a
   tunnel (e.g. `ngrok http 3000`) for local development.
3. Copy the **Webhook ID** shown in the dashboard into `PAYPAL_WEBHOOK_ID` in
   `.env` alongside the sandbox `PAYPAL_CLIENT_ID` / `PAYPAL_CLIENT_SECRET`.
4. Restart the app. Payment events (authorization created/voided, capture
   completed/pending) are verified via PayPal's
   `/v1/notifications/verify-webhook-signature` API before any state change.

Delivery semantics, matching official PayPal behavior:

- A `2xx` receipt acknowledges the event; a `5xx` (transient database or
  verification outage) makes PayPal retry the delivery.
- Events are written to the `webhook_events` table with a unique
  `(provider, event_id)` key, so duplicate or concurrent deliveries are
  applied exactly once.
- Events that cannot be reconciled (unknown order/authorization, amount or
  currency mismatch, capture without a matching human approval) are
  **quarantined**: recorded as `failed` with a safe reason and acknowledged,
  so PayPal stops retrying while operators can inspect and, when appropriate,
  re-deliver corrected state (the row is claimed again on redelivery).

Webhooks are **payment-lifecycle evidence, never permission**: a
`PAYMENT.CAPTURE.COMPLETED` event is only recorded once a human approval
already exists for that capture, and it never triggers a capture, milestone
completion, or any other payment action by itself. Authorization and capture
remain distinct concepts — a 29-day authorization hold is not a capture, and a
capture is not a refund.

`npm run typecheck` runs `next typegen` first, because `PageProps` /
`LayoutProps` are globals generated into `.next/types`.

## Security

- Secrets live only in `.env`, which is git-ignored. `.env.example` lists the
  expected variable names with placeholder values.
- PayPal and AI credentials must remain server-side.

## License

See the repository's license file.
