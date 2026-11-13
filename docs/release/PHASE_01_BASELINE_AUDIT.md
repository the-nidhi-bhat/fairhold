# FairHold — Phase 1 Baseline Audit Report

**Repository:** https://github.com/the-nidhi-bhat/fairhold.git
**Branch:** `feat/deal-milestone-foundation`
**Local HEAD:** `5c7f8f63d8cc67666669b797cda5c87c32d04d01`
**Remote HEAD:** `5c7f8f6` (origin/feat/deal-milestone-foundation)
**Audit date:** Mon Nov 09 2026
**Phase status:** COMPLETE

> This is a read-only audit. No application code, migrations, configuration, environment files, or deployment settings were modified. No real PayPal transactions were run. No secrets were printed. Nothing was deployed.

---

## A. Executive summary

FairHold is a milestone-based payment coordination platform for buyers and sellers, built as a Next.js 16.4.3 / React 19.3.0 application with TypeScript, Tailwind 4, and an optional PostgreSQL backend.

**Core principle:** "AI proposes. Rules decide. Humans approve. PayPal executes. The audit trail records everything."

**Actual state:** The product implements a complete demo-capable milestone workflow: deal creation, milestone definition, evidence submission/review/revision, human approval, authorization holds, and simulated capture. The PayPal sandbox adapter exists as real code. At the time of this baseline audit it was **unverified live** — no sandbox credentials were configured, there was no public webhook endpoint and no `PAYPAL_WEBHOOK_ID`. **Corrected 2026-11-13:** PayPal **sandbox** credentials are now configured in the Production scope, so the signed-in workspace uses the sandbox provider (the live deal page renders "Create PayPal sandbox authorization"). The live sandbox *lifecycle* — order → buyer approval → capture → webhook — is still unverified, and `PAYPAL_WEBHOOK_ID` is still not confirmed. The AI advisory layer exists with structured output validation but runs as a **deterministic fallback** (no `GEMINI_API_KEY`/`GEMINI_MODEL` configured). The deployed preview is **not publicly accessible** (Vercel Deployment Protection returns 302 to SSO for anonymous visitors).

**Gate results (verified, current tree):**
- `npm run typecheck`: exit 0
- `npm run lint`: exit 0
- `npm test`: 193 tests, 193 pass, 0 fail, 0 skipped
- `npm run build`: exit 0, 10 routes incl. `/demo`
- `npx playwright test`: 27 passed (9 journeys × desktop/mobile/tablet Chromium)
- `npx hyperframes@0.8.171 check`: 0 errors, 53/53 text contrast WCAG AA

**Key blockers:**
1. No sandbox verification (no credentials/webhook).
2. No live AI verification (no key/model).
3. Public demo blocked by Deployment Protection (owner action).
4. `LICENSE` missing (owner decision).
5. Design-level limits documented but not patched: demo identity strength, ambiguous-capture reconciliation, webhook rate limiting, webhook payload retention.

---

## B. Architecture map

| Layer | Responsibility | Key files |
|---|---|---|
| Frontend | Pages, layouts, components, client navigation | `app/` (route handlers + pages), `components/` |
| Backend/API | Server actions, API routes, auth, payment actions | `app/deals/actions.ts`, `app/login/actions.ts`, `app/api/` |
| Domain/business rules | Deterministic milestone recommendation engine, status state machine, money math | `lib/domain/rules.ts`, `lib/domain/status.ts`, `lib/domain/money.ts` |
| Database | Two backends: JSON (demo default) and PostgreSQL | `lib/data/db.ts`, `lib/data/postgres/deals.ts`, `migrations/0001…0005.sql` |
| Payment integration | Sandbox adapter, demo provider, runtime selection, webhook endpoint | `lib/payments/paypal.ts`, `lib/payments/demo.ts`, `lib/payments/runtime.ts`, `lib/payments/webhook-endpoint.ts`, `lib/payments/config.ts` |
| AI integration | Structured advisory proposals (advisory-only, never authoritative) | `lib/ai/advisory.ts` |
| Authentication/authorization | Demo session cookie, allowlist login, deal-level access checks | `lib/auth/session.ts`, `lib/auth/session-token.ts`, `lib/auth/demo-allowlist.ts` |
| Demo environment | Browser-only guided demo, localStorage persistence, simulated payments | `app/demo/page.tsx`, `components/demo-experience.tsx`, `lib/demo/` |
| External services | PayPal sandbox API, optional AI provider, optional hosted PostgreSQL | n/a (configured via env) |
| Testing/CI | Unit tests (`node --test`), Playwright E2E, GitHub Actions with PostgreSQL service | `tests/`, `.github/workflows/ci.yml`, `playwright.config.ts` |

