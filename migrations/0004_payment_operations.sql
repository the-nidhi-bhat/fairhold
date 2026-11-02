CREATE TABLE IF NOT EXISTS payment_operations (
  id uuid PRIMARY KEY,
  deal_id uuid NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  milestone_id uuid REFERENCES milestones(id) ON DELETE CASCADE,
  authorization_reference text,
  action text NOT NULL CHECK (action IN ('CAPTURE', 'VOID', 'AUTHORIZE')),
  requested_amount_cents bigint CHECK (requested_amount_cents IS NULL OR requested_amount_cents >= 0),
  currency text,
  idempotency_key text NOT NULL UNIQUE,
  provider_name text NOT NULL,
  provider_reference text,
  status text NOT NULL DEFAULT 'RESERVED'
    CHECK (status IN ('RESERVED', 'COMPLETED', 'VOIDED', 'PENDING', 'FAILED')),
  final_capture boolean NOT NULL DEFAULT false,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Compatibility for installations that created the original malformed migration.
DO $$
BEGIN
  ALTER TABLE payment_operations DROP CONSTRAINT IF EXISTS payment_operations_deal_id_fkey;
  ALTER TABLE payment_operations DROP CONSTRAINT IF EXISTS payment_operations_milestone_id_fkey;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'payment_operations' AND column_name = 'deal_id' AND data_type <> 'uuid'
  ) THEN
    ALTER TABLE payment_operations ALTER COLUMN deal_id TYPE uuid USING deal_id::uuid;
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'payment_operations' AND column_name = 'milestone_id' AND data_type <> 'uuid'
  ) THEN
    ALTER TABLE payment_operations ALTER COLUMN milestone_id TYPE uuid USING milestone_id::uuid;
  END IF;
EXCEPTION WHEN invalid_text_representation THEN
  RAISE EXCEPTION 'payment_operations contains a non-UUID id; existing rows were not discarded';
END
$$;

-- Preflight existing financial rows before adding relationship constraints.
DO $$
DECLARE inconsistent_count bigint;
BEGIN
 SELECT count(*) INTO inconsistent_count
 FROM payment_operations po
 JOIN milestones m ON m.id = po.milestone_id
 WHERE po.deal_id <> m.deal_id;
 IF inconsistent_count > 0 THEN
   RAISE EXCEPTION 'payment_operations preflight failed: % row(s) reference milestones belonging to another deal; no existing records were changed',
     inconsistent_count;
 END IF;
END
$$;

ALTER TABLE payment_operations DROP CONSTRAINT IF EXISTS payment_operations_status_check;
ALTER TABLE payment_operations ADD CONSTRAINT payment_operations_status_check
  CHECK (status IN ('RESERVED', 'COMPLETED', 'VOIDED', 'PENDING', 'FAILED'));
ALTER TABLE payment_operations
  ADD CONSTRAINT payment_operations_deal_id_fkey
  FOREIGN KEY (deal_id) REFERENCES deals(id) ON DELETE CASCADE;
ALTER TABLE payment_operations DROP CONSTRAINT IF EXISTS payment_operations_milestone_id_fkey;
ALTER TABLE payment_operations
  ADD CONSTRAINT payment_operations_milestone_id_fkey
  FOREIGN KEY (milestone_id) REFERENCES milestones(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS payment_operations_deal_idx ON payment_operations(deal_id);
CREATE INDEX IF NOT EXISTS payment_operations_milestone_idx ON payment_operations(milestone_id);
CREATE INDEX IF NOT EXISTS payment_operations_provider_reference_idx ON payment_operations(provider_name, provider_reference);
CREATE UNIQUE INDEX IF NOT EXISTS payment_operations_provider_invoice_idx
  ON payment_operations(provider_name, idempotency_key);

CREATE OR REPLACE FUNCTION payment_operations_validate_relationship()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.milestone_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM milestones m
    WHERE m.id = NEW.milestone_id AND m.deal_id = NEW.deal_id
  ) THEN
    RAISE EXCEPTION 'payment operation milestone must belong to its deal';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS payment_operations_validate_relationship ON payment_operations;
CREATE TRIGGER payment_operations_validate_relationship
BEFORE INSERT OR UPDATE OF deal_id, milestone_id ON payment_operations
FOR EACH ROW EXECUTE FUNCTION payment_operations_validate_relationship();
