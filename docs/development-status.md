# Development status

Last updated: Phase 3 (Evidence, rules engine & human approval).

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
  with `createAuthorizationHold`, `captureAuthorization`, and
  `voidAuthorization`, and a demo implementation that makes **no network calls**
  and records simulated operations only. The demo provider rejects invalid input
  (non-positive capture amounts, a void without an authorization reference). No
  real PayPal call is made by the app. Capture and void are distinct operations;
  void is **not** a refund, and no refund is modeled.
- **Server actions** (`app/deals/actions.ts`): create deal, add/update milestone,
  change deal/milestone status, simulated authorization, **submit evidence,
  review evidence (accept/reject), and record a human approval decision**. All
  input is validated server-side. The recommendation is always recomputed on the
  server from stored state (never taken from the client), the decision is gated
  by the pure approval rules (only `CAPTURE` or `VOID` may be approved; a
  `HOLD`/`DISPUTE` recommendation cannot be approved), and only an allowed
  approval invokes the payment provider. Reviewer and actor identity are fixed to
  `system` because authentication does not exist.
- **User-facing features**: dashboard with summary and deal list, new-deal form,
  and a deal detail page with agreement, milestones, acceptance criteria, status
  controls, an activity timeline, **evidence submission and history, a rules
  recommendation with reason codes, and a human approval/rejection panel**.
  Includes loading, empty, validation, error, and not-found states. Simulated
  payment actions are labelled as simulated in the UI.
- **Tests**: `npm test` runs `node --test` over `lib/**/*.test.ts` — 47 tests.
- A separate PayPal **sandbox kill-test harness** under `scripts/` (a development
  probe; not part of the app runtime).
- Verification scripts: `npm run lint`, `npm run typecheck`, `npm run build`,
  `npm test`. All pass at this revision.

## What does not exist yet

- Real PayPal integration inside the application (the app uses the demo payment
  provider; only the throwaway kill-test script calls PayPal). No authorization,
  capture, settlement, or refund has occurred at PayPal.
- AI/model integration. The recommendation is produced by deterministic rules
  alone; no LLM judges whether work is complete.
- PostgreSQL schema, migrations, or production data access.
- Authentication, sessions, or authorization. Server actions run as a `system`
  actor, so the app has **no access control** and is development-only. Submitted
  evidence is **not authenticated to a real user**, and uploaded files are stored
  on local disk without malware scanning.
- Dispute case management (there are `Disputed` states and reason codes, but no
  dispute workflow, messaging, or resolution process).
- PayPal webhooks and payment-state reconciliation.
- CI or deployment configuration.

## Rules of evidence

Claims in this folder must be traceable to code, configuration, or a recorded
verification run. Planned work stays listed here as planned; it is never
rewritten as done.