---

## C. Feature inventory

| Feature | Status | Source | Notes |
|---|---|---|---|
| Deal creation | VERIFIED IMPLEMENTED | `app/deals/actions.ts` | Buyer creates deal with client/freelancer names |
| Milestone creation | VERIFIED IMPLEMENTED | `app/deals/actions.ts` | Seller/reviewer only; buyer sees no form |
| Evidence submission | VERIFIED IMPLEMENTED | `app/api/evidence/[dealId]/[evidenceId]/route.ts` | Server-generated UUID names, magic-byte MIME |
| Evidence review | VERIFIED IMPLEMENTED | `app/deals/actions.ts` | Accepted / revision requested |
| Human approval | VERIFIED IMPLEMENTED | `app/deals/actions.ts` | `CAPTURE` requires recorded `recordMilestoneApproval` |
| Authorization hold | VERIFIED IMPLEMENTED (simulated) | `lib/payments/demo.ts` | No PayPal call; "hold, not escrow" |
| Capture | VERIFIED IMPLEMENTED (real adapter, unverified live) | `lib/payments/paypal.ts` | Real sandbox adapter code; no credentials |
| Payment ledger | VERIFIED IMPLEMENTED | `lib/data/postgres/payment-operations.ts` | Integer cents, idempotency keys |
| Webhook verification | VERIFIED IMPLEMENTED (code), UNVERIFIED live | `lib/payments/webhook-endpoint.ts` | Fails closed; no credentials to test |
| AI advisory | IMPLEMENTED (deterministic fallback live) | `lib/ai/advisory.ts` | Advisory-only; never changes deal state |
| Dashboard search/filters | VERIFIED IMPLEMENTED | `app/dashboard/page.tsx` | `?q=`, `?status=`, filtered empty state |
| Fee transparency | VERIFIED IMPLEMENTED | `app/deals/[id]/page.tsx` | "Costs and limits"; no platform fee in build |
| Money precision | VERIFIED IMPLEMENTED | `lib/domain/money.ts` | Integer cents, no float math |
| Demo mode | VERIFIED IMPLEMENTED | `app/demo/page.tsx` | Browser-only, localStorage, simulated, reset |
| Demo reset | VERIFIED IMPLEMENTED | `scripts/demo-reset.mjs` | |
| Role separation | VERIFIED IMPLEMENTED | `lib/auth/session.ts` `canAccessDeal` | Buyer/seller/reviewer boundaries |
| Notifications/attention chip | PARTIAL | `app/dashboard/page.tsx` | Attention count chip; no email/push |
| Disputes | PARTIAL | `lib/domain/rules.ts` | `Disputed` removed from payable states; no full arbitration |
| Refunds/reversals | MISSING | — | Not implemented |
| Monitoring | MISSING | — | No APM/metrics |
| Backups/restore | MISSING | — | No hosted DB |

---

## D. PayPal audit

**Finding: REAL PayPal sandbox adapter exists as code; live sandbox integration NOT VERIFIED.**

