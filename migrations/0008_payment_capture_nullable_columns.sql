-- FairHold migration 0008: nullable deal_id/milestone_id/authorization_reference on payment_captures.
--
-- payment_captures previously required deal_id, milestone_id, and
-- authorization_reference to be NOT NULL. This assumed every provider
-- capture could be correlated to a human-approved milestone via an
-- invoice_id on the webhook event.
--
-- A capture_completed webhook may arrive without an invoice_id (for example
-- if the capture was initiated outside FairHold, or the invoice_id was
-- stripped). In that case there is no matching human approval and no way to
-- determine the deal/milestone from the event alone. The capture is still a
-- genuine provider-confirmed financial fact and must be durably accounted
-- for. It is recorded with NULL deal_id/milestone_id/authorization_reference
-- and flagged as a reconciliation exception in the audit trail.
--
-- Making these columns nullable does not weaken any existing invariant:
-- captures that DO have a deal/milestone/authorization continue to be stored
-- with those values. Only orphan captures (reconciliation exceptions) have
-- NULLs, and they are clearly visible in the audit trail.
ALTER TABLE payment_captures
  ALTER COLUMN deal_id DROP NOT NULL;

ALTER TABLE payment_captures
  ALTER COLUMN milestone_id DROP NOT NULL;

ALTER TABLE payment_captures
  ALTER COLUMN authorization_reference DROP NOT NULL;
