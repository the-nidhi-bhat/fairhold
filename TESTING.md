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
npm test   (FAIRHOLD_TEST_DATABASE_URL pointing at an isolated PostgreSQL 16)
tests 172   pass 172   fail 0   skipped 0   cancelled 0   todo 0
duration ~20.0s
```

```
npm test   (no test database)
tests 172   pass 148   fail 0   skipped 24
```

The 24 skipped tests are exactly the PostgreSQL suites. Nothing is skipped to make the run green.

## Browser journeys

```bash
npm run test:e2e
```

Playwright starts its own dev server on port 3100 (reusing one already running), with demo allowlists injected through the config:

- `FAIRHOLD_DEMO_BUYERS=Alex Buyer`
- `FAIRHOLD_DEMO_SELLERS=Jamie Seller`
- `FAIRHOLD_DEMO_REVIEWERS=Morgan Reviewer`

Projects: `desktop-chromium`, `mobile-chromium` (Pixel 5), `tablet-chromium` (iPad gen 7). Each journey resets the demo store first via `scripts/demo-reset.mjs`.

### The three journeys

1. **Full milestone lifecycle.** Sign in as seller → submit evidence with a file → download it and byte-compare the content → sign in as buyer → reject with a revision note → seller resubmits → buyer accepts → simulated authorization → simulated capture → attempt a second capture and confirm it is blocked.
2. **Access control.** A non-participant is refused the deal and its evidence; a reviewer without a grant is refused; a granted reviewer is allowed.
3. **Deal creation and milestone authoring.** Create a deal, add milestones with amounts and due dates, verify validation failures, verify the deal detail renders the persisted state.

### Verified result

```
npx playwright test   → 9 passed (5.5m)
```

### Timeouts

`playwright.config.ts` sets `timeout: 90_000` and `expect: { timeout: 10_000 }`. The default 30 s was too short on this checkout: the dev server compiles routes on demand, and the checkout lives on a synchronised OneDrive folder, which makes first-hit compilation slow. The long lifecycle journey legitimately needs roughly 53 s wall-clock. Raising the timeout changed no assertion — every failure observed at 30 s was a timeout, never a mismatch, and the same assertions pass at 90 s.

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
| Live AI provider calls | No `AI_API_KEY` | Only deterministic fallbacks and schema validation are exercised. |
| Firefox and WebKit | Not installed in this environment | Browser coverage is Chromium only, at three viewport profiles. |
| Automated accessibility audit | No axe/Lighthouse wired in | Keyboard, focus and contrast checked manually; see [QA_REPORT.md](./QA_REPORT.md). |
| Load, concurrency beyond the ledger tests, and chaos | Out of scope | Concurrent capture protection is asserted at the ledger level only. |
| Physical devices | Not tested | Mobile and tablet results come from Chromium device emulation. |

## Adding tests

- Put a test next to its subject: `lib/domain/rules.ts` → `lib/domain/rules.test.ts`.
- Prefer the pure functions (`rules`, `approval`, `capture-state`, `status`, `validation`, `evidence`) — they are the authority layer.
- Any integration test that touches PostgreSQL must use `FAIRHOLD_TEST_DATABASE_URL` and clean up its own rows.
- Do not weaken an assertion to obtain a green run. If behaviour is wrong, fix the behaviour.