| Capability | Status | Evidence |
|---|---|---|
| Server-side credentials | IMPLEMENTED (config-gated) | `lib/payments/config.ts` `readPayPalConfig` |
| Sandbox env separation | IMPLEMENTED | `PAYPAL_ENV === 'sandbox'` only; never production |
| API authentication | IMPLEMENTED (code) | `lib/payments/paypal.ts` OAuth token cache + 60s margin |
| Order creation | IMPLEMENTED (code) | `lib/payments/paypal.ts` `createOrder` intent AUTHORIZE + `PayPal-Request-Id` |
| Buyer approval | IMPLEMENTED (code) | `authorizeOrder` + approval flow |
| Order retrieval | IMPLEMENTED (code) | `getOrder` |
| Amount/currency validation | IMPLEMENTED | Server-side integer cents; currency 3-letter |
| Capture execution | IMPLEMENTED (code) | `captureAuthorization`; COMPLETED only with capture id |
| Partial capture | MISSING | Not implemented |
| Remaining authorization | MISSING | Not implemented |
| Idempotency | IMPLEMENTED | `PayPal-Request-Id` / `invoice_id`; internal `capture:${dealId}:${milestoneId}` |
| Duplicate capture protection | IMPLEMENTED | `planCapture` cap at two layers; no blind retry on PENDING |
| Webhook signature verification | IMPLEMENTED (code) | `verify-webhook-signature`; fails closed |
| Webhook ID | NULLABLE | `webhookId` in config; not set without credentials |
| Replay/duplicate handling | IMPLEMENTED | `UNIQUE(provider,event_id)` dedupe |
| Reconciliation | PARTIAL | `reconcileCaptureCompleted` records evidence only (Finding 11 fixed) |
| Ambiguous failure handling | IMPLEMENTED | PENDING on timeout; never blind retry |
| Void | IMPLEMENTED (code) | `voidAuthorization` |
| Refunds | MISSING | Not implemented |
| Real sandbox transaction | NOT VERIFIED | Corrected 2026-11-13: sandbox credentials are configured in the Production scope, but no sandbox order has been approved or captured, and no public webhook URL / `PAYPAL_WEBHOOK_ID` is confirmed |

**Safety guarantees preserved:**
- Amounts always server-derived from stored milestones/authorization; `FormData` never supplies an amount.
- Webhook never independently approves a milestone or bypasses state machine.
- `2xx` never treated as settlement; timeouts become `PENDING`.
- Capture cap enforced at two layers; duplicates durably deduped.
- No secrets reach browser, logs, or responses.
- Demo provider (`lib/payments/demo.ts`) makes NO network calls; all results `simulated:true`.

**Blocker (corrected 2026-11-13):** the sandbox credentials (`PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`) are now configured in the Production scope. What still blocks a *verified* live sandbox transaction is the missing public HTTPS webhook endpoint and `PAYPAL_WEBHOOK_ID`, together with a sandbox order that has actually been approved and captured.

---

## E. AI audit

**Finding: AI advisory layer implemented; advisory-only; runs as deterministic fallback without credentials.**

| Capability | Status | Evidence |
|---|---|---|
| AI provider | CONFIG-GATED | `readAdvisoryProviderConfig` requires `GEMINI_API_KEY` + `GEMINI_MODEL` |
| Model | NOT CONFIGURED | No key set; deterministic fallback active |
| SDK/API | IMPLEMENTED | `fetch` with 15s timeout, `AbortSignal` |
| Credential handling | IMPLEMENTED | Server-side only; never returned to client |
| Structured output validation | IMPLEMENTED | `parseJsonObject` + `parseMilestoneProposal`/`parseEvidenceAdvisory` |
| Malformed response handling | IMPLEMENTED | Fallback on parse/fetch failure |
| Advisory-only enforcement | IMPLEMENTED | System prompts: "This advisory does not authorize payment or accept evidence", "a human reviewer decides. This advisory never changes deal state." |
| Cannot approve evidence | VERIFIED | No code path lets AI set review decision |
| Cannot authorize/capture payment | VERIFIED | AI never touches payment state |
| Human approval preserved | VERIFIED | Deterministic rules + human `CAPTURE` approval required |
| Live AI + PayPal workflow | NOT VERIFIED | No AI key; the PayPal sandbox lifecycle is still unverified (corrected 2026-11-13: sandbox credentials are configured in Production, but no order has been approved or captured) |

