# Testing

Three suites, one purpose: prove the milestone, evidence and payment lifecycles cannot silently do the wrong thing.

| Suite | Command | Runner | Scope |
| --- | --- | --- | --- |
| Unit + integration | `npm test` | `node --test` | Domain rules, validation, auth, sessions, payments, data layer, webhook processing |
| Browser journeys | `npm run test:e2e` | Playwright | Real UI flows in desktop, mobile and tablet Chromium |
| Static | `npm run typecheck`, `npm run lint`, `npm run build` | `tsc`, `eslint`, `next build` | Types, lint, production compilation |

## Unit and integration tests

Test files sit beside the code they cover (`lib/**/*.test.ts`). The runner is Node's built-in test runner, so no additional framework is installed.

```bash
npm test
```

Without `FAIRHOLD_TEST_DATABASE_URL`, the PostgreSQL integration suites **skip** rather than pass. That is deliberate: a skipped suite must never look like a green one.

```bash
export FAIRHOLD_TEST_DATABASE_URL=postgresql://fairhold:<local-only-password>@127.0.0.1:55432/fairhold_test
npm test
```

### Coverage by area

| Area | What is asserted |
| --- | --- |
| `lib/domain/rules` | Recommendation order: already processed → cancelled deal/milestone → disputed → unresolved rejection → not authorized → missing evidence → pending review → deadline passed → capture. Evidence fingerprint and staleness. |
| `lib/domain/approval` | A rejection is always allowed and never triggers a payment action; approving a `HOLD` or `DISPUTE` is refused. |
| `lib/domain/status` | Deal and milestone transition tables; `Authorized` is excluded from manual transitions; progress arithmetic. |
| `lib/domain/validation` | Every field limit, amount parsing (`90`, `90.5`, `$1,200.00`), date round-trip, USD pinning. |
| `lib/domain/evidence` | Extension allowlist, 3 MB cap, magic-number sniffing, text heuristic, filename sanitisation, URL scheme allowlist. |
| `lib/auth/*` | Cookie signing and tamper rejection, expiry, allowlist re-check on read, reviewer grant parsing on the last colon, production secret requirement. |
| `lib/payments/capture-state` | Remaining-authorization arithmetic, over-capture refusal, `finalCapture` only at exact remainder, invalid amounts. |
| `lib/payments/config` | Sandbox activation only for `PAYPAL_ENV=sandbox` with non-placeholder credentials. |
| `lib/payments/paypal` | Capture outcome classification (completed-with-id vs pending vs failed), request ids, timeout and network → pending, void semantics, webhook normalisation. |
| `lib/payments/webhook-endpoint` | Status-code table: 503 config, 503 non-PostgreSQL, 400 body/headers/JSON, 413 oversize, 400 invalid signature, 500 verification error, 500 processing error, 200 accepted. |
| `lib/data/payment-operations` | Reservation idempotency, over-allocation refusal, `updatePaymentOperation` no-ops on terminal states and refuses to resurrect `FAILED`. |
| `lib/data/postgres/*.integration.test.ts` | Real PostgreSQL: migrations, schema contract, deal/milestone/evidence persistence, approval recording, capture ledger, webhook inbox claim/process/mark, duplicate delivery, quarantine reasons. |
| `lib/ai/advisory` | Deterministic fallbacks, schema parsers, clamping, fallback on non-2xx/timeout/bad JSON. |

### Verified result

```
$env:FAIRHOLD_SESSION_SECRET="fairhold-test-session-secret"   # required, no fallback
npm test

tests 239   pass 215   fail 0   skipped 24   cancelled 0   todo 0
exit code 0
```

The 24 skips are the PostgreSQL integration suites (`lib/data/postgres/*.integration.test.ts`). They skip when `FAIRHOLD_TEST_DATABASE_URL` is not set, and run for real when it is. Nothing is skipped to make a run green.

## Browser journeys

```bash
npm run test:e2e          # node scripts/run-e2e.mjs: build, then each project
node scripts/run-e2e.mjs --skip-build                      # reuse the last build
node scripts/run-e2e.mjs --project=tablet-chromium         # one project only
```

`scripts/run-e2e.mjs` runs `next build` once and then executes one Playwright
project at a time. Two reasons, both measured on the reference machine:

- **Production build, not `next dev`.** With on-demand compilation a route compile
  on a contended machine can stall a server-action round trip for minutes, which
  is indistinguishable from an application hang. `next start` serves prebuilt
  routes, so the suite exercises the artifact that ships and no assertion depends
  on compile timing. A failed build aborts the run before any test starts.
- **One server at a time.** A single `playwright test` invocation boots every
  configured webServer up front. Three Next servers plus browsers do not fit in
  this machine's free RAM (~1–2 GB of 16 GB), and the server that loses that race
  stalls. Sequential runs keep full isolation — own port, own data directory, own
  reset fixture — while capping peak usage at one server. Playwright tears each
  server down before the next project starts.

### Isolation

| Project | Port | Data directory | Viewport |
| --- | --- | --- | --- |
| `desktop-chromium` | 3100 | `%TEMP%\fairhold-e2e\desktop` | Desktop Chrome |
| `mobile-chromium` | 3101 | `%TEMP%\fairhold-e2e\mobile` | Pixel 5 |
| `tablet-chromium` | 3102 | `%TEMP%\fairhold-e2e\tablet` | 810×1080, DPR 2, touch |

