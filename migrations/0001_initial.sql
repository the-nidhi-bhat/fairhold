-- FairHold initial schema.
--
-- Conventions:
--   * Amounts are integer cents in BIGINT (never floats).
--   * Currency is pinned to USD by CHECK until more currencies are supported.
--   * Statuses are TEXT with CHECK constraints listing the exact domain unions
--     (kept in sync with lib/domain/types.ts).
--   * Every deal mutation that touches more than one record (status change +
--     audit event, approval + audit + payment record, ...) must run inside a
--     single transaction in the application layer using SELECT ... FOR UPDATE
--     on the deal row. Unique constraints below are the database-level backstop
--     for idempotency and one-time transitions.
--   * Evidence file BYTES are NOT stored here. Only metadata plus a storage
--     key (file_stored_path) live in the database; bytes live on local disk in
--     development and must live in object storage in production (see
--     lib/data/storage.ts).
--   * webhook_events is an append-only inbox. The unique (provider, event_id)
--     constraint is what makes provider webhook processing idempotent; the
--     future webhook handler claims a row by updating its status.

CREATE TABLE deals (
  id              uuid PRIMARY KEY,
  title           text NOT NULL,
  agreement       text NOT NULL,
  client_name     text NOT NULL,
  freelancer_name text NOT NULL,
  currency        text NOT NULL DEFAULT 'USD' CHECK (currency = 'USD'),
  status          text NOT NULL CHECK (status IN (
    'Draft',
    'Awaiting Agreement',
    'Ready for Authorization',
    'Authorized',
    'In Progress',
    'Awaiting Review',
    'Completed',
    'Disputed',
    'Cancelled'
  )),
  created_at      timestamptz NOT NULL,
  updated_at      timestamptz NOT NULL
);

CREATE INDEX deals_updated_at_idx ON deals (updated_at DESC);

CREATE TABLE milestones (
  id                 uuid PRIMARY KEY,
  deal_id            uuid NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  title              text NOT NULL,
  description        text NOT NULL DEFAULT '',
  amount_cents       bigint NOT NULL CHECK (amount_cents > 0),
  due_date           date,
  acceptance_criteria text NOT NULL,
  status             text NOT NULL CHECK (status IN (
    'Draft',
    'In Progress',
    'Awaiting Review',
    'Completed',
    'Disputed',
    'Cancelled'
  )),
  created_at         timestamptz NOT NULL,
  updated_at         timestamptz NOT NULL
);

CREATE INDEX milestones_deal_id_idx ON milestones (deal_id);

CREATE TABLE evidence (
  id               uuid PRIMARY KEY,
  deal_id          uuid NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  milestone_id     uuid NOT NULL REFERENCES milestones(id) ON DELETE CASCADE,
  note             text NOT NULL DEFAULT '',
  url              text,
  file_name        text,
  file_size        bigint CHECK (file_size IS NULL OR file_size >= 0),
  file_type        text,
  file_stored_path text,
  submitted_by     text NOT NULL,
  submitted_at     timestamptz NOT NULL,
  decision         text NOT NULL DEFAULT 'pending' CHECK (decision IN ('pending', 'accepted', 'rejected')),
  reviewed_at      timestamptz,
  review_note      text,
  CONSTRAINT evidence_has_content CHECK (note <> '' OR url IS NOT NULL OR file_stored_path IS NOT NULL)
);

CREATE INDEX evidence_deal_milestone_idx ON evidence (deal_id, milestone_id);

-- One approval per milestone. The UNIQUE(milestone_id) constraint makes a
-- second approval decision fail at the database level.
CREATE TABLE milestone_approvals (
  id                     uuid PRIMARY KEY,
  milestone_id           uuid NOT NULL UNIQUE REFERENCES milestones(id) ON DELETE CASCADE,
  decision               text NOT NULL CHECK (decision IN ('approve', 'reject')),
  action                 text NOT NULL CHECK (action IN ('CAPTURE', 'VOID', 'NONE')),
  reason_codes           jsonb NOT NULL,
  explanation            text NOT NULL,
  evidence_fingerprint   text NOT NULL,
  evidence_reviewed_count integer NOT NULL CHECK (evidence_reviewed_count >= 0),
  reviewed_by            text NOT NULL,
  reviewed_at            timestamptz NOT NULL,
  provider_reference     text,
  provider_name          text,
  simulated              boolean NOT NULL DEFAULT false,
  note                   text
);

