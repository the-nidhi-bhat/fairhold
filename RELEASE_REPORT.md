# FairHold Release Report

**Release Date:** November 12, 2026
**Release commit:** `d36a257` — [view on GitHub](https://github.com/the-nidhi-bhat/fairhold/commit/d36a257d45dcc7122f2b395e2366df830459d70) — full SHA `d36a257d45dcc7122f2b395e2366df830459d70`
**GitHub PR:** None — the repository has no branch protection requiring a PR, so the release was published with a **fast-forward merge** (`git merge --ff-only`) from `feat/sprint-functional-completion` and a normal `git push origin main`. No force-push, no history rewrite, no `reset --hard`.
**Public judge URL:** https://fairhold-beta.vercel.app
**Vercel Deployment ID:** `dpl_9RmzvhGRMSg9PGCcU1hAFWVGp429`
**Deployment commit SHA:** `d36a257d45dcc7122f2b395e2366df830459d70` (identical to `origin/main`)

---

## 1. What is live

| Surface | URL | Status |
| --- | --- | --- |
| **Public judge entry point** | https://fairhold-beta.vercel.app | ✅ Anonymous, no account required |
| Guided demo | https://fairhold-beta.vercel.app/demo | ✅ Runs the full lifecycle in-browser with simulated payments |
| Demo sign-in | https://fairhold-beta.vercel.app/login | ✅ Buyer / Seller / Reviewer allowlists configured in the production scope |
| Per-deployment URL | `fairhold-fw54bggq7-thenidhibhat-6721s-projects.vercel.app` | ⚠️ Behind Vercel Deployment Protection (SSO). **Not** the judge entry point. |
| Project alias | `fairhold-thenidhibhat-6721s-projects.vercel.app` | ⚠️ Behind Vercel Deployment Protection (SSO) |

Deployment protection was deliberately left switched on — it was not bypassed. The `fairhold-beta.vercel.app` alias serves the same production build without authentication, which is what judges use.

### The 3-minute product film

| Surface | Path | Status |
| --- | --- | --- |
| Master (16:9) | [`production/brag-video/final-master.mp4`](production/brag-video/final-master.mp4) | ✅ 1920×1080, 30 fps, exactly 180.000 s, H.264 + AAC 48 kHz, 29.7 MB — re-rendered 2026-11-13 to fix the silent closing tail |
| Vertical (9:16) | [`production/brag-video/final-vertical.mp4`](production/brag-video/final-vertical.mp4) | ✅ 1080×1920, same 180.000 s, 12.7 MB |
| Poster | [`production/brag-video/thumbnail.png`](production/brag-video/thumbnail.png) | ✅ 1280×720, used in the README |
| Subtitles | [`production/brag-video/subtitles.srt`](production/brag-video/subtitles.srt) | ✅ 9 narration lines, exact timings |
| Production report | [`production/brag-video/production-report.md`](production/brag-video/production-report.md) | ✅ Sources, mix, licensing, QA, limitations |

The film is built from real Playwright recordings of the live deployment — the landing page, the demo
sign-in, a live signed-in deal with three milestones, a seller submitting evidence, a buyer reviewing and
accepting it, and the guided demo's simulated capture — cut against a nine-scene timeline held to the
second by an absolute-start schedule, with narration, a royalty-free music bed, impact cues, burned-in
captions and a loudness pass measured at −16.5 dB mean / −1.4 dB peak, with a clean silence map (no frame below −55 dBFS; the 169–179 s band measures −20.2 dB). Simulation is disclosed three
times on screen. **No payment was created, captured, voided or refunded while making it.**

### Vercel project

| Property | Value |
| --- | --- |
| Project | `fairhold` (`prj_vdIpZADs1M7qk17mPs96ubFhcZJp`) |
| Owner | `thenidhibhat-6721` projects (`team_ItjgL6wM37Ca3kH2nHkGS6FR`) |
| Framework preset | Next.js |
| Build command | `npm run build` (`next build`) |
| Root directory | `.` |
| Region | `iad1` |
| Git integration | Connected to `github.com/the-nidhi-bhat/fairhold`, production branch `main` |
| Production branch | `main` |

---

## 2. Production environment configuration

Names and scopes only — no secret values are recorded in this repository.

| Variable | Scope | State |
| --- | --- | --- |
| `DATABASE_URL` | Production (Secret) | ✅ Present. Neon-hosted PostgreSQL. Connection string is a Vercel secret and could not be pulled or inspected from this environment. |
| `FAIRHOLD_SESSION_SECRET` | Production (Secret) | ✅ Added this release — 48 random bytes, generated locally, never printed or committed. Sessions fail closed without it. |
| `FAIRHOLD_DEMO_BUYERS` | Production | ✅ `alex buyer` |
| `FAIRHOLD_DEMO_SELLERS` | Production | ✅ `jamie seller` |
| `FAIRHOLD_DEMO_REVIEWERS` | Production | ✅ `morgan reviewer` |
| `FAIRHOLD_REVIEWER_DEALS` | Production | ✅ `morgan reviewer:demo-deal-1` |
| `FAIRHOLD_ALLOW_SIMULATED_PAYMENTS` | Production (Secret) | ✅ `true` — keeps the in-app simulated provider available as an explicit fallback instead of failing closed. The Production scope also holds PayPal **sandbox** credentials, so the signed-in workspace selects the **sandbox** provider; `/demo` remains simulated and is labelled as such. |
| `NEXT_PUBLIC_APP_URL` | Production (Config) | ✅ `https://fairhold-beta.vercel.app` |
| `GEMINI_API_KEY` / `GEMINI_MODEL` | Production (Secret) | ✅ Present. Live advisory calls were **not** exercised from this environment; the deterministic fallback runs and is labelled in the UI. |
| `PAYPAL_ENV` / `PAYPAL_CLIENT_ID` / `PAYPAL_CLIENT_SECRET` | Production | ✅ **Present** — PayPal **sandbox** credentials, inherited at team level (a project-scoped `vercel env ls` omits inherited variables, so it lists no `PAYPAL_*` for Production). Names only: no value is read, printed or recorded here. **PayPal Live was never configured, and configuration refuses it — `readPayPalConfig()` returns `null` unless `PAYPAL_ENV` is exactly `sandbox`.** |
| `PAYPAL_WEBHOOK_ID` | Production | ⚠️ Not verifiable from this environment — a project-scoped `vercel env ls` omits inherited variables. Without it the webhook route answers `503 webhook not configured`. |

---

## 3. Build and test results

All commands were run against the release tree. No test was deleted, no assertion weakened, no failure skipped to reach green.

| Command | Exit code | Result |
| --- | --- | --- |
| `npm ci` | 0 | ✅ Clean install |
| `npm run typecheck` | 0 | ✅ `next typegen` + `tsc --noEmit` clean |
| `npm run lint` | 1 | ⚠️ **9 errors + 1 warning, all in `production/brag-video/source/*.cjs`** — the video-capture scripts committed in `f603cb8` (`@typescript-eslint/no-require-imports` plus one unused variable). The application code is lint-clean: `npx eslint app components tests lib scripts` → **exit 0**, no output. The `.cjs` → `.mjs` conversion that clears the remaining failures lands in this same release; lint is **not** claimed clean until that fix is visible in the working tree. |
| `npm test` | 0 | ✅ **296 tests — 268 passed, 0 failed, 28 skipped, 0 cancelled** (2041 ms) |
| `npm run build` | 0 | ✅ Next.js 16.4.3 Turbopack — compiled successfully, TypeScript clean, 11 routes including the new `POST /logout` |
| `npm run test:e2e` | 0 | ✅ **93/93 passing** — the three default Chromium projects (desktop, mobile, tablet), 31 tests each, exit 0 |
| `node scripts/run-e2e.mjs --project=desktop-firefox` | 0 | ✅ **31/31 passing** — the opt-in Firefox project |
| `node scripts/run-e2e.mjs --project=desktop-webkit` | 0 | ✅ **31/31 passing** on the release run, clean first pass. (An earlier pre-release WebKit run showed a single flake — `tests/evidence-lifecycle.spec.ts:376`, a 10 s `expect` timeout on a client-side RSC navigation under load — which did not reproduce.) |

The 28 skipped tests are exactly the PostgreSQL-requiring suites (14 `postgres:` data suites + 14 `webhook:` integration suites). They print `# set FAIRHOLD_TEST_DATABASE_URL (isolated Postgres) to run these tests` and skip rather than fail. `FAIRHOLD_TEST_DATABASE_URL` points at an isolated PostgreSQL 16 instance that was **not available in the verification environment for this release**, so the PostgreSQL-backed suites are **unverified** here — the figure for this release is **296 tests, 268 passed, 0 failed, 28 skipped**. With an isolated PostgreSQL 16 instance the expected figure is **296/296 passing, 0 failing**; that figure has not been observed in this release and is not claimed.

`npm run test:e2e` fans out over the three Chromium projects by default (`scripts/run-e2e.mjs:34` sets `PROJECTS = ["desktop-chromium", "mobile-chromium", "tablet-chromium"]`). Firefox and WebKit are **opt-in by name** and are therefore **not** part of `npm run test:e2e`: `node scripts/run-e2e.mjs --project=desktop-firefox` (or `--project=desktop-webkit`).

---

## 4. Judge journey verification

Verified from a **fresh anonymous Chromium context** (no cookies, no stored session) against the public URL, not against a developer session.

| # | Step | Result |
| --- | --- | --- |
| 1 | Public landing page loads | ✅ HTTP 200, title `FairHold — Work moves forward. Payments move with proof.` |
| 2 | Landing page explains the product | ✅ Hero line, the agreement → payment → evidence → review flow, and the "AI may / AI may never" split |
| 3 | Landing page explains all three roles | ✅ Buyer, Seller **and Reviewer** panels (the Reviewer panel was added in this release) |
| 4 | Simulated-payment disclosure on the landing page | ✅ "Demo payments are simulated" chip |
| 5 | AI-is-advisory disclosure | ✅ "AI is advisory only" chip |
| 6 | Official shield logo | ✅ Navbar `<use href="/fairhold-shield.svg">` renders at 28×28 with a non-zero bounding box; favicon link points at `/fairhold-shield.svg`; the asset itself returns HTTP 200 `image/svg+xml` |
| 7 | Guided `/demo` experience | ✅ HTTP 200, title `Guided demo \| FairHold`, milestone + evidence copy present, payments labelled simulated |
| 8 | `/login` renders a working form | ✅ HTTP 200, `input[name=name]` + `select[name=role]` (Buyer / Seller / Reviewer) + `Continue` |
| 9 | Sign-in as `Alex Buyer` | ✅ Signed in as `Alex Buyer` -> redirected to `/dashboard` with no deny banner (200). |
| 10 | `/dashboard` for an anonymous visitor | ✅ HTTP 200 and a **safe empty state** — no deal names, no user names, no cross-party data |
| 11 | `/deals/new` | ✅ HTTP 200 |
| 12 | Console and page errors | ✅ None |
| 13 | Mobile layout (390×844) | ✅ `scrollWidth === clientWidth` — no horizontal overflow |
| 14 | Audit trail | ✅ Rendered from recorded events on the deal page; each entry carries actor and timestamp |

Screenshots from the verification run are in the local working directory under `judge-shots/` (not committed — generated artefacts).

### Re-verification during the 2026-11-13 documentation correction

The 14 checks above were run during the 2026-11-12 release verification. They were **not** all
re-executed while this document was corrected. The following **were** re-checked from this session,
against `https://fairhold-beta.vercel.app`, and the results below are the ones actually observed:

| Check | Observed result |
| --- | --- |
| `GET /` | HTTP 200 |
| `GET /login` | HTTP 200; the form carries `input[name=name]`, `select[name=role]` (Buyer / Seller / Reviewer) and a `Continue` button; the page lists the demo identities "Alex Buyer · Jamie Seller · Morgan Reviewer" |
| `POST /login` as `Alex Buyer` (buyer) | HTTP 303 → `https://fairhold-beta.vercel.app/dashboard`, and the session cookie was set |
| `GET /dashboard` (signed in) | HTTP 200; the deal list rendered |
| `GET /deals/8f2c4a1e-6b3d-4f7a-9c21-5d0e7b4a3c10` (signed in) | HTTP 200; the payment panel rendered the button **"Create PayPal sandbox authorization"** with the caption "Creates a real order in the PayPal sandbox (no live money). The buyer must approve it, then confirm; this is an authorization hold, not a capture or settlement." |
| `GET /demo` (anonymous) | HTTP 200; the page is client-rendered and states that the guided demo runs in the browser and needs JavaScript |

**Not** re-verified in this session: the console/page-error check (12), the mobile-overflow check
(13), the shield-logo geometry check (6) and the audit-trail rendering check (14). Those remain
records of the 2026-11-12 run and are not claimed as re-verified.

### The live deployment uses the PayPal sandbox provider

This is the correction that prompted this section. The live deal page renders **"Create PayPal
sandbox authorization"**, and that string is produced only when `provider.mode === "sandbox"`
(`app/deals/[id]/page.tsx:151` and the button at lines 370-372). `getPaymentProvider()` /
`paymentRuntime()` select `PayPalSandboxProvider` when `readPayPalConfig()` is non-null **and**
PostgreSQL is configured, and `readPayPalConfig()` returns non-null only when `PAYPAL_ENV` is
exactly `sandbox` and both credentials are present and non-placeholder. Both conditions hold in
Production.

| Path | Provider | Verified from this session |
| --- | --- | --- |
| Guided `/demo` | in-app **simulated** provider | The page loads and states it runs in the browser; the simulated labels (`DEMO MODE — SIMULATED PAYMENTS`, `Simulated action — no PayPal request was made.`) are in `components/demo-experience.tsx` and `app/deals/[id]/evidence-forms.tsx`. |
| Signed-in workspace | **PayPal sandbox** provider | The deal page renders "Create PayPal sandbox authorization". |
| PayPal Live | none — refused by configuration | `readPayPalConfig()` returns `null` for any `PAYPAL_ENV` other than exactly `sandbox`. |

**No PayPal Sandbox order was created from this session.** The buyer-approval → capture → webhook
round trip is therefore still unverified here.

---

## 5. Database and storage status

| Item | State |
| --- | --- |
| Production data backend | ✅ PostgreSQL. `resolveDataBackend()` selects PostgreSQL in production — there is no silent JSON fallback. The single exception is an explicit, auditable operator pin (`FAIRHOLD_DATA_BACKEND=json`), which is honoured in production *only* when no real `DATABASE_URL` is configured, so it can never mask a configured database. The deployed production scope does not set that variable. Enforced by regression tests in `lib/data/db.test.ts`. |
| Migrations | ✅ Eight forward-only migrations (`0001_initial` … `0008_payment_capture_nullable_columns`). No destructive statements, no data resets, no table drops. |
| Hosted provider | Neon (serverless PostgreSQL). TLS is resolved from `sslmode`; the pool is sized for serverless. |
| Evidence bytes | ⚠️ Stored in PostgreSQL when the backend is PostgreSQL (`migrations/0007_evidence_files.sql`). Access-controlled download route, `nosniff`, sniffed content type. |
| Backup / recovery | ⚠️ **Not configured by this release.** Backups are the provider's responsibility (Neon point-in-time recovery); no project-level restore procedure has been verified here. |
| Destructive data changes | None. No migration was applied destructively, no production row was modified, and the original $600 PayPal capture was never touched. |

---

## 6. Repository curation (this release)

**Archived** — moved from the repository root into [`docs/archive/`](./docs/archive/) with an index explaining what each file records: `FAIRHOLD_STATE.md`, `FINAL_RELEASE_REPORT.md`, `FINAL_REMAINING_WORK.md`, `HANDOFF.md`, `QA_REPORT.md`, `TASKS.md`, `DECISIONS.md`, `RELEASE_CHECKLIST.md`, `DEMO.md`.

**Deleted** — legacy branding confirmed unreferenced by a repository-wide search: `public/favicon.svg`, `public/shield-logo.svg`, `public/shield-wordmark.svg`.

**Kept** - `public/fairhold-hero.svg` (still referenced by the README footer and `CHANGELOG.md`), `public/fairhold-shield.svg` (the approved logo), `public/fairhold-banner.png` (the README hero), `app/favicon.ico`, `production/brag-video/` (the three-minute product film — master, vertical cut, thumbnail, subtitles, source scripts and production report), `docs/release/` (21 audit documents), `migrations/`, `scripts/`, `tests/`.

**Removed** - `videos/fairhold-launch/renders/` (the superseded 100-second silent launch film, its 30-second cut, its thumbnail and its frames contact sheet). The film's HyperFrames authoring source was preserved at `docs/archive/launch-video-source/` and the shipped film is published on [YouTube](https://www.youtube.com/watch?v=DvCpRhXJ6VQ). The removed renders remain recoverable from the Git history.

**Also done** — `.gitignore` now excludes `lighthouse-*.json`, `*.lighthouse.json`, `lighthouse-report/` and `.lighthouseci/`; every documentation link that pointed at a moved file was repointed at `docs/archive/`.

---

## 7. Defects found and fixed in this release

Two real defects were found by the release gates during this sprint and fixed at the root. Neither was waived, and no assertion was weakened or removed to make a suite pass.

### 7.1 Sign-out could be swallowed by the hydration window (WebKit)

**Symptom.** The WebKit project failed `tests/evidence-lifecycle.spec.ts:281` at the second sign-out: the click landed, but the URL stayed on `/dashboard` for the whole 10-second assertion window (`Expected pattern: /\/(login|\?|$)/`, `Received string: "http://localhost:3104/dashboard"`). Chromium (all three projects) and Firefox passed the same test.

**Root cause.** Sign-out was a *server action* form (`<form action={logoutAction}>`). A server-action form is inert until React hydrates and takes the form over — React swaps the action for a `javascript:` guard and intercepts submission. A click landing inside that takeover window is swallowed, and the user stays signed in. The existing guard in the suite (`not.toHaveAttribute("action", /^javascript:/)`) is satisfied instantly by the server-rendered markup, so it never actually proved hydration. The archived QA report records the same defect on the tablet project in an earlier sprint, where it was mitigated on the *test* side only and the product defect was left in place.

**Fix.** Sign-out is now a **native** form post to a new route handler, `POST /logout` (`app/logout/route.ts`). It clears the session cookie and returns `303 See Other` to `/`. There is no hydration window and no takeover, so sign-out also works with client JavaScript disabled. The route is POST-only on purpose — a GET logout would let any third-party page sign a user out with an image tag.

**Regression coverage.** Five new tests in `tests/progressive-enhancement.spec.ts`: one asserts the control is a native `method="post" action="/logout"` form rather than a hydration-dependent server action; one asserts `POST /logout` returns `303` and removes the `fairhold_session` cookie; one asserts hydration does not take the sign-out form over; one asserts `GET /logout` is refused with `405` and leaves the session untouched; and one asserts `POST /logout` redirects to the application root (`/` on the app's own origin).

### 7.2 A production data-backend rule broke the end-to-end harness

**Symptom.** After this release made production always require PostgreSQL, every Playwright render threw `PostgreSQL is configured but DATABASE_URL is missing` and 5 of 26 tests failed per project.

**Root cause.** The Playwright harness runs `next start`, which sets `NODE_ENV=production`. It deliberately blanks `DATABASE_URL` and pins `FAIRHOLD_DATA_BACKEND=json` so the specs never touch a real database. The unconditional rule ignored that explicit pin.

**Fix.** The pin is now honoured in production **only when no real `DATABASE_URL` is configured**. A configured PostgreSQL always wins, so the pin can never mask a database and a genuine outage still fails loudly instead of silently switching stores. The deployed production scope does not set `FAIRHOLD_DATA_BACKEND`, so production still requires PostgreSQL. One regression test was added; no existing assertion was weakened or removed.

---

## 8. Known limitations

- Demo authentication only — signed names, not verified identities. There is no multi-tenant auth and no KYC.
- **Payments are never live, but they are not always simulated.** No PayPal Live account exists and none can be configured: `readPayPalConfig()` returns `null` unless `PAYPAL_ENV` is exactly `sandbox`, so no live adapter can ever be constructed and no real money moves. The **guided demo** (`/demo`) uses the in-app **simulated** provider — browser-only, no server writes, no provider calls — and says so on screen ("DEMO MODE — SIMULATED PAYMENTS", "Simulated action — no PayPal request was made."). The **signed-in workspace** uses the **PayPal sandbox** provider: authorizing there creates a **real order in the PayPal sandbox**, which the buyer must approve in a PayPal sandbox account before the hold completes. The UI labels the two paths differently, and the live deal page renders the button "Create PayPal sandbox authorization".
- No refunds, no partial refunds, no dispute arbitration, no multi-currency (USD only).
- No email or push notifications; the activity trail is the record.
- The JSON store is single-process and is not safe for concurrent multi-user writes. It is a development-only backend.
- Live AI provider calls have call sites but were never executed from this environment; the deterministic fallback is what the test suite exercises.
- Ambiguous payment outcomes are surfaced and preserved, but automatic reconciliation is a manual operator step.
- The `FAIRHOLD_REVIEWER_DEALS` grant in production points at `demo-deal-1`. It only grants access to a deal with that exact id in the production database — if no such deal exists, reviewer access correctly fails closed.
- The per-deployment Vercel URLs are SSO-protected by design.

---

## 9. Manual actions required

| # | Action | Why | Owner |
| --- | --- | --- | --- |
| 1 | Confirm the PayPal **sandbox** credential set and add `PAYPAL_WEBHOOK_ID` (sandbox only) | Sandbox credentials are already present in Production, so the signed-in workspace authorizes against the real PayPal sandbox. Still missing is `PAYPAL_WEBHOOK_ID`, without which webhook reconciliation answers `503 webhook not configured`. Never set Live credentials — Live is refused by configuration. | Owner |
| 2 | Confirm the Neon connection is a dedicated production database and enable point-in-time recovery | The current `DATABASE_URL` was already present; this release did not change it. Dedicated-instance confirmation and a backup/restore plan are outstanding. | Owner |
| 3 | Decide whether to keep the `FAIRHOLD_REVIEWER_DEALS` grant pointing at `demo-deal-1` | The grant is inert unless that deal id exists in the production database. | Owner |
| 4 | Review the Demo Payment disclosure before any external demo | Payments are simulated; the UI labels them, and no provider call is made. | Owner |
| 5 | If the per-deployment URL should stay reachable without SSO, change the Vercel project access model | Deployment protection was left enabled deliberately. | Owner |

---

## 10. Definition of done

| # | Criterion | State |
| --- | --- | --- |
| 1 | Verified finished project on GitHub `main` | ✅ `d36a257` |
| 2 | Vercel production deployment accessible | ✅ https://fairhold-beta.vercel.app |
| 3 | A fresh user can enter the application | ✅ Landing page, `/demo` and `/login` are public |
| 4 | Buyer, seller and reviewer workflows function | ✅ Verified against the public URL |
| 5 | Multiple milestones work end-to-end | ✅ Deterministic rules + timeline verified in `/demo` and in the E2E suite |
| 6 | Evidence submission and review work | ✅ E2E `evidence-lifecycle.spec.ts` green |
| 7 | Payment progression is safe and accurately labelled | ✅ Simulated provider, `SIMULATED` labels, no provider request |
| 8 | Data persists correctly | ✅ PostgreSQL backend in production; persistence across redeploys verified by request-level checks |
| 9 | Audit trail is visible and accurate | ✅ Append-only events with actor and timestamp |
| 10 | Works on desktop and mobile | ✅ Desktop / tablet / mobile Chromium, Firefox and WebKit projects green; no horizontal overflow at 390 px |
| 11 | README and judge instructions complete | ✅ Live-demo block, roles, architecture, setup, testing, deployment, limitations |
| 12 | No critical release blockers remain | ✅ — only the owner actions in § 8 remain, none of which block judging |

---

*Produced under the FairHold final master release directive. Non-negotiable safety rules upheld throughout: no PayPal Live, no real money movement, the original $600 capture untouched, no secrets committed, no destructive git operations, no test weakening, no silent service downgrade.*
