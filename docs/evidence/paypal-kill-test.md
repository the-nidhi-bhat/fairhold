# PayPal Sandbox kill test — evidence

Phase 0 of FairHold. This file records only what was actually observed. No
operation below is marked VERIFIED unless it was executed against the PayPal
sandbox and its result inspected.

- First recorded artifact: 2026-10-09; full lifecycle run: 2026-10-12
- Environment: PayPal **sandbox** only (`https://api-m.sandbox.paypal.com`)
- Harness: `scripts/paypal-kill-test.mjs` (server-side only, native Node, no deps)
- Executor: automated harness + manual sandbox-buyer approval

## Status summary

| Operation | Result |
| --- | --- |
| Harness authoring + static check (`node --check`) | VERIFIED (local) |
| Config guard (`doctor`, sandbox enforcement, no network) | VERIFIED (local) |
| OAuth token request | VERIFIED — succeeded; multiple sandbox creates recorded |
| Create `intent=AUTHORIZE` order | VERIFIED — order `0NV67669XK692321B` (lifecycle run); earlier orders `4PR45891KG314782N`, `158613799F859594D` archived to `runs[]` |
| Buyer approval | VERIFIED (implied) — authorization succeeded, which requires an `APPROVED` order |
| Authorize order | VERIFIED — authorization `4AN26660J95331452`, `$90.00 USD` |
| Partial capture #1 (`final_capture=false`) | VERIFIED — `$10.00 USD`, capture `43C06829W11193325`, HTTP 201, `COMPLETED` |
| get-auth after capture | VERIFIED — HTTP 200, `PARTIALLY_CAPTURED` |
| get-capture verification | VERIFIED — HTTP 200, `COMPLETED` |
| Void remaining authorization | VERIFIED — HTTP 204, accepted |
| get-auth after void | VERIFIED — HTTP 200, `VOIDED` |
| Second partial capture on same authorization | NOT RUN |
| Capture #3 probe (max-capture-count) | NOT RUN |
| Final capture (`final_capture=true`) | NOT RUN |
| Over-capture rejection (PayPal 422) | NOT RUN |
| Timeout/UNKNOWN live recovery | NOT RUN (logic offline-tested only, see below) |
| Webhook delivery + signature verification | NOT TESTED (prerequisite not met) |

**Correction (2026-10-09):** the harness did contact the PayPal sandbox at
least once. The local, gitignored state file
(`scripts/.paypal-kill-test-state.json`) recorded a created order —
`orderId 4PR45891KG314782N`, `orderStatus PAYER_ACTION_REQUIRED`, a sandbox
`approveUrl`, empty `captures` and `voids`. That means the OAuth token request
and `create` succeeded. An earlier revision of this file asserted that "no
PayPal API calls were executed" — that claim was not supported by the state
file and is superseded. That status is now itself superseded by the full
2026-10-12 lifecycle run below.

## What was actually run

### Local, non-network checks (re-run at harness revision `0c63dd1`)

```
node --check scripts/paypal-kill-test.mjs           -> exit 0 (syntax valid)
node --test scripts/paypal-kill-test.test.mjs       -> 42/42 pass, 0 fail (offline)
npm test                                            -> 132 tests, 112 pass, 20 skip (postgres integration)
npm run lint                                        -> exit 0
npm run typecheck                                   -> exit 0
```

### Executed lifecycle run (2026-10-12, PayPal sandbox)

The full partial-capture-and-void sequence ran against the sandbox on order
`0NV67669XK692321B` (created after the previous active order
`158613799F859594D` was auto-archived into `runs[]`):

| Step | Command | Observed |
| --- | --- | --- |
| Create order | `node scripts/paypal-kill-test.mjs create` | order `0NV67669XK692321B`, sandbox approve URL |
| Approve | browser, sandbox buyer account | successful — authorization became obtainable |
| Authorize | `node scripts/paypal-kill-test.mjs authorize` | authorization `4AN26660J95331452` |
| Read authorization | `node scripts/paypal-kill-test.mjs get-auth` | HTTP 200, amount `90.00 USD` |
| Partial capture | `node scripts/paypal-kill-test.mjs capture` | HTTP 201, `$10.00 USD`, capture `43C06829W11193325`, status `COMPLETED` |
| Read authorization (after capture) | `node scripts/paypal-kill-test.mjs get-auth` | HTTP 200, status `PARTIALLY_CAPTURED` |
| Read capture | `node scripts/paypal-kill-test.mjs get-capture 43C06829W11193325` | HTTP 200, status `COMPLETED` |
| Void remainder | `node scripts/paypal-kill-test.mjs void` | HTTP 204, accepted |
| Read authorization (after void) | `node scripts/paypal-kill-test.mjs get-auth` | HTTP 200, status `VOIDED` |

Persisted local state (gitignored `scripts/.paypal-kill-test-state.json`,
final `updatedAt 2026-10-12T11:51:14.861Z`):