CREATE TABLE audit_events (
  id           uuid PRIMARY KEY,
  deal_id      uuid NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  milestone_id uuid REFERENCES milestones(id) ON DELETE SET NULL,
  type         text NOT NULL,
  message      text NOT NULL,
  actor        text NOT NULL,
  created_at   timestamptz NOT NULL,
  metadata     jsonb NOT NULL DEFAULT '{}'
);

CREATE INDEX audit_events_deal_created_idx ON audit_events (deal_id, created_at);

-- A provider order created but not yet authorized (PayPal sandbox buyer
-- approval step). No money has moved. At most one pending order per deal;
-- UNIQUE(deal_id) enforces that. The provider-level unique key makes retried
-- order creations idempotent for the same (provider, order) pair.
CREATE TABLE payment_orders (
  id                uuid PRIMARY KEY,
  deal_id           uuid NOT NULL UNIQUE REFERENCES deals(id) ON DELETE CASCADE,
  provider_name     text NOT NULL,
  mode              text NOT NULL CHECK (mode IN ('demo', 'sandbox', 'live')),
  provider_order_id text NOT NULL,
  approval_url      text,
  amount_cents      bigint NOT NULL CHECK (amount_cents > 0),
  currency          text NOT NULL CHECK (currency = 'USD'),
  created_at        timestamptz NOT NULL,
  CONSTRAINT payment_orders_provider_ref UNIQUE (provider_name, provider_order_id)
);

-- An authorization hold. At most one per deal (the current product model).
-- provider_reference is the provider authorization id used to capture/void.
CREATE TABLE payment_authorizations (
  id                 uuid PRIMARY KEY,
  deal_id            uuid NOT NULL UNIQUE REFERENCES deals(id) ON DELETE CASCADE,
  provider_name      text NOT NULL,
  provider_reference text NOT NULL,
  provider_order_id  text,
  simulated          boolean NOT NULL DEFAULT false,
  amount_cents       bigint NOT NULL CHECK (amount_cents > 0),
  currency           text NOT NULL CHECK (currency = 'USD'),
  created_at         timestamptz NOT NULL,
  CONSTRAINT payment_authorizations_provider_ref UNIQUE (provider_name, provider_reference)
);

-- Per-milestone capture/void outcomes. Webhook reconciliation updates
-- status/records here by matching provider_reference (capture id).
CREATE TABLE payment_captures (
  id                     uuid PRIMARY KEY,
  deal_id                uuid NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  milestone_id           uuid NOT NULL REFERENCES milestones(id) ON DELETE CASCADE,
  provider_name          text NOT NULL,
  provider_reference     text NOT NULL,
  authorization_reference text NOT NULL,
  amount_cents           bigint NOT NULL CHECK (amount_cents > 0),
  currency               text NOT NULL CHECK (currency = 'USD'),
  invoice_id             text,
  status                 text NOT NULL CHECK (status IN ('COMPLETED', 'VOIDED', 'PENDING', 'FAILED')),
  simulated              boolean NOT NULL DEFAULT false,
  created_at             timestamptz NOT NULL,
  CONSTRAINT payment_captures_provider_ref UNIQUE (provider_name, provider_reference)
);

CREATE INDEX payment_captures_deal_milestone_idx ON payment_captures (deal_id, milestone_id);

-- Append-only webhook inbox. The future webhook handler must:
--   1. verify the provider signature,
--   2. INSERT ... ON CONFLICT (provider, event_id) DO NOTHING and claim the
--      row (status received -> processing) atomically,
--   3. apply the event to payment_authorizations / payment_captures inside the
--      same transaction (SELECT ... FOR UPDATE on the affected rows),
--   4. mark the row processed, or failed with a sanitized error message.
-- A conflicting insert means the event was already received: a no-op reply.
CREATE TABLE webhook_events (
  id           bigserial PRIMARY KEY,
  provider     text NOT NULL,
  event_id     text NOT NULL,
  event_type   text NOT NULL,
  payload      jsonb NOT NULL,
  status       text NOT NULL DEFAULT 'received' CHECK (status IN ('received', 'processing', 'processed', 'failed')),
  attempts     integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  last_error   text,
  received_at  timestamptz NOT NULL,
  processed_at timestamptz,
  CONSTRAINT webhook_events_provider_event UNIQUE (provider, event_id)
);

CREATE INDEX webhook_events_status_idx ON webhook_events (status, received_at);