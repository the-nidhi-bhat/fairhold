-- Authorization expiry, when the payment provider reports one.
--
-- The value comes from the provider (PayPal's `expiration_time`); it is never
-- estimated by the application. A NULL column means "the provider did not tell
-- us", and the UI must not display an expiry in that case.
ALTER TABLE payment_authorizations
  ADD COLUMN IF NOT EXISTS expires_at timestamptz;
