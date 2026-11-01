ALTER TABLE milestone_approvals
  ADD COLUMN payment_status text
  CHECK (payment_status IN ('COMPLETED', 'VOIDED', 'PENDING', 'FAILED'));
