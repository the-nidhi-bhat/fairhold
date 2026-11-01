CREATE TABLE IF NOT EXISTS payment_operations (
  id text PRIMARY KEY,
  deal_id text NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  milestone_id text,
  authorization_reference text,
  action text NOT NULL CHECK (action IN ('CAPTURE', 'VOID', 'AUTHORIZE')),
  requested_amount_cents bigint CHECK (requested_amount_cents IS NULL OR requested_amount_cents >= 0),
  currency text,
  idempotency_key text NOT NULL UNIQUE,
  provider_name text NOT NULL,
  provider_reference text,
  status text NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('COMPLETED', 'VOIDED', 'PENDING', 'FAILED')),
  final_capture boolean NOT NULL DEFAULT false,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS payment_operations_deal_idx ON payment_operations(deal_id);
