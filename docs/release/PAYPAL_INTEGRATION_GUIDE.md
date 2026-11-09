# FairHold — PayPal Integration Guide

**Scope:** PayPal *sandbox* only. This document describes how FairHold integrates with PayPal for milestone-based payment coordination, what is implemented, what is verified, and what requires owner-provided credentials before live sandbox verification.

## 1. Principle

> "AI proposes. Rules decide. Humans approve. PayPal executes. The audit trail records everything."

PayPal executes the payment hold/capture only after deterministic rules and a human approval have both authorized it. FairHold is **not** an escrow service; a PayPal authorization is a hold, not captured or settled money.

## 2. Architecture

```
┌─────────────┐      ┌──────────────────┐      ┌─────────────────┐
│   Buyer     │      │   Deterministic  │      │     Human       │
│   (approves │─────▶│    rules engine  │─────▶│   reviewer      │
│    order)   │      │  (planCapture)   │      │   (CAPTURE)     │
└─────────────┘      └──────────────────┘      └────────┬────────┘
                                                        │
                                                        ▼
                                               ┌─────────────────┐
                                               │   PayPal        │
                                               │   sandbox API   │
                                               │  (capture)      │
                                               └────────┬────────┘
                                                        │
                                                        ▼
                                               ┌─────────────────┐
                                               │  Payment ledger │
                                               │  (PostgreSQL)   │
                                               └─────────────────┘
```

### Layers

| Layer | Responsibility | Key file |
|-------|---------------|----------|
| Provider selection | Chooses PayPal sandbox adapter or demo provider based on config | `lib/payments/index.ts`, `lib/payments/runtime.ts` |
| PayPal sandbox adapter | OAuth, order create, authorize, capture, void, webhook signature verification | `lib/payments/paypal.ts` |
| Demo provider | No network calls; all results `simulated: true` | `lib/payments/demo.ts` |
| Capture state machine | Authorization cap, duplicate prevention, idempotency | `lib/payments/capture-state.ts` |
| Config | Credential reading, placeholder rejection, sandbox-only | `lib/payments/config.ts` |
| Webhook endpoint | Signature verification, fail-closed, idempotent processing | `lib/payments/webhook-endpoint.ts`, `app/api/paypal/webhook/route.ts` |
| Deal actions | Human-approval-gated capture/void server actions | `app/deals/actions.ts` |

## 3. Provider selection (runtime)

`paymentRuntime()` decides once, before any operation starts:

| Configuration | Provider | Production behavior |
|---------------|----------|---------------------|
| No PayPal config | Demo provider | Throws unless `FAIRHOLD_ALLOW_SIMULATED_PAYMENTS=true` |
| PayPal config, no PostgreSQL | Demo provider | Throws unless `FAIRHOLD_ALLOW_SIMULATED_PAYMENTS=true` |
| PayPal config + PostgreSQL | PayPalSandboxProvider | Real sandbox adapter |

A started real sandbox operation is never downgraded to simulated mid-flow.

## 4. Required environment variables (server-side only)

Never expose these to the browser. Never print them in logs or error messages.

| Variable | Purpose | Example format |
|----------|---------|----------------|
| `PAYPAL_ENV` | Must be exactly `sandbox` to enable the real adapter | `sandbox` |
| `PAYPAL_CLIENT_ID` | PayPal sandbox client ID | 20+ char base64url string |
| `PAYPAL_CLIENT_SECRET` | PayPal sandbox client secret | Long random string |
| `PAYPAL_WEBHOOK_ID` | Registered PayPal webhook ID (nullable) | Webhook ID from PayPal developer dashboard |
| `FAIRHOLD_ALLOW_SIMULATED_PAYMENTS` | Opt-in to simulated payments in production | `true` |
| `FAIRHOLD_SESSION_SECRET` | Session signing secret (required in all envs) | Long random string |
| `DATABASE_URL` | PostgreSQL connection string (required for real payments) | `postgresql://...` |

Placeholder detection (`looksPlaceholder`) rejects short values and known sample patterns (`your_`, `change-me`, `sample`, `dummy`, `test`, etc.). Real credentials must be ≥12 characters.

## 5. PayPal sandbox API lifecycle

All calls go to `https://api-m.sandbox.paypal.com` (sandbox only — never production).

### 5.1 Authentication
- `POST /v1/oauth2/token` — client-credentials grant, token cached with a 60-second safety margin.
- Authentication failure is reported without leaking secrets.

### 5.2 Order creation (authorization hold)
- `POST /v2/checkout/orders` with `intent: "AUTHORIZE"`.
- Amount and currency validated server-side (integer cents, 3-letter currency).
- `PayPal-Request-Id` idempotency key sent on every mutating call.
- Returns an `approvalUrl` the buyer must visit in PayPal.
- **No money has moved** — this is only a hold reservation.

### 5.3 Buyer approval
- Buyer approves the order at the PayPal approval URL.
- Approval of a PayPal order does **not** automatically approve a milestone — the human reviewer must still approve via `recordMilestoneApproval`.

