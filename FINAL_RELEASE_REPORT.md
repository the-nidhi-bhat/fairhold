# FairHold — final release report

**Date:** 2026-11-08 · **Branch:** `feat/deal-milestone-foundation` ·
**Repository:** `the-nidhi-bhat/fairhold` ·
**Philosophy under test:** *AI proposes. Rules decide. Humans approve. PayPal
executes. The audit trail records everything.*

Every claim below is paired with the command or file that proves it. Where a
check could not be run, the item is marked **Unverified** or **Blocked** and is
never counted as a pass.

> **Superseded figures (2026-11-12):** test counts and the philosophy wording in
> this dated report reflect the 2026-11-08 release gate. Current verified results
> are **293 unit/integration tests (293 passing with a test database)** and
> **78/78 Playwright journeys across desktop, mobile and tablet Chromium**, with
> Firefox and WebKit projects configured — see [README.md](./README.md) and the
> latest section of [QA_REPORT.md](./QA_REPORT.md). The canonical philosophy line
> is: *AI proposes. Humans decide. Rules enforce. PayPal executes. The audit
> trail records.*

---

## 1. Executive summary

FairHold is a working milestone-payment application with a deterministic rules
engine, a human approval gate, an idempotent capture ledger, fail-closed webhook
handling, an audit trail, a public browser-only guided demo, and a 100-second
launch video.

What is verified on this machine: typecheck, lint, a production build with 10
routes, **193 unit/integration tests passing with zero skips**, and **27 browser
journeys passing** across desktop, mobile and tablet Chromium — including
double-capture refusal, approval-before-capture, access control, search, fee
transparency and the whole guided demo.

What is *not* verified and is not claimed here: a live PayPal sandbox lifecycle,
live AI provider calls, hosted PostgreSQL, durable object storage, production
deployment, and anonymous access to the deployed preview. Each of those is
blocked on a credential, a paid resource, or an owner-side account action, and
each is listed in §13 and `FINAL_REMAINING_WORK.md`.

The honest one-line status: **the application and its evidence are ready to
demo; the hosted production environment is not configured, and the deployed
preview is not publicly reachable yet.**

---

## 2. Scope honored, and what was deliberately not built

Built against the approved FRS: role-separated workspaces, milestone lifecycle,
evidence submission and review, deterministic recommendations, human approval,
idempotent payment operations, webhook verification with quarantine, audit trail,
public demo, launch video, documentation, and a deployment record.

Not built, by explicit scope freeze: crypto/blockchain, chat, social features, a
large admin panel, multi-agent marketing, extra analytics dashboards, fake
escrow, a second animation library, and any demo-only feature that does not work.

The philosophy was preserved verbatim in code and copy:

- AI produces a recommendation and never writes state or calls a provider
  (`lib/ai/advisory.ts` has no write path).
- Rules decide: `recommendMilestone` in `lib/domain/rules.ts` is pure and
  deterministic.
- Humans approve: approving `HOLD` or `DISPUTE` is refused; capture requires a
  recorded human approval.
- PayPal executes: the provider adapter owns the network call; the app never
  fabricates a provider reference or a capture id.
- The audit trail records: events are append-only and the UI renders recorded
  history only.

---

## 3. What shipped in this pass

| Area | Change | Evidence |
| --- | --- | --- |
| Public demo | `/demo` — a guided, browser-only walkthrough that reuses the real rules and labels every payment SIMULATED | `components/demo-experience.tsx`, `lib/demo/reducer.ts`, `lib/demo/fixture.ts`, `tests/demo.spec.ts` |
| Money precision | Integer-cent arithmetic and exact parsing of typed amounts | `lib/domain/money.ts`, `lib/domain/money.test.ts`, money summary on the deal page |
| Fee transparency | "Costs and limits" on the deal page: no platform fee exists in this build; provider fees sit outside the ledger; USD-only integer cents | `app/deals/[id]/page.tsx`, asserted in Playwright |
| Dashboard | Text search, status filter, "N of M shown", filtered empty state, attention counts, collapsed four-step explainer | `app/dashboard/page.tsx`, asserted in Playwright |
| Failure recovery | Error boundaries with retry on dashboard and deal, not-found page, `PENDING` for ambiguous outcomes, webhook quarantine | `app/dashboard/error.tsx`, `app/deals/[id]/error.tsx`, `app/deals/[id]/not-found.tsx` |
| CI | GitHub Actions with a PostgreSQL 16 service and a CI-only placeholder session secret | `.github/workflows/ci.yml` |
| Storage hygiene | Orphaned evidence files are cleaned up | `lib/data/storage.ts` + test |
| Video | 100 s HyperFrames master, 30 s cut, thumbnail, contact sheet, SRT, storyboard, script | `videos/fairhold-launch/` |
| Docs | `FINAL_RELEASE_REPORT.md`, `FINAL_REMAINING_WORK.md`, updated README/TESTING/DECISIONS/TASKS/QA_REPORT/CHANGELOG/HANDOFF | this repo |

