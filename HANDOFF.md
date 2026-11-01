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