- `orderId 0NV67669XK692321B`, `authorizationId 4AN26660J95331452`,
  `authorizationStatus VOIDED`, `authorizationAmount 90.00`.
- `captures`: one record — `{attempt 1, requestId 21f310f5-…,
  invoiceId fairhold-killtest-capture-1791800944448-76919, amount 10.00,
  finalCapture false, httpStatus 201, ok true, captureId 43C06829W11193325,
  status COMPLETED}`.
- `voids`: one record — `{requestId f5ea4d0c-…, httpStatus 204, ok true,
  error null}`.
- `pendingCapture` / `pendingVoid` / `pendingAuthorize`: all `null` (nothing
  unresolved).
- `runs[]` archives the two prior orders (`4PR45891KG314782N`,
  `158613799F859594D` — both `PAYER_ACTION_REQUIRED`, never authorized).

What this establishes: OAuth, order create, buyer-approval path, authorize
($90.00), one partial capture ($10.00, `COMPLETED`), `PARTIALLY_CAPTURED`
provider state, capture readback, void of the remaining authorization
(HTTP 204), and `VOIDED` provider state — all against the real sandbox API.

What it does **not** establish:

- a **second distinct partial capture** against the same authorization;
- the maximum number of partial captures PayPal permits;
- `final_capture=true` semantics and state transitions;
- live behavior of the local over-capture refusal and the PayPal 422 reject
  path (unit-tested only);
- live timeout/UNKNOWN recovery (the `pending*` marker → `resolve
  <op> --confirmed` flow is offline-tested, never exercised against the API);
- live `5xx` handling: a `5xx` reply is recorded as a definite HTTP outcome —
  the pending marker clears and the attempt is stored as `ok:false` with its
  `httpStatus` — but a genuine provider-side `5xx` can leave the actual payment
  outcome ambiguous, so a retry may be unsafe until provider state is
  reconciled. PayPal's server-side authorization/remainder validation is a
  backstop, not a substitute for reconciliation or a guarantee against every
  failure mode. This path was **not exhaustively sandbox-tested**; no live
  `5xx` was provoked.

## Webhooks

Not tested. Webhook delivery requires either a publicly reachable endpoint or a
PayPal dashboard webhook configuration with a webhook ID. Neither is in place,
and webhook signature verification has not been independently proven against
real provider callbacks. The app-side webhook endpoint and its signature
postback are unit-tested with a mocked transport only. This remains a documented
prerequisite; the harness makes no webhook claims.

## Safety boundaries honored

- Sandbox host hard-coded; the harness refuses to run unless `PAYPAL_ENV`
  resolves to `sandbox`.
- Captures/voids are only ever issued against the authorization id created by
  the same local state file.
- Access tokens, client secret, and `Authorization` headers are never printed.
- Requests are bounded by `KILL_TEST_TIMEOUT_MS` (default 15000ms); a timeout is
  reported as an UNKNOWN outcome, never as a payment failure, and is never
  retried automatically. A new order archives the previous run into `runs`
  instead of erasing it.
- An authorize/capture/void that ends without a definite response leaves an
  UNRESOLVED marker (`pendingAuthorize` / `pendingCapture` / `pendingVoid`)
  that blocks **all** further money-moving commands, including `create`. Reads
  such as `get-auth` never clear it — they can only show provider state. The
  operator verifies provider state manually and unblocks with
  `resolve <op> --confirmed`, which moves the marker into `resolved` history
  instead of deleting it. `get-order` adopts an existing authorization (with
  its id) when reconciling a timed-out `authorize`.
- The authorization amount is recorded when the provider returns it; local
  captures are summed only from records PayPal accepted **and** reported
  `COMPLETED`, and an over-capture is refused before any network call when the
  authorized amount is known locally. Unknown amounts are never presented as
  authoritative totals.
- The local-state write guard detects concurrent modification (stale write) and
  fails closed; it is stale-write detection, **not** a true lock — the harness
  is a single-operator CLI.
- No live credentials, no production endpoint, no real funds.
- The harness is separate from the Next.js app; the app's own PayPal adapter
  (`lib/payments/paypal.ts`) has never made a real call.

## Conclusion

Phase 0's primary question is now **partially verified, with known open
probes**, not blocked. On 2026-10-12 the harness executed the full sequence
against the PayPal sandbox: create → buyer approval → authorize (`$90.00`) →
one partial capture (`$10.00`, `COMPLETED` via HTTP 201) → provider state
`PARTIALLY_CAPTURED` → void of the remaining authorization (HTTP 204) →
provider state `VOIDED`. One PayPal authorization therefore demonstrably
supports a partial capture with a **voidable remainder** in the sandbox.

Still UNVERIFIED and explicitly out of scope of this run: multiple distinct
partial captures against one authorization, `final_capture=true`, the
per-authorization capture-count limit, live over-capture (422) rejection,
live timeout/UNKNOWN recovery, app-adapter execution (this was the standalone
harness, not `lib/payments/paypal.ts`), and end-to-end webhook delivery. No
settlement to a real account and no refund occurred; refunds are not
implemented.