---

## 4. Public demo mode

**Route:** `/demo` — no sign-in, no server write, no provider call.

- State lives in `localStorage` on the visitor's device and resets on demand.
- The reducer is pure and reuses the same rules as the application, so the demo
  cannot drift from the product's logic.
- A persistent badge reads **DEMO MODE — SIMULATED PAYMENTS**. No screen presents
  a simulated capture as real money movement, and no provider reference is
  invented.
- A Playwright test fails if any request URL contains `paypal`.

Separation from real-user mode is structural: the demo never calls a server
route, while the operator app reads its session, data and ledger from the server.
There is no shared storage, so demo activity cannot contaminate real records.

---

## 5. Real-user mode

- Signed demo sessions with expiry, role authorization, and server-side
  allowlists re-checked on every read (`lib/auth/session.ts`).
- Deal access is enforced in the page component before streaming, so an
  unauthorized deal renders not-found and leaks nothing.
- Reviewer access requires both an allowlist entry and an explicit per-deal
  grant.
- Writes go through server actions that re-derive the actor from the session and
  never trust a client-supplied identity.
- Persistence is PostgreSQL when `DATABASE_URL` is set (migrations
  `0001`–`0004`), otherwise a local JSON store that refuses writes on a read-only
  filesystem instead of pretending to persist.

**Gap:** sign-in is name+role, not authentication. Real-user beta requires a real
identity method (§13, `FINAL_REMAINING_WORK.md` P1).

---

## 6. Payment safety invariants

Verified by unit and integration tests, not by prose:

1. **Idempotency** — a capture reservation is claimed before the provider call,
   keyed by `capture:<dealId>:<milestoneId>`; a double submit cannot double-capture.
2. **Approval before capture** — a capture without a matching human approval is
   refused, and approving a `HOLD`/`DISPUTE` recommendation is rejected.
3. **Atomic accounting** — a provider-confirmed capture is written into the
   operation and the capture ledger in one transaction; reservations include
   completed captures and outstanding `RESERVED`/`PENDING` rows.
4. **Timeout is not failure** — transport failures and timeouts are recorded as
   `PENDING` and surfaced for reconciliation; reservations are released only on a
   definite provider rejection.
5. **Webhooks** — signature verification, duplicate suppression, amount/currency/
   deal matching against the stored authorization and the human approval, and a
   durable quarantine with a sanitised reason. Unusable events are still
   acknowledged with `2xx` so the provider stops retrying a fact we cannot use.
6. **No fabricated success** — the UI renders provider-confirmed state only; a
   simulated capture is labelled simulated.

The authorization is a **hold**, never escrow, settlement, or a guarantee. There
is no marketplace payout model, because the provider does not offer one here, and
none is claimed.

**Not verified:** the same lifecycle against a live PayPal sandbox. That needs
credentials, a public HTTPS webhook and `PAYPAL_WEBHOOK_ID` (§13).

---

## 7. AI advisory boundary

- Advisory only: milestone proposals and evidence advisories are schema-validated
  and clamped, with deterministic fallbacks on non-2xx, timeout or bad JSON.
- No write path: advisory output cannot change deal, milestone, approval or
  payment state, and cannot call the provider.
- The UI names its source. In this build it says *"deterministic fallback (no
  model provider configured)"*, because no `GEMINI_API_KEY`/`GEMINI_MODEL` exists.
- Recommendations carry reason codes and an evidence fingerprint, so the same
  inputs produce the same recommendation.

---

## 8. Security posture

