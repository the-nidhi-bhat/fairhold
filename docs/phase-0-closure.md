# Phase 0 closure report — PayPal authorization hold lifecycle

Concise decision record. The full evidence lives in
[`evidence/paypal-kill-test.md`](evidence/paypal-kill-test.md); this page states
what was verified, the limits of that verification, and the Phase 0 exit
decision. It records only what was actually observed against the sandbox.

- Date: 2026-10-12
- Environment: PayPal **Sandbox** only (`https://api-m.sandbox.paypal.com`)
- Harness: `scripts/paypal-kill-test.mjs` (server-side, native Node, no deps) —
  a standalone probe, **not** the app adapter (`lib/payments/paypal.ts`)
- Executor: automated harness + manual sandbox-buyer approval

## The question Phase 0 had to answer

Does a single PayPal `intent=AUTHORIZE` authorization support a **partial
capture** while leaving a **voidable remainder**? If not, the product model — a
29-day authorization hold released per approved milestone — cannot work.

**Answer: YES — verified in Sandbox, with open probes.**

## Verified behavior (sandbox lifecycle run)

Sandbox order `0NV67669XK692321B`; authorization `4AN26660J95331452` for
`$90.00 USD`.

| Step | Command | Observed |
| --- | --- | --- |
| Create order | `node scripts/paypal-kill-test.mjs create` | order `0NV67669XK692321B`, sandbox approve URL |
| Approve | browser, sandbox buyer | successful — authorization obtainable |
| Authorize | `... authorize` | authorization `4AN26660J95331452`, `$90.00 USD` |
| Read authorization | `... get-auth` | HTTP 200 |
| Partial capture | `... capture` | HTTP 201, `$10.00 USD`, capture `43C06829W11193325`, `COMPLETED` |
| Read authorization after capture | `... get-auth` | HTTP 200, `PARTIALLY_CAPTURED` |
| Read capture | `... get-capture 43C06829W11193325` | HTTP 200, `COMPLETED` |
| Void remainder | `... void` | HTTP 204, accepted |
| Read authorization after void | `... get-auth` | HTTP 200, `VOIDED` |

Final local state: `pendingAuthorize` / `pendingCapture` / `pendingVoid` all
`null`; the capture and void records are persisted. All steps ran against the
PayPal Sandbox.

## Command evidence

Local, non-network checks re-run against the committed harness (2026-10-12,
harness revision `0c63dd1`):

```
node --check scripts/paypal-kill-test.mjs        -> exit 0
node --test scripts/paypal-kill-test.test.mjs    -> 42/42 pass, 0 fail (offline)
npm test                                         -> 132 tests, 112 pass, 20 skip, 0 fail
npm run lint                                     -> exit 0
npm run typecheck                                -> exit 0
```

The 20 skipped tests are the PostgreSQL integration suite, which requires
`FAIRHOLD_TEST_DATABASE_URL`; they are not failures.

## Limitations and untested cases

- **Timeout / unknown-outcome recovery** — the `pending*` marker →
  `resolve <op> --confirmed` flow is offline-tested only; it was never
  exercised against the live API. No live ambiguous/timeout response was
  provoked.
- **Local-state guard is not a true lock** — the state-file write guard is
  stale-write (concurrent-modification) detection that fails closed. It is
  **not** a cross-process lock; the harness is a single-operator CLI.
- **HTTP 5xx recorded as a definite outcome** — any HTTP response, including a
  `5xx`, is treated as a definite HTTP outcome: the pending marker is cleared
  and the attempt is recorded as `ok:false` with its `httpStatus`. A genuine
  provider-side `5xx` can still leave the actual payment outcome ambiguous, so
  a retry may be unsafe until provider state is reconciled. PayPal's
  server-side authorization/remainder validation is a backstop, not a
  substitute for reconciliation or a guarantee against every failure mode.
  This path was **not exhaustively sandbox-tested** — no live `5xx` was
  provoked.
- **Webhook signature verification not independently proven** — the app-side
  webhook endpoint and its signature postback are unit-tested with a **mocked**
  transport only. No genuine Sandbox webhook event has been delivered to the
  endpoint and verified against real provider callbacks.
- **Production behavior untested** — every result above is Sandbox-only. The
  app adapter has never made a real call; no production endpoint, real
  credentials, settlement, or hosted deployment is involved.
- **No refunds or dispute flow** — the harness (and the app) implement no refund
  primitive and no dispute workflow. `Disputed` states/reason codes exist in the
  domain model, but there is no refund or dispute resolution path.

Also not exercised in this run: a **second distinct partial capture** on the
same authorization, the per-authorization **capture-count limit**,
**`final_capture=true`** semantics, the live **over-capture (422) rejection**
(unit-tested only), and **live webhook delivery**.

## Phase 0 exit decision

**Recommendation: CLOSE Phase 0 — conditional pass (sandbox-verified) with
tracked open items.**

- The primary product assumption is verified in Sandbox: one authorization
  supports a partial capture with a voidable remainder
  (`PARTIALLY_CAPTURED` → `VOIDED`).
- The open probes above are recorded, not resolved. Carry them forward as
  tracked risks; they do not block the next phase on the current timeline.
- Do **not** describe the payment path as production-ready. Refunds, disputes,
  live webhook delivery, live timeout recovery, and app-adapter execution remain
  unimplemented or unverified.
