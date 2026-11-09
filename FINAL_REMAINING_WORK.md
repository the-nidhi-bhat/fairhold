# FairHold — remaining work

Gap matrix as of 2026-11-08, branch `feat/deal-milestone-foundation`.
Statuses are evidence-based: a row is DONE only where a command or assertion in
this repository proves it. Nothing here is aspirational.

Legend: **DONE** · **PARTIAL** (works, with a named gap) · **MISSING** (not built) ·
**BLOCKED** (needs a credential, paid resource or account action)

---

## 1. The 16-point completion gate

| # | Item | Status | Evidence | Gap / next action |
|---|---|---|---|---|
| 1 | Onboarding | DONE | Collapsed four-step explainer on `/dashboard` (`app/dashboard/page.tsx`); Playwright asserts it starts collapsed, expands to steps 1–4 with the approval sentence, and collapses again (`tests/evidence-lifecycle.spec.ts`) | — |
| 2 | Guided demo walkthrough | DONE | `/demo` (`components/demo-experience.tsx`, `lib/demo/reducer.ts`), 10 reducer tests in `lib/demo/reducer.test.ts`, `tests/demo.spec.ts` on 3 viewports | — |
| 3 | Buyer / seller / reviewer role separation | DONE | `canAccessDeal` + `getDemoSession`; Playwright proves a reviewer cannot create a deal, a non-participant gets not-found, and role-gated controls are absent | — |
| 4 | Notifications | PARTIAL | Dashboard attention chip counts decisions required / items needing attention (`summarizeDashboardWorkflow`) | No outbound email or push. Needs an email provider credential and a delivery job. |
| 5 | Search and filters | DONE | `?q=` and `?status=` on `/dashboard`, "N of M shown"; asserted in `tests/evidence-lifecycle.spec.ts` | — |
| 6 | Empty states | DONE | Filtered empty state asserted; zero-deal dashboard state; `app/deals/[id]/not-found.tsx` | — |
| 7 | Failure recovery (P0) | DONE | `app/dashboard/error.tsx` and `app/deals/[id]/error.tsx` with retry; ambiguous capture stays `PENDING`; webhook quarantine path unit-tested | Error boundaries are not exercised by a browser test because forcing a server throw from Playwright needs a test-only route. |
| 8 | Fee transparency | DONE | "Costs and limits" section on the deal page; asserted in `tests/evidence-lifecycle.spec.ts` | — |
| 9 | Currency precision / no float money math (P0) | DONE | All amounts are integer cents; `lib/domain/money.ts` (`summarizeDealMoney`, `parseAmountToCents`) + `lib/domain/money.test.ts`; `formatCents` for display | USD only; multi-currency is deliberately out of scope. |
| 10 | Disputes and cancellation | PARTIAL | Milestone rejection with a required note, revision and resubmission; `Cancelled` deal transition in `allowedManualDealTransitions` | No formal dispute record or arbitration flow — outside the approved scope. |
| 11 | Refunds, reversals, reconciliation | PARTIAL | Authorization void path; reconciliation and webhook quarantine unit tests (`lib/data/paypal*.test.ts`, webhook endpoint tests) | Capture refunds are not implemented. A refund needs a provider refund call and ledger entry before it can be claimed. |
| 12 | Monitoring | MISSING | — | No APM, no error sink, no uptime check. Local blocker: no account. Choose a provider (e.g. Sentry free tier) and wire `instrumentation.ts`. |
| 13 | Backups and restore | BLOCKED | Local PostgreSQL 16 container + SQL migrations in `migrations/0001�0004` prove the schema applies cleanly | No hosted database exists, so there is nothing to back up. Needs a managed Postgres plan with automated backups, plus a documented restore drill. |
| 14 | Demo data reset | DONE | `npm run demo:reset` (`scripts/demo-reset.mjs`); `/demo` has an in-browser reset; Playwright resets between runs | — |
| 15 | Screenshots | DONE | 14 screenshots + `report.json` in `C:\Users\theni\AppData\Local\Temp\opencode\fairhold-shots-final\`; video frames in `videos/fairhold-launch/renders/` | Human review only — the model cannot read images. |
| 16 | Three-minute pitch / demo script | DONE | `DEMO_SCRIPT_3MIN.md` — spoken script with timing beats, exact UI steps, the hold-not-escrow sentence and an explicit "what is not verified" close; `videos/fairhold-launch/SCRIPT.md` remains the 100 s video copy | Delivery requires a human presenter; no rehearsal was recorded |

Score: 11 DONE, 3 PARTIAL, 1 MISSING, 1 BLOCKED.

Closeout (2026-11-09) — security fixes applied: removed the hardcoded fallback
signing secret (`secret()` now throws when `FAIRHOLD_SESSION_SECRET` is missing
in any env); removed `Disputed` from payable deal states so a dispute always
blocks capture; simulated provider no longer auto-selected in production without
explicit `FAIRHOLD_ALLOW_SIMULATED_PAYMENTS=true`; webhook body is streamed
with a hard byte cap before any allocation; access checks now run before
existence/state checks in deal/milestone status actions; evidence downloads
send `Cache-Control: private, no-store`; placeholder-credential detection was
broadened; `.env.example` corrected to describe the implemented capture/void
path. Design-level findings (demo identity strength, ambiguous-capture
reconciliation, webhook rate limiting, payload retention) require product
decisions or credentials and are left as documented limits rather than patched.

---

## 2. Priority classification

### P0 — must work for the demo to be usable

| Item | Status | Evidence | What is missing | Local-doable? | Verification |
|---|---|---|---|---|---|
| Public demo accessible to an external visitor | **BLOCKED** | Vercel preview Ready; plain request returns 302 to Vercel SSO | Deployment Protection is `all_except_custom_domains` on the project | No — owner action in Vercel | `curl -I <url>` returns 200 and renders `/demo` |
| Demo sign-in and buyer/seller workflows | **PARTIAL** | Playwright exercises the full lifecycle locally against a production build | Same journeys are unverified on the deployed URL because CLI requests are stopped by SSO | Partly — `vercel curl` works, but it cannot drive a browser | `npx playwright test` against the public URL |
| Demo mode / real mode separation | **DONE** | `/demo` is browser-only and calls no server route; the server demo store and PostgreSQL are separate; `DEMO MODE · SIMULATED PAYMENTS` labels everywhere | — | — | `tests/demo.spec.ts`; code review of `components/demo-experience.tsx` |
| No payment-safety regression | **DONE** | 193 unit tests + 27 Playwright journeys incl. double-capture refusal, approval-before-capture, webhook quarantine | — | — | Final gate in `FINAL_RELEASE_REPORT.md` §9 |
| No secret exposed to the browser | **DONE** | Server-only env reads; `.env*` gitignored; no `NEXT_PUBLIC_` provider key; `git log` scan clean | — | — | `grep -r "NEXT_PUBLIC_" app components lib`; secret scan |
| Critical errors fixed | **DONE** | Error boundaries, not-found page, webhook quarantine, idempotent capture | — | — | Unit + Playwright |

### P1 — required for a real-user beta

| Item | Status | What is missing | Local-doable? | Verification |
|---|---|---|---|---|
| Real authentication (password / magic link / OAuth) | **MISSING** | The app signs in by display name + role against an allowlist. That is a demo identity, not authentication. | Yes (schema + hashing + session cookie), but it changes the login contract and needs approval | Playwright: wrong password rejected, session survives reload, sign-out clears |
| Hosted PostgreSQL | **BLOCKED** | No `DATABASE_URL`; production env scope is empty | Needs a paid/free-tier hosted database | `npm run db:migrate` against the host, then a real-user write |
| Durable private evidence storage | **BLOCKED** | Evidence is stored on the serverless filesystem, which is read-only on Vercel | Needs object storage + signed URLs | Upload, then download with a signed URL after a redeploy |
| Live PayPal sandbox lifecycle | **BLOCKED** | Needs sandbox client id/secret, a public HTTPS webhook and `PAYPAL_WEBHOOK_ID`; the app refuses real sandbox actions without PostgreSQL | No — credentials required | `node scripts/paypal-kill-test.mjs` against sandbox |
| Core real-user payment lifecycle | **PARTIAL** | Rules, ledger, idempotency and state machine are built and unit-tested; the provider adapter is simulated in this build | Partly | Sandbox kill-test |
| Production configuration | **BLOCKED** | Production env scope empty (session secret, database, storage, webhook, AI keys) | No — needs account access | `vercel env ls production` |

### P2 — polish that raises quality

| Item | Status | Note |
|---|---|---|
| Video deliverable | **DONE** | 100 s master + 30 s cut + thumbnail + contact sheet + SRT + source; `check` 0 errors, 53/53 contrast AA |
| Extra browser coverage | **MISSING** | Chromium only. Firefox/WebKit need Playwright browser downloads (`npx playwright install firefox webkit`). |
| Accessibility audit tooling | **MISSING** | No axe or Lighthouse run. Current evidence is heuristic (labels, focus, contrast, heading order). |
| Performance measurement | **MISSING** | No Lighthouse scores or Core Web Vitals measurement; 60 fps is never claimed. |
| Observability | **MISSING** | See gate item 12. |
| JavaScript-disabled dashboard | **MISSING** | Sign-in posts without client JavaScript (tested), but the dashboard body streams through `<Suspense>` and needs hydration, so a JS-disabled client sees the skeleton. Documented as a limit, not a promise of no-JS support. |

### P3 — optional experiments

| Item | Status | Note |
|---|---|---|
| Advanced motion / 3D | Not started | Deliberately out of scope; the motion library count is frozen at one (GSAP, video only). |
| Multi-currency | Not started | USD-only is a stated limit, not a defect. |
| Refunds | **MISSING** | Requires a provider refund API plus ledger entries. |
| Dispute workflow | **MISSING** | Requires product decisions, not just code. |

---

## 3. Exact next actions, in order

1. **Owner (Vercel):** scope Deployment Protection so the demo deployment is
   publicly reachable — either disable protection for this preview only, or
   attach a custom domain (protection is `all_except_custom_domains`). Then
   `curl -I` the URL and confirm 200.
2. **Owner (Vercel):** delete or replace the stale production deployment that
   owns `fairhold-beta.vercel.app` (it serves a broken static build). This is a
   destructive action and is not taken here.
3. **Local:** assert the onboarding explainer in Playwright (gate item 1) and add
   a three-minute cut of the demo script (gate item 16). Both are doc/code-only.
4. **Credentials:** provide `DATABASE_URL`, object storage, PayPal sandbox
   credentials and `PAYPAL_WEBHOOK_ID`, then run the sandbox kill-test.
5. **Credentials:** provide `AI_API_KEY` and `AI_MODEL` to replace the
   deterministic advisory fallback with a live model.
6. **Product decision:** real authentication method before any real-user beta.

## 4. What is deliberately NOT built

Crypto/blockchain, chat, social features, an admin panel, multi-agent marketing,
extra analytics dashboards, fake escrow, a second animation library, and any
demo-only feature that does not work. Scope freeze is intact.