**Blocker:** No `GEMINI_API_KEY`/`GEMINI_MODEL`. Cannot verify live AI behavior or demonstrate AI + PayPal together in a real workflow.

---

## F. Security audit (from independent security-reviewer findings + verification)

Findings addressed in closeout (all verified in diff):
1. **CRITICAL** — hardcoded fallback signing secret removed; `FAIRHOLD_SESSION_SECRET` required in all envs (`lib/auth/session-token.ts`).
2. **MAJOR** — `Disputed` and `Completed` removed from `PAYABLE_DEAL_STATES` (`lib/domain/rules.ts`).
3. **MAJOR** — simulated provider no longer auto-selected in production unless `FAIRHOLD_ALLOW_SIMULATED_PAYMENTS=true` (`lib/payments/runtime.ts`).
4. **MINOR** — webhook body streamed with 1MB byte cap + `Content-Length` pre-check (`lib/payments/webhook-endpoint.ts`).
5. **MINOR** — placeholder-credential detection broadened (`lib/payments/config.ts`).
6. **MINOR** — access check moved before state/existence checks (`app/deals/actions.ts`).
7. **MINOR** — webhook comment corrected (capture_completed records evidence only) (`lib/data/postgres/webhooks.ts`).
8. **MINOR** — evidence downloads get `Cache-Control: private, no-store` + `Vary: Cookie` (`app/api/evidence/[dealId]/[evidenceId]/route.ts`).
9. **MINOR** — `.env.example` capture/void wording corrected.

**Design-level limits documented, NOT patched:**
- Demo identity strength (name-only allowlist, no password).
- Ambiguous-capture reconciliation (retry vs. reconcile decision needed).
- Webhook rate limiting (no IP-based rate limit; token amplification possible).
- Webhook payload retention (no TTL/minimal payload redaction).

**No issues found:** path traversal, evidence authorization, content-type, secret exposure, webhook signature/replay/duplicate/quarantine, client-controlled money, supply chain.

---

## G. Database and durability audit

| Item | Status | Details |
|---|---|---|
| Two backends | IMPLEMENTED | `lib/data/db.ts`: JSON (demo default) and PostgreSQL (`DATABASE_URL`) |
| Silent PG fallback | ABSENT | No silent fallback once PG configured; infra failures propagate loudly |
| Connection string logging | ABSENT | `readDatabaseUrl` never logs/returns connection string |
| Migrations | IMPLEMENTED | `migrations/0001_initial.sql` … `0005_authorization_expiry.sql` |
| Payment ledger persistence | PG only | Requires `DATABASE_URL` |
| Evidence storage | PG + file | `lib/data/storage.ts` with orphan cleanup |
| Demo storage | localStorage / JSON file | Single-process; not durable across serverless invocations |
| Real-payment safety without PG | FAILS CLOSED | Runtime throws unless `FAIRHOLD_ALLOW_SIMULATED_PAYMENTS=true` |

**Limitation:** No hosted PostgreSQL configured; no durable private object storage; no backups/restore drill.

---

## H. Demo and deployment audit

| Item | Status | Details |
|---|---|---|
| `/demo` route | IMPLEMENTED | Browser-only guided demo; labels `DEMO MODE · SIMULATED PAYMENTS`; localStorage persistence; reset; no PayPal calls (test guard fails if any PayPal URL requested) |
| Preview deployment | READY BUT BLOCKED | https://fairhold-gpjdgtu59-thenidhibhat-6721s-projects.vercel.app (`dpl_DjHoRHGtfUeZF91KW36YCaUd6d7f`) built from HEAD `5c7f8f6`; Deployment Protection returns 302 to Vercel SSO for anonymous visitors |
| Production deployment | EXISTS (stale) | https://fairhold-ksmp5xz0b-thenidhibhat-6721s-projects.vercel.app (created 2026-11-06); stale build; no domain linked; production env scope empty |
| Stale alias | `fairhold-beta.vercel.app` | Owned by first broken static deploy; owner decision — do not delete/reassign |
| Deployment Protection | UNCHANGED | Enabled (`all_except_custom_domains`); deliberately not weakened |

