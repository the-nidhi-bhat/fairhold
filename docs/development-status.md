# Development status

Last updated: Phase 2 (Deal & Milestone foundation).

## What exists

- Git repository on branch `main`, connected to the project's GitHub remote.
- Next.js 16.4.0 application scaffold: App Router, TypeScript 5, Tailwind CSS 4,
  ESLint 9, npm as the single package manager.
- Root layout and landing page describing the concept and the AI/rules
  boundary.
- **Domain layer** (`lib/domain`): deal and milestone types, input validation,
  deterministic status-transition rules, progress and payment-status derivation.
  Pure and unit-tested.
- **Development-only persistence** (`lib/data`): deals are stored as a JSON file
  at `.data/fairhold.json` (git-ignored). This is demo storage, not a database.
  It is single-instance and guarded only by an in-process write lock.
- **Payment provider boundary** (`lib/payments`): a server-side adapter interface
  with a demo implementation that makes **no network calls** and records
  simulated authorizations only. No real PayPal call is made by the app.
- **Server actions** (`app/deals/actions.ts`): create deal, add/update milestone,
  change deal/milestone status, and simulated authorization. All input is
  validated server-side and transitions are re-checked against the rules; client
  values for payment status or amounts are never trusted.
- **User-facing features**: dashboard with summary and deal list, new-deal form,
  deal detail page with agreement, milestones, acceptance criteria, status
  controls, and an activity timeline. Includes loading, empty, validation,
  error, and not-found states.
- **Tests**: `npm test` runs `node --test` over `lib/**/*.test.ts` — 18 tests.
- A separate PayPal **sandbox kill-test harness** under `scripts/` (a development
  probe; not part of the app runtime).
- Verification scripts: `npm run lint`, `npm run typecheck`, `npm run build`,
  `npm test`. All pass at this revision.

## What does not exist yet

- Real PayPal integration inside the application (the app uses the demo payment
  provider; only the throwaway kill-test script calls PayPal).
- AI/model integration.
- PostgreSQL schema, migrations, or production data access.
- Authentication, sessions, or authorization. Server actions currently run as a
  `system` actor, so the app has **no access control** and is development-only.
- Evidence submission, the decision/rules engine, and dispute handling.
- PayPal webhooks and payment-state reconciliation.
- CI or deployment configuration.

## Rules of evidence

Claims in this folder must be traceable to code, configuration, or a recorded
verification run. Planned work stays listed here as planned; it is never
rewritten as done.
