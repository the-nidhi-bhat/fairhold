# FairHold sprint handoff

Last updated: 2026-11-01

## Current state

- Branch: `feat/deal-milestone-foundation`
- Head: `48ef93a` (`fix(db): correct PostgreSQL milestone and evidence persistence`)
- Previous UI commit reviewed: `68d9e92`
- Existing uncommitted PayPal changes remain in:
  - `lib/payments/paypal.test.ts`
  - `lib/payments/paypal.ts`
  - `lib/payments/provider.ts`

Canonical task files were added for this execution: `TASKS.md`,
`DECISIONS.md`, `QA_REPORT.md`, and `FAIRHOLD_STATE.md`.

## Authentication checkpoint

- Authentication commit: `8c7498665053ef24ffe16b57be7d77e5fdcc6921`
- Added signed, HTTP-only demo sessions and buyer/seller/reviewer roles.
- Dashboard and deal routes filter or deny deals server-side.
- Mutating deal actions require authentication and server-side role checks.
- Audit actors now identify the signed demo identity instead of `"system"`.
- Typecheck: passed.
- ESLint: passed.
- Production build: passed.
- Test suite: 148 total, 127 passed, 21 skipped, 0 failed.
- PostgreSQL integrations remain skipped because `FAIRHOLD_TEST_DATABASE_URL`
  is absent.
- Protected PayPal worktree files remain untouched by authentication commits.

## Independent review of commit 68d9e92

### Findings

1. The dashboard summary uses every key returned by `paymentStatusFor()`:
   `not_authorized`, `authorization_pending`, `authorization_simulated`,
   `authorization_sandbox`, and `no_payment`.
2. Corrected finding: commit `68d9e92` combined
   `authorization_simulated` and `no_payment` under “Other states”, which made a
   cancelled deal look like a simulated authorization and did not distinguish
   the categories.
3. The labels now distinguish all five states:
   - Not authorized
   - Buyer approval pending
   - PayPal sandbox authorized
   - Simulated authorized
   - No payment
4. Counts are derived directly from `paymentStatusFor(deal).key`, so each deal
   contributes exactly once to one category.
5. No `.data/fairhold.json` is present, so the JSON development store has zero
   deals; therefore every dashboard payment count is currently zero in the
   default development store unless another backend or persisted store supplies
   deals.

### Correction commit

- `3e555fd` separates `authorization_simulated` and `no_payment`.
- `1c9fbe0` routes dashboard aggregation through the exhaustive
  `PaymentStatusKey` summary and adds a test proving the category total equals
  the number of deals.

## Verification

- `npm run typecheck`: pass
- `npm run lint`: pass
- Complete test runner summary before final invariant coverage: 141 tests
  total, 121 passed, 20 skipped, 0 failed, 0 cancelled,
  0 todo.
- The 20 skipped tests require `FAIRHOLD_TEST_DATABASE_URL`.

## Final dashboard verification

- Dashboard correction commit: `1c9fbe0`
- `npm run typecheck`: pass
- `npm run lint`: pass
- Complete test runner summary: 142 tests, 122 passed, 0 failed, 20 skipped,
  0 cancelled, 0 todo.
- The 20 skipped PostgreSQL integration tests require
  `FAIRHOLD_TEST_DATABASE_URL`.
- The five `PaymentStatusKey` categories are represented once in
  `PaymentSummary`; `summarizePaymentStatuses()` throws if category totals do
  not equal the input deal count.
- Unit coverage verifies one representative deal in each category and a total
  of exactly five deals.

## Protected work

Do not stage, modify, revert, or commit the three pre-existing uncommitted PayPal
files unless the next owner explicitly takes responsibility for those changes.
The dashboard correction was committed separately and does not include them.

## PostgreSQL persistence verification

- Commit: `48ef93a`
- Corrected malformed milestone and evidence SQL placeholders.
- Replaced the nonexistent `deals.authorization_id` reference with an existence
  lookup on `payment_authorizations`.
- Preserved the deal currency when creating an authorization instead of hardcoding
  USD.
- Added `FOR UPDATE` locks to milestone and evidence mutation queries.
- Added integration coverage for milestone updates and evidence metadata.
- Added schema-contract regressions for placeholders, authorization columns,
  evidence columns, and row locking.
- `npm run typecheck`: pass
- `npm run lint`: pass
- Focused schema-contract suite: 10 passed, 0 failed, 0 skipped.
- Complete suite: 146 tests, 125 passed, 0 failed, 21 skipped, 0 cancelled.
- PostgreSQL integration tests did not execute because
  `FAIRHOLD_TEST_DATABASE_URL` was not set.
- Run them on Windows with an isolated PostgreSQL database:
  `$env:FAIRHOLD_TEST_DATABASE_URL="postgresql://user:password@localhost:5432/fairhold_test"`
- Then run:
  `npm test`
- PostgreSQL integration coverage is not reported as passing until an actual
  isolated test database runs those tests.

## Remaining database issues

