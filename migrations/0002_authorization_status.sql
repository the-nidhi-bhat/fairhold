-- FairHold migration 0002: authorization lifecycle status.
--
-- Phase 5 (webhook reconciliation) needs to record when PayPal tells us an
-- authorization hold has been VOIDED (manual void, or expiry after 29 days).
-- Previously authorization rows had no status column at all. Existing rows
-- were created only by markDealAuthorized() and therefore represent an
-- authorization PayPal had approved, so the DEFAULT 'AUTHORIZED' is correct
-- for pre-existing data.
--
-- The status column is informational lifecycle evidence from the provider.
-- Nothing in the app auto-cancels a deal or regresses milestones when a hold
-- is voided; humans decide what to do next (see lib/data/postgres/webhooks.ts).
ALTER TABLE payment_authorizations
  ADD COLUMN status text NOT NULL DEFAULT 'AUTHORIZED'
  CHECK (status IN ('AUTHORIZED', 'VOIDED'));