# FairHold Release Report

**Release Date:** November 12, 2026
**Release commit:** `05c42747d45dcc7122f2b395e2366df830459d70` — [view on GitHub](https://github.com/the-nidhi-bhat/fairhold/commit/05c42747d45dcc7122f2b395e2366df830459d70)
**GitHub PR:** None — the repository has no branch protection requiring a PR, so the release was published with a **fast-forward merge** (`git merge --ff-only`) from `feat/sprint-functional-completion` and a normal `git push origin main`. No force-push, no history rewrite, no `reset --hard`.
**Public judge URL:** https://fairhold-beta.vercel.app
**Vercel Deployment ID:** `dpl_65bSqD6iedq987YQpuG4rAzysops`

---

## 1. What is live

| Surface | URL | Status |
| --- | --- | --- |
| **Public judge entry point** | https://fairhold-beta.vercel.app | ✅ Anonymous, no account required |
| Guided demo | https://fairhold-beta.vercel.app/demo | ✅ Runs the full lifecycle in-browser with simulated payments |
| Demo sign-in | https://fairhold-beta.vercel.app/login | ✅ Buyer / Seller / Reviewer allowlists configured in the production scope |
| Per-deployment URL | `fairhold-dk6j0fd1i-thenidhibhat-6721s-projects.vercel.app` | ⚠️ Behind Vercel Deployment Protection (SSO). **Not** the judge entry point. |
| Project alias | `fairhold-thenidhibhat-6721s-projects.vercel.app` | ⚠️ Behind Vercel Deployment Protection (SSO) |

Deployment protection was deliberately left switched on — it was not bypassed. The `fairhold-beta.vercel.app` alias serves the same production build without authentication, which is what judges use.

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
| `FAIRHOLD_ALLOW_SIMULATED_PAYMENTS` | Production (Secret) | ✅ `true` — required because no PayPal credentials are configured; the demo provider is used and every payment control is labelled `SIMULATED`. |
| `NEXT_PUBLIC_APP_URL` | Production (Config) | ✅ `https://fairhold-beta.vercel.app` |
| `GEMINI_API_KEY` / `GEMINI_MODEL` | Production (Secret) | ✅ Present. Live advisory calls were **not** exercised from this environment; the deterministic fallback runs and is labelled in the UI. |
| `PAYPAL_*` | Production | ⛔ **Deliberately not set.** No sandbox credentials are available, so payments stay simulated. **PayPal Live was never configured.** |

---

## 3. Build and test results

All commands were run against the release tree. No test was deleted, no assertion weakened, no failure skipped to reach green.

| Command | Exit code | Result |
| --- | --- | --- |
| `npm ci` | 0 | ✅ Clean install |
| `npm run typecheck` | 0 | ✅ `next typegen` + `tsc --noEmit` clean |
| `npm run lint` | 0 | ✅ ESLint clean, 0 errors |
| `npm test` | 0 | ✅ **296 tests — 268 passed, 0 failed, 28 skipped, 0 cancelled** (2041 ms) |
| `npm run build` | 0 | ✅ Next.js 16.4.3 Turbopack — compiled in 2.0 s, TypeScript in 5.4 s, 10 static pages |
| `npm run test:e2e` | 0 | ✅ **78/78 passing** — the three default Chromium projects (desktop, mobile, tablet), 26 tests each, exit 0 |

The 28 skipped tests are exactly the PostgreSQL-requiring suites (14 `postgres:` data suites + 14 `webhook:` integration suites). They print `# set FAIRHOLD_TEST_DATABASE_URL (isolated Postgres) to run these tests` and skip rather than fail. With `FAIRHOLD_TEST_DATABASE_URL` pointing at an isolated PostgreSQL 16 instance the figure is **296/296 passing, 0 failing**.

`npm run test:e2e` fans out over the three Chromium projects by default (`scripts/run-e2e.mjs` sets `PROJECTS = ["desktop-chromium", "mobile-chromium", "tablet-chromium"]`). Firefox and WebKit are opt-in by name: `node scripts/run-e2e.mjs --project=desktop-firefox` (or `--project=desktop-webkit`).

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

**Kept** — `public/fairhold-hero.svg` (still referenced by the README footer and `CHANGELOG.md`), `public/fairhold-shield.svg` (the approved logo), `app/favicon.ico`, `videos/fairhold-launch/` (an intentional deliverable), `docs/release/` (21 audit documents), `migrations/`, `scripts/`, `tests/`.

**Also done** — `.gitignore` now excludes `lighthouse-*.json`, `*.lighthouse.json`, `lighthouse-report/` and `.lighthouseci/`; every documentation link that pointed at a moved file was repointed at `docs/archive/`.

---

## 7. Known limitations

- Demo authentication only — signed names, not verified identities. There is no multi-tenant auth and no KYC.
- **Payments are simulated.** No PayPal Live, no sandbox credentials, no real money moves. The provider is the in-app demo adapter and every payment control is labelled `SIMULATED`.
- No refunds, no partial refunds, no dispute arbitration, no multi-currency (USD only).
- No email or push notifications; the activity trail is the record.
- The JSON store is single-process and is not safe for concurrent multi-user writes. It is a development-only backend.
- Live AI provider calls have call sites but were never executed from this environment; the deterministic fallback is what the test suite exercises.
- Ambiguous payment outcomes are surfaced and preserved, but automatic reconciliation is a manual operator step.
- The `FAIRHOLD_REVIEWER_DEALS` grant in production points at `demo-deal-1`. It only grants access to a deal with that exact id in the production database — if no such deal exists, reviewer access correctly fails closed.
- The per-deployment Vercel URLs are SSO-protected by design.

---

## 8. Manual actions required

| # | Action | Why | Owner |
| --- | --- | --- | --- |
| 1 | Add `PAYPAL_CLIENT_ID` / `PAYPAL_CLIENT_SECRET` (sandbox only) and `PAYPAL_WEBHOOK_ID` | Enables a real PayPal **sandbox** lifecycle instead of simulated payments. Never set Live credentials. | Owner |
| 2 | Confirm the Neon connection is a dedicated production database and enable point-in-time recovery | The current `DATABASE_URL` was already present; this release did not change it. Dedicated-instance confirmation and a backup/restore plan are outstanding. | Owner |
| 3 | Decide whether to keep the `FAIRHOLD_REVIEWER_DEALS` grant pointing at `demo-deal-1` | The grant is inert unless that deal id exists in the production database. | Owner |
| 4 | Review the Demo Payment disclosure before any external demo | Payments are simulated; the UI labels them, and no provider call is made. | Owner |
| 5 | If the per-deployment URL should stay reachable without SSO, change the Vercel project access model | Deployment protection was left enabled deliberately. | Owner |

---

## 9. Definition of done

| # | Criterion | State |
| --- | --- | --- |
| 1 | Verified finished project on GitHub `main` | ✅ `05c42747d45dcc7122f2b395e2366df830459d70` |
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