- Live PostgreSQL integration execution still requires an isolated test database.
- The integration suite should be rerun after any PostgreSQL environment change.
- JSON and PostgreSQL consistency remains supported by domain-level unit coverage,
  but live PostgreSQL roundtrips still require the isolated database.

## Next task

Recommended next task: payment-safe buyer/seller flow hardening or final QA:

1. Run and repair the PostgreSQL integration suite against an isolated database.
2. Verify authorization and capture locking under real concurrency.
3. Then move to buyer/seller access control and MVP flow QA.

## MVP continuation checkpoint

- HEAD after verified continuation units: `a8c2c02`.
- Verified commits:
  - `248b9c4` hardened the protected PayPal sandbox adapter and its regressions.
  - `b712448` added advisory UI, payment-history UI, landing copy, demo notes,
    and responsive create-deal loading state.
  - `a8c2c02` surfaced milestone and evidence advisory in deal detail without
    granting AI payment authority.
- Authentication, deterministic rules, buyer/seller/reviewer server actions,
  PostgreSQL persistence corrections, PayPal adapter operations, webhook
  handling, AI parsing/fallback, and responsive core screens are implemented.
- Verification at this checkpoint:
  - `npm run typecheck`: passed.
  - `npm run lint`: passed.
  - `npm run build`: passed.
  - Tests: 152 total; 131 passed; 21 skipped; 0 failed.
- PostgreSQL integration execution remains blocked by the unset
  `FAIRHOLD_TEST_DATABASE_URL`.
- Live PayPal sandbox execution remains blocked by unavailable sandbox
  credentials and is not represented as passing.
- Browser automation was not available as an executed final verification
  environment.

## Remaining limitations and next recommended task

1. Execute PostgreSQL integrations with an isolated database using:
   `$env:FAIRHOLD_TEST_DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/fairhold_test"`
   then `npm test`.
2. Exercise live PayPal sandbox operations with sandbox credentials.
3. Run desktop/mobile browser smoke tests against the authenticated flows.
4. Perform final origin fetch, diff review, secret scan, and normal branch push.

## Payment Integrity Remediation 2 checkpoint

- Implemented provider-confirmed capture ledger persistence in the operation
  transaction, ambiguous network outcomes as PENDING, approval-gated webhook
  milestone completion, capture ownership quarantine, migration relationship
  preflight, and JSON-mode real-payment guards.
- Verification after the implementation:
  - `npm run typecheck`: passed.
  - `npm run lint`: passed.
  - `npm test`: 161 tests total, 140 passed, 21 skipped, 0 failed.
  - `npm run build`: passed.
- PostgreSQL integration: not run; `FAIRHOLD_TEST_DATABASE_URL` is unset.
- Live PayPal sandbox: not run.
- Remaining risks include cross-system PostgreSQL/PayPal crash uncertainty and
  unexecuted migration/concurrency/webhook integration tests. A confirmed
  PayPal result is conserved through the operation plus capture ledger design,
  while response-loss uncertainty must be reconciled from PayPal.

## Post-audit hardening checkpoint

- Authentication commit: `a75a9f1`
  - Buyer and seller demo names are allowlisted from server environment.
  - Reviewers require both a server allowlist entry and deal-specific grant in
    `FAIRHOLD_REVIEWER_DEALS`.
  - Signed sessions are rechecked against the server allowlist.
- Payment commit: `1e921a5`
  - Capture and void operations are durable before provider invocation.
  - Stable operation and provider request identities are reused for retries.
  - Capture amounts are limited to authorization remaining balance.
  - Webhook completion reconciles operations, ledger rows and milestone
    completion; duplicate provider captures remain protected by unique provider
    references.
  - Ambiguous/PENDING outcomes are persisted and are not treated as captures.
- Verification:
  - `npm run typecheck`: passed.
  - `npm run lint`: passed.
  - `npm run build`: passed.
  - Full unit suite: 157 tests, 136 passed, 21 skipped, 0 failed.
  - PostgreSQL integrations skipped: `FAIRHOLD_TEST_DATABASE_URL` was unset.
  - Live PayPal sandbox operations remain unverified.
- The protected PayPal worktree was preserved and was not committed.

## Critical integrity remediation

- Authentication commit: `1ee9538`.
  - Buyer and seller allowlists have no implicit identities.
  - Missing allowlists and malformed reviewer grants fail closed.
- Payment commit: `6a1838c`.
  - Migration `0004` now upgrades UUID identifiers and adds the milestone relationship.
  - Capture operations reserve capacity under PostgreSQL deal locks and JSON write locks.
  - Provider capture webhooks reconcile by operation invoice/idempotency correlation,
    and terminal completion cannot be regressed.
- Verification:
  - `npm run typecheck`: passed.
  - `npm run lint`: passed.
  - `npm test`: 160 total, 139 passed, 21 skipped, 0 failed.
  - `npm run build`: passed.
  - PostgreSQL integrations remain unverified because
    `FAIRHOLD_TEST_DATABASE_URL` is unset.
  - Live PayPal sandbox and browser verification remain unverified.
