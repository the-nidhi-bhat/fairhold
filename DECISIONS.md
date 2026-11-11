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
- A provider-confirmed capture is persisted into the operation and capture ledger
  in one PostgreSQL transaction. Human approval remains a separate milestone
  workflow and cannot be inferred from provider evidence alone.
- Timeout and transport failures are PENDING/ambiguous, not FAILED; reservations
  are released only for definite provider rejection.
- Real PayPal actions require PostgreSQL-backed durable accounting and are
  unavailable in JSON mode. JSON/demo simulation remains available.
- Browser journeys run against a Playwright-managed dev server on a dedicated
  port (3100) so an unrelated or wedged server on 3000 cannot produce invalid
  evidence.
- The deal access guard runs in the page component before the streamed shell is
  returned. A not-found deal therefore renders the not-found UI even though the
  Partial Prerender response status is already 200.
- Evidence-download assertions verify the response status, attachment header
  and exact bytes instead of `suggestedFilename()`, because emulated Chromium
  ignores `Content-Disposition` for downloads.
- PostgreSQL integration tests use isolated per-file schemas plus a migration
  advisory lock, so the suite can run concurrently against one test database.
- Payment and evidence simulation stay clearly labeled. A passing test suite is
  not evidence of live PayPal sandbox execution.
- The public demo at `/demo` is browser-only on purpose: serverless filesystems
  are read-only and no hosted database exists, so a server-backed public demo
  would either lose writes or pretend to persist them. The demo reuses the real
  deterministic rules and labels every payment SIMULATED.
- Demo mode and real-user mode do not share storage: `/demo` keeps its state in
  `localStorage`; the operator app keeps its state in JSON or PostgreSQL.
- Amounts are integer cents end to end. Typed amounts are parsed directly to
  cents rather than going through a float. Display formatting never feeds the
  ledger.
- Vercel Deployment Protection is left enabled rather than removed to make the
  preview public. Weakening an access control to unblock a demo is not an
  acceptable trade; public access is an owner-side configuration decision.
- No production deployment is created while the production environment scope is
  empty. A preview that says what it is beats a production URL that silently
  fails writes.
- The launch video is silent by design because no TTS/music provider credential
  exists; on-screen copy plus SRT captions carry the narration.

## 2026-11-10 - E2E architecture decisions

- **The browser suite runs against a production build, one device project at a
  time** (`scripts/run-e2e.mjs`). Dev-mode on-demand compilation was the dominant
  source of nondeterminism here, and three concurrent dev servers exceed the
  available memory on this machine. Sequential runs keep full isolation (own
  port, own data directory, own reset fixture) with one server resident, and the
  suite now exercises the artifact that ships.
- **Tablet emulation uses a Chromium user agent at tablet geometry**, not
  `devices["iPad (gen 7)"]`. That descriptor's iOS Safari UA pushed Next's client
  router into Safari-only paths inside Chromium, which failed deterministically
  on tablet only. Viewport, DPR and touch are preserved, so the layout and
  interaction coverage is unchanged.
- **E2E backend selection is explicit and non-production**: the test servers set
  `DATABASE_URL: ""` and `FAIRHOLD_DATA_BACKEND=json`. The pin is honoured only
  when `NODE_ENV !== "production"`; deployed environments keep the existing
  "DATABASE_URL configured => PostgreSQL, errors propagate" rule. No silent JSON
  fallback exists in any environment.
- **Test data lives outside the repository** (`%TEMP%\fairhold-e2e\<device>`) so a
  synchronised OneDrive checkout cannot re-upload store writes mid-run.
