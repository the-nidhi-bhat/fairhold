# Database

FairHold has two interchangeable persistence backends behind one facade (`lib/data/index.ts`):

| Backend | Selected when | Use |
| --- | --- | --- |
| PostgreSQL 16 | `DATABASE_URL` is set and not a placeholder | Tests, webhooks, any multi-user or production use |
| JSON file (`.data/fairhold.json`) | `DATABASE_URL` unset | Local demo and Playwright journeys |

Selection happens once per process. There is **no silent fallback**: once `DATABASE_URL` is present, every call goes to PostgreSQL and infrastructure errors surface instead of quietly writing to a local file.

## Entity relationship

```mermaid
erDiagram
    deals ||--o{ milestones : contains
    deals ||--o{ evidence : records
    deals ||--o{ audit_events : appends
    deals ||--o{ payment_orders : creates
    deals ||--o{ payment_captures : books
    deals ||--o{ payment_operations : reserves
    milestones ||--o{ evidence : "submitted against"
    milestones ||--o{ milestone_approvals : "decided by"
    milestones ||--o{ payment_captures : "captured for"
    milestones ||--o{ payment_operations : "reserved for"
    payment_orders ||--o{ payment_authorizations : authorizes
    payment_authorizations ||--o{ payment_captures : captures
```

## Tables

### `deals`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | uuid PK | Client-generated UUID. |
| `title` | text | 3–120 characters, validated in the domain layer. |
| `client_name`, `freelancer_name` | text | Buyer and seller display names; the authorisation key for the demo session. |
| `currency` | text | `NOT NULL DEFAULT 'USD'` with `CHECK (currency = 'USD')`. |
| `status` | text | Constrained to the nine deal states. |
| `agreement` | text | The written agreement. |
| `authorization_*` | text/bigint | Provider name, reference, amount, currency, simulated flag. |
| `pending_authorization_*` | text/bigint | Sandbox order awaiting buyer approval. |
| `updated_at` | timestamptz | Indexed descending for dashboard ordering. |

### `milestones`

`id` (uuid PK), `deal_id`, `title`, `description`, `amount_cents` (`CHECK > 0`), `due_date`, `status` (constrained), `acceptance_criteria`, ordering fields. Indexed on `deal_id`.

### `evidence`

`id` (uuid PK), `deal_id`, `milestone_id`, `note`, `url`, `file_name`, `file_size` (`CHECK NULL OR >= 0`), `file_type`, `file_stored_path`, `decision` (`DEFAULT 'pending'`, constrained to `pending | accepted | rejected`), `review_note`, timestamps.

```sql
CONSTRAINT evidence_has_content CHECK (
  note <> '' OR url IS NOT NULL OR file_stored_path IS NOT NULL
)
```

An evidence row can never exist with no content. If no matching row is found, `lib/data/postgres/deals.ts` raises an error during upload rather than silently dropping the submission.

### `milestone_approvals`

One row per human decision per milestone attempt: `decision` (`approve | reject`), `action` (`CAPTURE | VOID | NONE`), `reason_codes`, `explanation`, `evidence_fingerprint`, `evidence_reviewed_count` (`CHECK >= 0`), `reviewed_by`, `reviewed_at`, `provider_reference`, `provider_name`, `simulated`, `payment_status`, `note`.

The `evidence_fingerprint` and `evidence_reviewed_count` columns are what make staleness detectable: if new evidence arrives after an approval, the stored fingerprint no longer matches and the recommendation recomputes rather than trusting the old decision.

### `audit_events`

Append-only: `deal_id`, `created_at`, `actor`, `type`, `message`, `payload` (jsonb). Indexed on `(deal_id, created_at)`. The application never updates or deletes these rows.

### `payment_orders`, `payment_authorizations`, `payment_captures`

Provider-facing records. `payment_orders.mode` is constrained to `demo | sandbox | live` (live is refused at configuration time). `payment_captures.status` is constrained to `COMPLETED | VOIDED | PENDING | FAILED` and indexed on `(deal_id, milestone_id)`.