| Control | Status |
| --- | --- |
| Server-side session and role checks on every read | Implemented, tested |
| Client identity never trusted for mutations | Implemented, tested |
| Allowlists fail closed | Implemented, tested |
| Evidence upload validation (extension allowlist, 3 MB cap, magic-number sniff, sanitised filename) | Implemented, tested |
| Authorised evidence download with `nosniff` | Implemented, tested |
| Webhook signature verification + replay/duplicate suppression | Implemented, tested |
| Secrets in the browser | None: no provider key is `NEXT_PUBLIC_`; `.env*` is gitignored; no secret was printed in any command |
| Deployment protection | Deliberately left enabled; it was **not** weakened to make the demo public |
| Production service-role credentials | None exist in this project |

Residual risks: demo authentication, single-process JSON store, local-disk
evidence when no object storage is configured, and no rate limiting in front of
the public demo route.

Closeout security fixes applied (2026-11-09): removed the hardcoded fallback
signing secret so `secret()` throws when `FAIRHOLD_SESSION_SECRET` is missing in
any env; removed `Disputed` from payable deal states so a dispute always blocks
capture; the simulated provider is no longer auto-selected in production without
explicit `FAIRHOLD_ALLOW_SIMULATED_PAYMENTS=true`; webhook body is streamed
with a hard byte cap before any allocation; access checks now run before
existence/state checks in deal/milestone status actions; evidence downloads
send `Cache-Control: private, no-store`; placeholder-credential detection was
broadened; `.env.example` corrected to describe the implemented capture/void path.
Design-level findings (demo identity strength, ambiguous-capture reconciliation,
webhook rate limiting, payload retention) require product decisions or
credentials and are left as documented limits rather than patched.

---

## 9. Verification evidence

Run on Windows, Node with the repo's own scripts, against an isolated PostgreSQL
16 container (`fairhold-pg-test`, `127.0.0.1:55432`, database `fairhold_test`).

| Check | Command | Result |
| --- | --- | --- |
| Types | `npm run typecheck` | **exit 0** |
| Lint | `npm run lint` | **exit 0**, no findings |
| Unit + integration | `FAIRHOLD_TEST_DATABASE_URL=… npm test` | **193 tests, 193 pass, 0 fail, 0 skipped** (13.9 s) |
| Production build | `npm run build` | **exit 0**, 10 routes: `/`, `/_not-found`, `/api/evidence/[dealId]/[evidenceId]`, `/api/paypal/webhook`, `/dashboard`, `/deals/[id]`, `/deals/new`, `/demo`, `/login` |
| Browser journeys | `npx playwright test` | **27 passed** (9 journeys × desktop/mobile/tablet Chromium) |
| Video composition | `npx hyperframes@0.8.171 check` | **0 errors**, runtime 0/0, layout 0 issues across 9 samples, 53/53 text checks pass WCAG AA |
| Video master | `ffprobe` | h264, 1920×1080, 30 fps, 3000 frames, 100.0 s, 9.7 MB |
| Video dead frames | `ffmpeg blackdetect` | no black segment ≥ 0.4 s |

The journeys that matter most: authorization → evidence → revision →
acceptance → simulated capture; a second capture blocked; non-participant and
ungranted reviewer refused; deal creation with milestone authoring; dashboard
search and filtered empty state; fee transparency; guided demo lifecycle with a
PayPal-request guard; demo persistence and reset; demo responsive fit.

Nothing was mocked, skipped or weakened to obtain these numbers. The only test
configuration change is an increased Playwright timeout (90 s / 10 s), because a
dev-mode compile on a OneDrive-synced checkout exceeded the 30 s default; no
assertion was relaxed.

One gate run did fail — 23 passed / 1 failed on the tablet project, a swallowed
"Sign out" click — and it was not waved through. It led to the real cause (a
server-action form is inert until hydration), to a stricter pre-click readiness
check in the suite, and to a documented product limitation. After the hardening
the full suite passed 24/24; the closeout gate ran **27 tests (9 journeys × 3
projects: desktop/mobile/tablet Chromium)**, all passing — **27 passed, exit 0,
4.6m**. The investigation is in `QA_REPORT.md` under "Flake found by the release
gate".

---

## 10. Launch video

`videos/fairhold-launch/` is a HyperFrames project: one standalone
`index.html`, 1920×1080, 30 fps, 100 s, 12 timed scenes, one paused GSAP
timeline.