**Blocker:** Public demo access requires an owner-side scoped Deployment Protection change (narrowest possible: demo deployment only, or a share link). Protected deployment must be preserved.

---

## I. UI/UX inventory

Preserved premium red-and-black visual identity. Key pages: landing, sign-in, dashboard, deal creation, deal details, milestone management, evidence submission/review, payment status/history, demo route, error/loading/empty/not-found states.

Known limitations (from prior QA):
- Responsive layout implemented; desktop/tablet/mobile Playwright coverage.
- No axe/Lighthouse run; heuristic a11y only (labels, focus visibility, heading order, contrast).
- No CSS `animation: infinite` (no perpetual motion).
- Forms are React server actions; inert until hydration (suite now waits for live form before clicking).
- JS-disabled dashboard Suspense body does not stream (documented limit); sign-in posts without JS (tested).

---

## J. Testing baseline

| Check | Command | Result |
|---|---|---|
| TypeScript typecheck | `npm run typecheck` | exit 0 |
| Lint | `npm run lint` | exit 0 |
| Unit + integration | `FAIRHOLD_TEST_DATABASE_URL=… FAIRHOLD_SESSION_SECRET=… npm test` | 193 pass / 193 total / 0 fail / 0 skip (13.9s) |
| Production build | `npm run build` | exit 0, 10 routes |
| E2E browser | `npx playwright test` | 27 passed (9 journeys × desktop/mobile/tablet Chromium, 4.6m) |
| Video composition check | `npx hyperframes@0.8.171 check` | 0 errors; layout 0 issues across 9 samples; 53/53 contrast AA |
| Video master | `ffprobe` | h264 1920×1080/30fps/3000 frames/100.0s; blackdetect: no black segments ≥0.4s |

No test mocked, skipped, or weakened to get green. Playwright timeouts raised (90s/10s) only for slow OneDrive dev compiles; no assertion relaxed.

---

## K. Git baseline

| Item | Status |
|---|---|
| Branch | `feat/deal-milestone-foundation` |
| Local HEAD | `5c7f8f63d8cc67666669b797cda5c87c32d04d01` |
| Remote HEAD | `5c7f8f6` (origin/feat/deal-milestone-foundation) — SYNCED ✓ |
| Working tree | NOT clean — 1 uncommitted modification: `FINAL_RELEASE_REPORT.md` (closeout gate updates: 27 passed exit 0, fresh preview URL, production deployment note) |
| Remote | `https://github.com/the-nidhi-bhat/fairhold.git` (fetch+push) |
| Last 6 commits | `d60d18d`, `0d699e7`, `9258bfb`, `a87dc1e`, `2faa222`, `5c7f8f6` |

**Action needed:** Commit the uncommitted `FINAL_RELEASE_REPORT.md` change (routine, no behavior change).

---

## L. Submission eligibility matrix

| Requirement | Status | Evidence / blocker |
|---|---|---|
| Public GitHub repository | VERIFIED | `https://github.com/the-nidhi-bhat/fairhold.git` (fetch+push confirmed) |
| README | PARTIAL | Exists; deployment/docs need refresh for current state |
| Open-source license | MISSING | No `LICENSE`/`LICENSE.md`/`LICENSE.txt`/`UNLICENSE` tracked — owner decision |
| PayPal meaningful integration | PARTIAL | Real sandbox adapter code exists; live sandbox lifecycle still unverified (corrected 2026-11-13: sandbox credentials are configured in Production, but no order has been approved or captured, and no webhook id is confirmed) |
| PayPal sandbox transaction | NOT VERIFIED | Sandbox credentials are configured in Production (corrected 2026-11-13), but no public webhook and no `PAYPAL_WEBHOOK_ID` are confirmed, and no sandbox order has been approved or captured |
| AI meaningful integration | PARTIAL | Advisory layer implemented; deterministic fallback live (no AI key) |
| AI + PayPal project relationship | NOT VERIFIED | No live AI + no live PayPal; connection not demonstrably exercised |
| Public judge demo | BLOCKED | Deployment Protection 302s anonymous visitors to SSO |
| Demo buyer/seller/reviewer journeys | VERIFIED (local) | 27/27 Playwright journeys pass locally; not publicly reachable |
| Public YouTube video < 3 min | NOT UPLOADED | 100s master + 30s cut exist locally; not uploaded to YouTube |
| Sponsor selections | NOT DONE | No sponsor categories inspected/recommended yet |
| Solo team status | CONFIRMED | Solo; no teammates |
| Final Git synchronization | SYNCED | HEAD == remote HEAD `5c7f8f6` |
| Full test gate | VERIFIED | typecheck 0, lint 0, unit 193/193, build 0, Playwright 27/27 |

