# Development status

Last updated: Phase 5 (PayPal webhook endpoint + durable reconciliation).

## What exists

- Git repository connected to the project's GitHub remote. Feature work happens
  on branches; `main` is not committed to directly.
- Next.js 16.4.0 application scaffold: App Router, TypeScript 5, Tailwind CSS 4,
  ESLint 9, npm as the single package manager.
- Root layout and landing page describing the concept and the AI/rules
  boundary.
- **Domain layer** (`lib/domain`): deal and milestone types, input validation,
  deterministic status-transition rules, progress and payment-status derivation.
  It now also includes **evidence validation** (note length, URL scheme
  allowlist of `http`/`https`, per-file size cap, extension allowlist, content
  sniffing by magic bytes, filename sanitization) and a **pure deterministic
  rules engine** that returns a `CAPTURE` / `HOLD` / `VOID` / `DISPUTE`
  recommendation with structured reason codes. Pure and unit-tested.
- **Development persistence** (`lib/data`): with no `DATABASE_URL` configured the
  app runs in explicit dev mode — deals are stored as a JSON file at
  `.data/fairhold.json` and submitted evidence files under `.data/evidence/` (both
  git-ignored). This is demo storage, not a database: single-instance, guarded
  only by an in-process write lock.
- **PostgreSQL persistence** (`lib/data/postgres`, `migrations/`): a real schema
  (`0001_initial.sql`) covering deals, milestones, evidence with decisions and
  metadata, one human approval per milestone (with evidence fingerprint), an
  append-only audit trail, and payment records (orders / authorizations /
  captures) with integer-cent amounts, status `CHECK` constraints, foreign keys,
  and unique constraints that enforce at most one pending order and one
  authorization per deal. A hand-rolled transactional migration runner applies
  pending `*.sql` files idempotently (`npm run db:migrate`). The data-access
  layer (`lib/data/index.ts`) selects the backend at startup: PostgreSQL when
  `DATABASE_URL` is set, otherwise the JSON dev store. **There is no silent
  fallback** — a configured but unreachable database fails loudly. Every
  mutation runs in a transaction with `SELECT ... FOR UPDATE` on the deal row
  (concurrency-safe: exactly one concurrent authorization wins) and
  parameterized queries; driver errors are never surfaced to callers. Evidence
  file bytes are stored on disk, not in PostgreSQL (a storage abstraction with a
  documented object-storage requirement for production). A validating,
  idempotent import command (`npm run db:import`) loads the JSON dev store into
  PostgreSQL, rejects payment-inconsistent records, and never deletes or
  modifies the source JSON.
- **Payment provider boundary** (`lib/payments`): a server-side adapter interface
  with `createAuthorizationHold`, `authorizeOrder`, `captureAuthorization`, and
  `voidAuthorization`, plus two implementations:
  - a **demo provider** that makes **no network calls** and records simulated
    operations only (the default, and the only mode without configuration), and
  - a **PayPal sandbox adapter** (`paypal.ts`) that talks only to
    `api-m.sandbox.paypal.com`. It implements the verified official flow: OAuth
    client-credentials token (cached with expiry margin), `intent=AUTHORIZE`
    order creation with buyer `return_url`/`cancel_url`, order authorization to
    obtain the authorization id, capture against an authorization
    (`final_capture` + unique `invoice_id`), and void of an authorization. Every
    mutating call sends a `PayPal-Request-Id` idempotency key; timed-out requests
    surface as `PENDING` (ambiguous) and are never retried blindly; validation
    (amount/currency/authorization reference) happens before any request; access
    tokens and secrets are never logged or returned in messages.
  - Provider selection (`getPaymentProvider`) enables the sandbox adapter only
    when `PAYPAL_ENV=sandbox` **and** real-looking credentials are present;
    placeholder values are ignored and the app stays on the demo provider. A
    started real operation is never downgraded to simulated.
- **PayPal webhook endpoint + durable reconciliation** (`app/api/paypal/webhook`,
  `lib/payments/webhook-endpoint.ts`, `lib/data/postgres/webhooks.ts`,
  `migrations/0002_authorization_status.sql`): a fail-closed Route Handler that
  requires sandbox config (including `PAYPAL_WEBHOOK_ID`) and the PostgreSQL
  backend (`503` otherwise), reads PayPal's five `paypal-transmission-*`
  headers, caps the body at 1 MB, and verifies the event signature through the
  provider boundary's postback call to PayPal's
  `/v1/notifications/verify-webhook-signature`. Verification failures are `400`
  (permanent, no retry); verification infrastructure outages are `500` (PayPal
  retries). Verified events are processed in **one transaction**: inserted into
  `webhook_events` with a unique `(provider, event_id)` key, claimed
  (`received`/`failed` → `processing`, attempts incremented), reconciled against
  the payment tables with `FOR UPDATE` guards, then marked `processed` (or
  `failed` with a sanitized reason when quarantined). Duplicate and concurrent
  deliveries are applied exactly once; a transient database failure rolls back
  the whole delivery so PayPal redelivers safely; a quarantined (`failed`) row
  can be re-claimed on redelivery after corrective state. Reconciliation
  semantics: `PAYMENT.AUTHORIZATION.CREATED` either confirms an existing
  authorization or resolves a pending order into an authorized deal (amount and
  currency must match), `PAYMENT.AUTHORIZATION.VOIDED` marks the authorization
  `VOIDED` (never regressing deal/milestone state), `PAYMENT.CAPTURE.COMPLETED`
  is recorded **only** when a matching human approval with `CAPTURE` action
  already exists (event is evidence, never permission — it cannot approve,
  capture, or complete anything by itself), and `PAYMENT.CAPTURE.PENDING` is
  quarantined because FairHold treats captures as synchronous. Audit events stay
  append-only. Unknown/unsupported event types are acknowledged and recorded as
  processed with a note.