| Deliverable | Detail |
| --- | --- |
| Master | `renders/fairhold-launch.mp4` — 100 s, 9.7 MB, 3000 frames |
| 30 s cut | `renders/fairhold-launch-30s.mp4` — scenes 1, 3, 5, 8, 9, 12 |
| Still | `renders/thumbnail.png` |
| Contact sheet | `renders/frames-contact-sheet.png` (for human review) |
| Captions | `captions/fairhold-launch.srt`, 12 cues on the scene timecodes |
| Script / storyboard / brief | `SCRIPT.md`, `STORYBOARD.md`, `BRIEF.md` |

Honesty rules baked in: a persistent `DEMO MODE · SIMULATED PAYMENTS` badge, an
explicit "provider call simulated in this build" line, a deterministic-fallback
label on the advisory scene, a closing frame that says a real capture needs
configured credentials, and no platform fee anywhere (none exists).

**Limit:** the model cannot read images. Frames were verified programmatically
(text fit, contrast, no dead frames, content present in every scene) but not
looked at. The contact sheet is provided for human review.

---

## 11. Documentation

Entry point `README.md`; architecture, database, API reference, payment flow, AI
design, security, setup, testing, deployment, user guide, demo guide, release
checklist, changelog, QA report, handoff, plus this report and the gap matrix.
`PAYMENT_FLOW.md` records the verified payment model, outcome semantics, webhook
quarantine rules and the sandbox verification status. Docs describe the current
state including the unverified items; no document claims a live sandbox run.

---

## 12. Deployment status

| Item | State |
| --- | --- |
| Vercel project | `fairhold` (team `thenidhibhat-6721s-projects`), Next.js preset |
| Latest preview | **Freshly deployed from final HEAD `5c7f8f6`** — https://fairhold-gpjdgtu59-thenidhibhat-6721s-projects.vercel.app (deployment `dpl_DjHoRHGtfUeZF91KW36YCaUd6d7f`, Next.js preset, build exit 0, 10 routes including `/demo`). Build was verified on the local tree before deploy; anonymous access remains blocked by Deployment Protection (302 to SSO) — that control was intentionally not changed. |
| Anonymous access | **Blocked** — Vercel Deployment Protection returns 302 to SSO |
| Production deployment | **Exists on a hashed URL** (`fairhold-ksmp5xz0b-thenidhibhat-6721s-projects.vercel.app`, created 2026-11-06) but serves a stale broken build and is not linked to any domain; production env scope is empty, so this is not a production-ready deployment. |
| Hosted database | None |
| Durable object storage | None |
| PayPal webhook endpoint | None (no public HTTPS URL + `PAYPAL_WEBHOOK_ID`) |
| `fairhold-beta.vercel.app` | Owned by the first, broken static deployment; replacing it is an owner decision |

Preview environment variables (names only, values never printed):
`FAIRHOLD_SESSION_SECRET`, `FAIRHOLD_DEMO_BUYERS`, `FAIRHOLD_DEMO_SELLERS`,
`FAIRHOLD_DEMO_REVIEWERS`, `FAIRHOLD_REVIEWER_DEALS`. Production scope: empty.

Deployment protection was **not** disabled. Making the demo public is a scoped
configuration decision for the account owner, not a security control to remove in
order to pass a demo.

---

## 13. Known limits, unverified claims and tooling gaps

**Unverified (not claimed):**

1. Live PayPal sandbox lifecycle — authorization, capture, partial capture, void,
   webhook verification, duplicate delivery.
2. Live AI provider calls — only the deterministic fallback runs here.
3. Hosted PostgreSQL behaviour, backups and restore drills.
4. Private durable evidence storage on a serverless host.
5. Browser sign-in and write journeys on the deployed URL (SSO blocks the CLI).
6. Visual judgement of the video frames by a human.
7. Firefox/WebKit support.
8. Accessibility conformance — no axe or Lighthouse run; current evidence is
   heuristic (labels, focus visibility, heading order, 53/53 text contrast in the
   video, colour tokens in the app).
9. Performance numbers — no Lighthouse/Core Web Vitals measurement, and no FPS
   claim is made anywhere.

**Product limits:** demo authentication; USD only; no refunds, partial refunds,
dispute arbitration or multi-currency; no email/push notifications; no
monitoring/APM; JSON store is single-process; ambiguous payments need a manual
operator reconciliation step; no public-demo rate limiting.