### `payment_operations`

The reservation and idempotency ledger added in `0004_payment_operations.sql`.

| Column | Notes |
| --- | --- |
| `id` | uuid PK |
| `deal_id`, `milestone_id` | Indexed separately. |
| `action` | `CAPTURE \| VOID \| AUTHORIZE`. |
| `requested_amount_cents` | `CHECK NULL OR >= 0`. |
| `status` | `RESERVED \| COMPLETED \| VOIDED \| PENDING \| FAILED`. |
| `idempotency_key` | Unique. |
| `provider_name`, `provider_reference` | Indexed together; unique invoice index prevents double booking. |

### `webhook_events`

A durable inbox: `id bigserial`, `event_id`, `event_type`, `status` (`received | processing | processed | failed`), `attempts` (`CHECK >= 0`), `reason`, `received_at`, payload. Indexed on `(status, received_at)`.

## Migrations

Forward-only SQL files applied in lexical order. There is no down migration; a change ships as a new file.

| File | Adds |
| --- | --- |
| `0001_initial.sql` | All base tables, constraints and indexes. |
| `0002_authorization_status.sql` | `payment_authorizations.status` CHECK including `AUTHORIZED` and `VOIDED`. |
| `0003_approval_payment_status.sql` | `milestone_approvals.payment_status` CHECK. |
| `0004_payment_operations.sql` | The operations ledger plus its indexes. |

Apply with:

```bash
npm run db:migrate
```

`scripts/db-migrate.mjs` runs the same code path as the tests (`lib/data/postgres/migrate.ts`), so what you apply locally is what CI applies.

## Constraints that carry business meaning

| Constraint | Prevents |
| --- | --- |
| `deals.currency = 'USD'` | A currency the adapter and ledger were never designed to split. |
| `milestones.amount_cents > 0` | Zero-amount milestones that would make capture planning meaningless. |
| `evidence_has_content` | Empty evidence submissions that could be "accepted". |
| `payment_captures.status IN (...)` | A typo becoming a new payment state. |
| `payment_operations(provider_name, provider_reference)` unique | The same provider fact booked twice. |
| `payment_operations` unique invoice index | Duplicate invoice ids across operations. |

## Transaction boundaries

- **Reserve then call.** `beginPaymentOperation` commits the `RESERVED` row before the provider request. The reservation is what serialises concurrent approvals; the authorised amount is re-checked inside the write (`completed + allocated + requested <= authorizationCents`).
- **Provider result persisted separately.** `updatePaymentOperation` writes the outcome after the call. A crash leaves `RESERVED`/`PENDING`, never a silent success.
- **Approval written last.** `recordMilestoneApproval` runs only after the ledger reflects a real outcome, so an approval cannot claim a capture that did not happen.
- **Webhook inbox.** Claim row → process → mark `processed`, or mark `failed` with a sanitised quarantine reason. Quarantine is committed and answered `2xx` so PayPal stops retrying an event that can never match.

## Integration testing

Integration tests use an isolated database. Set `FAIRHOLD_TEST_DATABASE_URL` to a dedicated database (never a development or production one):

```bash
FAIRHOLD_TEST_DATABASE_URL=postgresql://user:password@127.0.0.1:55432/fairhold_test npm test
```

Without it, the PostgreSQL suites skip and report as skipped rather than passing. See [TESTING.md](./TESTING.md).

## Operational notes

- The JSON store is single-process, guarded by an in-process write queue, and lost on redeploy for ephemeral hosts. It is a demo convenience, not a deployment target.
- Evidence files are written to disk and referenced by `stored_path`. A database backup without the storage directory is incomplete.
- `webhook_events` is the reconciliation inbox: filter on `status = 'failed'` and read `reason` to find quarantined events.
- `payment_operations` with `status = 'PENDING'` are the reconciliation queue for ambiguous provider outcomes.
