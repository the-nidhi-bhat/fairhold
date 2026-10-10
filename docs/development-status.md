# Development status

Last updated: Phase 3A (PayPal sandbox provider boundary).

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
- **Development-only persistence** (`lib/data`): deals are stored as a JSON file
  at `.data/fairhold.json` and submitted evidence files are written under
  `.data/evidence/` (both git-ignored). This is demo storage, not a database. It
  is single-instance and guarded only by an in-process write lock.
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
- **Tests**: `npm test` runs `node --test` over `lib/**/*.test.ts` — 71 tests.
  The PayPal adapter is tested against a mocked transport: OAuth success/failure,
  malformed responses, approval URLs, confirmed refusals, ambiguous timeouts
  (`PENDING`), local validation, idempotency headers on every mutating call,
  token caching, webhook event mapping, and webhook signature verification
  (fails closed).
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
- PostgreSQL schema, migrations, or production data access.
- Authentication, sessions, or authorization. Server actions run as a `system`
  actor, so the app has **no access control** and is development-only. Submitted
  evidence is **not authenticated to a real user**, and uploaded files are stored
  on local disk without malware scanning.
- Dispute case management (there are `Disputed` states and reason codes, but no
  dispute workflow, messaging, or resolution process).
- PayPal webhooks and payment-state reconciliation: webhook **signature
  verification** and **event mapping** are implemented and unit-tested, but the
  webhook HTTP endpoint and persisted event-id deduplication are deferred until
  the database exists.
- CI or deployment configuration.

## Rules of evidence

Claims in this folder must be traceable to code, configuration, or a recorded
verification run. Planned work stays listed here as planned; it is never
rewritten as done.