Each project's server is started with `FAIRHOLD_DATA_DIR` pointing at that
directory, and `tests/evidence-lifecycle.spec.ts` reads the same value back from
`testInfo.project.use` before running `scripts/reset-test-data.mjs`, so the reset
and the server can never disagree. The store lives outside the repository so a
synchronised OneDrive checkout does not re-upload writes mid-run.

The tablet project deliberately does **not** use `devices["iPad (gen 7)"]`. That
descriptor injects an iOS Safari user agent, and Next's client router then takes
Safari-specific code paths even though the engine is Chromium, producing
deterministic `due to access control checks` fetch failures and a bounce to
`/login` on that project only. The project therefore runs a Chromium user agent
at tablet geometry.

### Backend selection for E2E

The test servers get `DATABASE_URL: ""` (an empty value means "no database
configured", so the normal selection rule picks the JSON store) plus
`FAIRHOLD_DATA_BACKEND=json`. The explicit pin is the non-production escape hatch
in `lib/data/db.ts`; it exists for running the specs against `next dev`, where a
developer's `.env.local` `DATABASE_URL` would otherwise be picked up. `next start`
runs as production and ignores the pin — which is why `DATABASE_URL` is blanked
as well. Neither path touches the real database configuration, and neither
invokes PostgreSQL.

Demo allowlists are injected through the config, never through a committed file:

- `FAIRHOLD_DEMO_BUYERS=Alex Buyer`
- `FAIRHOLD_DEMO_SELLERS=Jamie Seller`
- `FAIRHOLD_DEMO_REVIEWERS=Morgan Reviewer`

### What the 20 tests cover (per project)

| Spec | Tests | Coverage |
| --- | --- | --- |
| `tests/audit-screenshots.spec.ts` | 10 | Landing, login, demo and buyer dashboard render at desktop, mobile and tablet widths; all three demo roles can sign in; screenshots written to `audit-shots/` (gitignored). |
| `tests/deal-creation-repro.spec.ts` | 1 | Buyer creates a deal through the form — regression for the read-only-filesystem 500 on Preview. |
| `tests/demo.spec.ts` | 5 | Guided demo lifecycle and money summary; reviewer cannot approve or review evidence; requesting changes requires a reason; state survives reload and resets on demand; no horizontal scrolling. |
| `tests/evidence-lifecycle.spec.ts` | 3 | Full lifecycle: seller submits evidence with a file → buyer downloads and byte-compares → revision request → resubmission → acceptance → simulated authorization → simulated capture → second capture blocked. Access control: non-participant, ungranted reviewer and granted reviewer. Deal creation, milestone authoring, "Costs and limits", dashboard search and filtered empty state. |
| `tests/progressive-enhancement.spec.ts` | 1 | With client JavaScript disabled, the sign-in form still posts and authenticates (`/dashboard`). The Suspense-streamed dashboard body needs hydration — a documented limit, not a regression. |

### Verified result

```
npm run test:e2e

Production build:            passed
Playwright: desktop-chromium: 20 passed
Playwright: mobile-chromium:  20 passed
Playwright: tablet-chromium:  20 passed
exit code 0
```

Run twice back to back after the final fixes: 60/60 both times, exit code 0,
~2 min 20 s per full run (build ~14 s). No retries, no skipped tests, no sleeps.

### Timeouts and interaction settings

`playwright.config.ts` sets `timeout: 120_000` and `expect: { timeout: 10_000 }`
so a genuinely hung request fails instead of running forever; every assertion
keeps its own expect timeout. `reducedMotion: "reduce"` is applied to all
projects: `globals.css` disables smooth scrolling and entrance animations under
`prefers-reduced-motion`, so clicks are not racing a moving target and the suite
also covers the path real reduced-motion users get.

## Static checks

```bash
npm run typecheck    # next typegen && tsc --noEmit
npm run lint         # eslint
npm run build        # next build (Turbopack)
```

All three pass. The build emits these routes:

```
◐ /
◐ /_not-found
ƒ /api/evidence/[dealId]/[evidenceId]
ƒ /api/paypal/webhook
◐ /dashboard
◐ /deals/[id]
◐ /deals/new
ƒ /login
```

`◐` marks prerendered shells with dynamic holes; `ƒ` marks fully dynamic handlers.

## What is *not* covered

| Gap | Why | Consequence |
| --- | --- | --- |
| Live PayPal sandbox transactions | No sandbox credentials or webhook id configured | Authorization, capture, void and webhook delivery are verified against the adapter contract and injected transports, not against PayPal. Do not claim otherwise. |
| Live AI provider calls | No `GEMINI_API_KEY` | Only deterministic fallbacks and schema validation are exercised. |
| Firefox and WebKit | Not installed in this environment | Browser coverage is Chromium only, at three viewport profiles. |
| Automated accessibility audit | No axe/Lighthouse wired in | Keyboard, focus and contrast checked manually; see [QA_REPORT.md](./QA_REPORT.md). |
| Load, concurrency beyond the ledger tests, and chaos | Out of scope | Concurrent capture protection is asserted at the ledger level only. |
| Physical devices | Not tested | Mobile and tablet results come from Chromium device emulation. |

## Adding tests

- Put a test next to its subject: `lib/domain/rules.ts` → `lib/domain/rules.test.ts`.
- Prefer the pure functions (`rules`, `approval`, `capture-state`, `status`, `validation`, `evidence`) — they are the authority layer.
- Any integration test that touches PostgreSQL must use `FAIRHOLD_TEST_DATABASE_URL` and clean up its own rows.
- Do not weaken an assertion to obtain a green run. If behaviour is wrong, fix the behaviour.
