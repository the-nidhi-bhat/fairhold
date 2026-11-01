# FairHold MVP decisions

- AI proposes; deterministic rules decide; humans approve; PayPal executes.
- PayPal authorization is a provider hold, never escrow, settlement, or guarantee.
- Demo payments remain explicitly labeled and must never make real provider requests.
- PostgreSQL is opt-in and must fail loudly when configured but unavailable.
- Authentication and authorization must be enforced server-side even in demo mode.
- No deal, payment or evidence mutation should trust a client-controlled identity.
- Documentation status may describe intent only when implementation evidence is absent.