**Forms during hydration:** the server renders every mutating form as a real
`method="POST"` form with a `$ACTION_ID` field, and React swaps in its own
`javascript:` guard when it takes the form over during hydration. Two facts were
measured rather than assumed: with client JavaScript disabled the sign-in form
posts and authenticates (covered by `tests/progressive-enhancement.spec.ts`), and
once hydrated the action attribute is React's guard. The one gate failure was a
click that landed inside that takeover window and was swallowed. The suite now
waits for React's guard before clicking, so the race is not hidden. The related
limit is real and separate: the dashboard body is streamed through `<Suspense>`,
so a JavaScript-disabled client sees the shell and the skeleton — the app is not
usable without JavaScript, and does not claim to be.

**Repair path:** every one of these is scoped in `FINAL_REMAINING_WORK.md` with a
priority, a blocker and a verification method.

---

## 14. Completion gate — 16 items

| # | Item | Status |
|---|---|---|
| 1 | Onboarding | DONE |
| 2 | Guided demo walkthrough | DONE |
| 3 | Role separation | DONE |
| 4 | Notifications | PARTIAL |
| 5 | Search and filters | DONE |
| 6 | Empty states | DONE |
| 7 | Failure recovery (P0) | DONE |
| 8 | Fee transparency | DONE |
| 9 | Currency precision (P0) | DONE |
| 10 | Disputes and cancellation | PARTIAL |
| 11 | Refunds, reversals, reconciliation | PARTIAL |
| 12 | Monitoring | MISSING |
| 13 | Backups and restore | BLOCKED |
| 14 | Demo data reset | DONE |
| 15 | Screenshots | DONE |
| 16 | Three-minute pitch script | DONE |

**11 DONE · 3 PARTIAL · 1 MISSING · 1 BLOCKED.** Details, evidence and next action
per row: `FINAL_REMAINING_WORK.md`.

---

## Final verdicts

| Question | Verdict |
| --- | --- |
| Is it ready for a hackathon demo? | **Yes, locally** — 27/27 browser journeys and a 100 s video. Public access to the deployed preview is still blocked by Deployment Protection. |
| Is it ready for a real-user beta? | **No** — sign-in is a demo identity, there is no hosted database or durable evidence storage, and there is no monitoring. |
| Is the PayPal sandbox lifecycle verified? | **No** — no credentials, no public webhook, no `PAYPAL_WEBHOOK_ID`. The adapter is simulated in this build and says so. |
| Are production payments ready? | **No** — sandbox is unverified, there is no hosted accounting, and refunds are not implemented. |
| Is a production deployment ready? | **No** — a production deployment exists on a hashed URL but serves a stale broken build, production env scope is empty, and no domain is linked; it is not production-ready. |

---

## Actions only you can take

1. **Decide how the demo becomes public.** Either scope Vercel Deployment
   Protection to exclude the demo deployment (allowing anonymous access to that
   deployment only), or attach a custom domain (protection currently covers all
   non-custom domains). Verify with `curl -I <url>` → 200. Do not weaken the
   protection for any other deployment.
2. **Delete or replace the stale production deployment** that owns
   `fairhold-beta.vercel.app` (it serves the first broken static build). This is
   destructive, so it was left untouched.
3. **Provide a hosted PostgreSQL URL** (`DATABASE_URL`), then run
   `npm run db:migrate` and a real-user write.
4. **Provide durable private object storage** credentials for evidence files.
5. **Provide PayPal sandbox credentials** (`PAYPAL_CLIENT_ID`,
   `PAYPAL_CLIENT_SECRET`, `PAYPAL_ENV=sandbox`), a public HTTPS deployment and
   `PAYPAL_WEBHOOK_ID`, then run `node scripts/paypal-kill-test.mjs`. Until then,
   no sandbox claim can be made.
6. **Provide `GEMINI_API_KEY` and `GEMINI_MODEL`** to replace the deterministic advisory
   fallback with a live model.
7. **Choose a real authentication method** (password, magic link, or OIDC/SSO)
   before any real-user beta.
8. **Approve the remaining P1 budget items**: monitoring (error sink + uptime),
   managed backups with a restore drill, and an email provider for notifications.
9. **Review `videos/fairhold-launch/renders/frames-contact-sheet.png`** and the
   app screenshots as a human — appearance is the one thing this report cannot
   verify for you.