---

## M. Risk register

| Rank | Risk | Severity | Mitigation |
|---|---|---|---|
| 1 | Public demo blocked by Deployment Protection | HIGH | Owner-side scoped protection change or share link |
| 2 | PayPal sandbox unverified | HIGH | Owner provide public webhook + `PAYPAL_WEBHOOK_ID`, then approve and capture one sandbox order (corrected 2026-11-13: the sandbox credentials are configured in Production already) |
| 3 | AI unverified | MEDIUM | Owner provide `GEMINI_API_KEY`/`GEMINI_MODEL` |
| 4 | Missing LICENSE | MEDIUM | Owner license decision (MIT recommended) |
| 5 | Demo identity strength | MEDIUM | Name-only allowlist; not production auth |
| 6 | Ambiguous-capture reconciliation | MEDIUM | Product decision: reconcile vs. retry |
| 7 | Webhook rate limiting / payload retention | LOW | IP rate limit; minimal payload + TTL |
| 8 | No hosted DB/storage/monitoring | MEDIUM | Required for real-user beta; not for hackathon demo |

---

## N. Owner-only actions

1. **Commit** `FINAL_RELEASE_REPORT.md` (routine; no behavior change) — Phase 1 completion.
2. **Scope Deployment Protection** to allow anonymous access to the dedicated demo deployment (or issue a share link). Do not weaken globally.
3. **Decide** on stale `fairhold-beta.vercel.app` alias (replace/remove/leave).
4. **Provide** `DATABASE_URL`, hosted object storage, public HTTPS webhook URL, `PAYPAL_WEBHOOK_ID` (corrected 2026-11-13: the PayPal sandbox credentials `PAYPAL_CLIENT_ID`/`PAYPAL_CLIENT_SECRET` are configured in Production already).
5. **Provide** `GEMINI_API_KEY`/`GEMINI_MODEL` for live AI verification.
6. **Choose** open-source license (MIT recommended) — do not silently add.
7. **Upload** video to YouTube (public, <3 min) — do not upload without authorization.
8. **Human review** of video frames (model cannot view images).
9. **Complete** Devpost submission form (owner only; do not submit without approval).

---

## O. Recommended next-phase execution order

1. Commit `FINAL_RELEASE_REPORT.md`; push to `origin/feat/deal-milestone-foundation`.
2. Phase 2: PayPal + AI integration completion — complete safe code work; document exact missing credentials; do not claim sandbox verification without evidence.
3. Phase 3: Public judge demo — narrow Deployment Protection change for demo deployment only; verify anonymous access.
4. Phase 4: QA — full route/journey audit; fix verified defects; regression tests.
5. Phase 5: Video finalization — verify claims match code; prepare YouTube upload package.
6. Phase 6: Repository/README/license — license decision, README refresh, secret safety.
7. Phase 7: Final security audit + release certification.
8. Phase 8: Devpost submission pack + final verdict.

---

## Phase 1 verdict: COMPLETE

The audit baseline is established. All claims are backed by source-file paths, command output, or deployment evidence. Unverified items are explicitly marked NOT VERIFIED or BLOCKED, not assumed.

**Path to saved audit report:** `docs/release/PHASE_01_BASELINE_AUDIT.md`

Do not start Phase 2. Await owner review of this report.