- **Server actions** (`app/deals/actions.ts`): create deal, add/update milestone,
  change deal/milestone status, **two-step sandbox authorization** (create order
  → store pending order + approval URL → confirm after buyer approval) or
  one-step simulated authorization, **submit evidence, review evidence
  (accept/reject), and record a human approval decision**. All input is validated
  server-side. The recommendation is always recomputed on the server from stored
  state (never taken from the client), the decision is gated by the pure approval
  rules (only `CAPTURE` or `VOID` may be approved; a `HOLD`/`DISPUTE`
  recommendation cannot be approved), and only an allowed approval invokes the
  payment provider. Reviewer and actor identity are fixed to `system` because
  authentication does not exist.
- **User-facing features**: dashboard with summary and deal list, new-deal form,
  and a deal detail page with agreement, milestones, acceptance criteria, status
  controls, an activity timeline, **evidence submission and history, a rules
  recommendation with reason codes, and a human approval/rejection panel**.
  Includes loading, empty, validation, error, and not-found states. Payment state
  is labeled explicitly: simulated authorizations are labeled simulated, sandbox
  authorizations are labeled as PayPal sandbox holds, and an order awaiting buyer
  approval is shown as pending (never as authorized).
- **Tests**: `npm test` runs `node --test` over `lib/**/*.test.ts`. Unit tests
  cover backend selection (JSON default / PostgreSQL opt-in, no-silent-fallback),
  import validation (payment-state consistency), and a schema contract guard that
  fails if a required table/constraint disappears from the migration SQL. The
  PayPal adapter is tested against a mocked transport: OAuth success/failure,
  malformed responses, approval URLs, confirmed refusals, ambiguous timeouts
  (`PENDING`), local validation, idempotency headers on every mutating call,
  token caching, webhook event mapping, and webhook signature verification
  (fails closed; infrastructure failures throw `WebhookVerificationError` so the
  endpoint can distinguish retryable `500` from permanent `400`). **PostgreSQL
  integration tests** (roundtrip, atomic approval, duplicate/concurrent
  rejection, rollback integrity, webhook idempotency key, and webhook
  reconciliation: pending-order resolution, duplicate/concurrent delivery,
  unknown-order and amount/currency-mismatch quarantines, void reconciliation,
  capture-without-approval quarantine, capture confirmation against an existing
  approval, retry-after-failure, and full-transaction rollback on transient
  failure) run only when `FAIRHOLD_TEST_DATABASE_URL` is set to an isolated
  database; otherwise they skip with a clear reason, so unit and integration
  coverage are never conflated. **Endpoint unit tests** cover the fail-closed
  matrix: unconfigured → 503, JSON backend → 503, missing headers → 400,
  oversized body → 413, malformed JSON / missing event id → 400, rejected
  signature → 400, verification outage → 500, processing failure → 500, and
  acknowledgement (200) for processed / duplicate / quarantined / unsupported
  outcomes.
- A separate PayPal **sandbox kill-test harness** under `scripts/` (a development
  probe; not part of the app runtime).
- Verification scripts: `npm run lint`, `npm run typecheck`, `npm run build`,
  `npm test`. All pass at this revision.

## What does not exist yet

- A call from the app to PayPal with real configured credentials (the kill-test
  harness is the only thing that has ever contacted PayPal). The sandbox adapter
  is wired and unit-tested, but an end-to-end run against the sandbox API
  requires real developer.paypal.com credentials, which are not committed here.
  No authorization, capture, settlement, or refund has occurred through the app.
- AI/model integration. The recommendation is produced by deterministic rules
  alone; no LLM judges whether work is complete.
- PostgreSQL is implemented and verified against a disposable container, but the
  integration suite still requires `FAIRHOLD_TEST_DATABASE_URL`; the default
  local flow keeps using the JSON dev store until `DATABASE_URL` is set. There is
  no hosted database, no replication, no backup strategy, and no production
  deployment.
- Authentication, sessions, or authorization. Server actions run as a `system`
  actor, so the app has **no access control** and is development-only. Submitted
  evidence is **not authenticated to a real user**, and uploaded files are stored
  on local disk without malware scanning.
- Dispute case management (there are `Disputed` states and reason codes, but no
  dispute workflow, messaging, or resolution process).
- A live PayPal webhook **delivery** end to end: the endpoint, signature
  verification, and reconciliation are implemented and verified against a
  disposable PostgreSQL (including a genuine signature-verification postback
  contract test with mocked transport), but no genuine Sandbox webhook event has
  been received from PayPal and reconciled against the live sandbox. That
  requires real developer.paypal.com credentials, a public/tunneled HTTPS
  listener URL (PayPal delivers only to HTTPS 443), and a real Sandbox buyer
  event — so live webhook verification is **not** claimed to work yet. The
  documented retry/quarantine behavior is implemented; real delivery cadence
  (up to 25 retries over 3 days) is PayPal's to honor.
- CI or deployment configuration.

## Rules of evidence

Claims in this folder must be traceable to code, configuration, or a recorded
verification run. Planned work stays listed here as planned; it is never
rewritten as done.
