# FairHold MVP decisions

- AI proposes; deterministic rules decide; humans approve; PayPal executes.
- PayPal authorization is a provider hold, never escrow, settlement, or guarantee.
- Demo payments remain explicitly labeled and must never make real provider requests.
- PostgreSQL is opt-in and must fail loudly when configured but unavailable.
- Authentication and authorization must be enforced server-side even in demo mode.
- No deal, payment or evidence mutation should trust a client-controlled identity.
- Documentation status may describe intent only when implementation evidence is absent.
- Demo authentication is not production authentication; reviewer identities
  require both an environment allowlist and explicit deal grants.
- PayPal calls receive a durable operation intent and stable idempotency key
  before network execution; ambiguous outcomes remain PENDING until reconciled.
- Capture reservations include completed captures and outstanding RESERVED/PENDING
  operations; PostgreSQL serializes allocation with deal/authorization locks.
- Capture webhooks must match the operation's PayPal invoice/idempotency correlation
  and validate deal, milestone, currency and amount before completion.