### 5.4 Authorize order
- `POST /v2/checkout/orders/{id}/authorize`.
- Only `CREATED`/`AUTHORIZED` status is accepted as a confirmed hold.
- `PENDING`, unknown, or missing status is reported conservatively — never retried blindly.
- Provider-reported `expiration_time` is parsed and stored only when valid.

### 5.5 Capture
- `POST /v2/payments/authorizations/{id}/capture` with `final_capture` and `invoice_id`.
- Requires a pre-existing human `CAPTURE` approval (enforced by `planApproval` + `planCapture`).
- `COMPLETED` only when PayPal explicitly reports `COMPLETED` with a capture id.
- A 2xx response alone is **not** treated as settlement.
- Timeouts and ambiguous outcomes become `PENDING` — never blindly retried.

### 5.6 Void
- `POST /v2/payments/authorizations/{id}/void`.
- Releases the remaining authorization hold. **Not a refund.** Refunds are intentionally not modeled.

## 6. Safety invariants (mandatory, tested)

1. Every amount is calculated and validated server-side; `FormData` never supplies an amount.
2. No AI response can authorize a payment or execute a capture.
3. No webhook can replace human milestone approval or bypass the state machine.
4. Duplicate capture attempts are blocked by the authorization cap and idempotency keys.
5. Confirmed provider captures are accounted for exactly once in the ledger.
6. Concurrent captures cannot exceed the authorized amount.
7. An ambiguous provider outcome is reconciled before retrying — never blindly retried.
8. A simulated transaction is never represented as a real provider transaction.
9. Webhook signature verification fails closed (5xx on infra errors, 400 on invalid signatures, 200 only after durable processing).
10. No secrets reach the browser, logs, or responses.

## 7. Webhook endpoint

| Condition | HTTP status | Retried by PayPal? |
|-----------|-------------|-------------------|
| Not configured | 503 | Yes |
| Non-PostgreSQL backend | 503 | Yes |
| Oversized / malformed body | 413 / 400 | No |
| Missing transmission headers | 400 | No |
| Signature verification failed | 400 | No (definitive) |
| Verification infrastructure error | 500 | Yes |
| Database / processing failure | 500 | Yes |
| Processed / duplicate / quarantined / unsupported | 200 | No |

- `UNIQUE(provider, event_id)` provides durable duplicate-event dedupe.
- `capture_completed` events record evidence only — milestone state advances via the human approval flow, not the webhook.
- No transmission headers, signatures, payloads, or secrets are logged.

## 8. Demo mode vs. real payments

| | Demo provider | PayPal sandbox adapter |
|---|---------------|------------------------|
| Network calls | None | Real sandbox API |
| Result flag | `simulated: true` | `simulated: false` |
| Credentials required | No | `PAYPAL_CLIENT_ID`/`SECRET` + PostgreSQL |
| Money movement | None | Real sandbox authorization/capture |
| Used by `/demo` | Yes | No |

The demo provider makes **no PayPal requests**. A Playwright regression test fails if any `/demo` request URL mentions PayPal.

## 9. What is NOT implemented (honest limits)

- Partial capture / remaining authorization handling — not modeled.
- Refunds — not implemented (void is not a refund).
- Real sandbox transaction — **NOT VERIFIED** (no sandbox credentials, no public webhook, no `PAYPAL_WEBHOOK_ID`).
- Webhook rate limiting — not implemented (design-level limit).
- Webhook payload retention/TTL — not implemented (design-level limit).
- Ambiguous-capture reconciliation automation — product decision needed (retry vs. reconcile).

## 10. Owner actions to enable live sandbox verification

1. Create a PayPal sandbox app at developer.paypal.com.
2. Set `PAYPAL_ENV=sandbox`, `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`.
3. Provision a PostgreSQL database and set `DATABASE_URL`.
4. Register a public HTTPS webhook URL and set `PAYPAL_WEBHOOK_ID`.
5. Run `FAIRHOLD_ALLOW_SIMULATED_PAYMENTS` unset (or not `true`) so production uses the real adapter.
6. Verify: sandbox OAuth → order create → buyer approval → capture → webhook → ledger accounting.

Until credentials are provided, the sandbox integration status is **IMPLEMENTED (code), NOT VERIFIED (live)**.

## 11. Test coverage

| Test file | Coverage |
|-----------|----------|
| `lib/payments/paypal.test.ts` | OAuth, order create, authorize, capture, void, idempotency, token caching, webhook events, signature verification, config, provider selection |
| `lib/payments/webhook-endpoint.test.ts` | Fail-closed contract, body caps, signature outcomes, database outcomes |
| `lib/payments/capture-state.test.ts` | Authorization cap, duplicate prevention, final-capture logic |
| `lib/payments/demo.test.ts` | Demo provider isolation, no network calls |
| `lib/payments/paypal-crossworkflow.test.ts` | AI advisory → human approval → capture gate, demo isolation |
| `tests/evidence-lifecycle.spec.ts` | E2E buyer/seller lifecycle with simulated capture |
| `tests/demo.spec.ts` | Guided demo, no-PayPal-call guard |

Run: `FAIRHOLD_TEST_DATABASE_URL=… FAIRHOLD_SESSION_SECRET=… npm test`
