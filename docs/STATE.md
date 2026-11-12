# FairHold — release state (2026-11-12)

## Branch
`main` at `38385906f21ac1daeb8ca159f2f0ef1827a4dbb8` — identical to `origin/main`.

History for this release (no force-push, no history rewrite, no `--reset --hard`):

```
3838590  chore: integrate final branding and release preparation
186147d  feat: premium shield logo branding
92a0615  chore(deps): sync package-lock.json for CI npm ci validation   <- previous origin/main
```

`feat/sprint-functional-completion` is preserved locally and remotely (it is the tip of
`main`, so nothing is lost). The repository has no branch protection requiring a pull
request, so the release was published with `git merge --ff-only` + `git push origin main`.

## Verified this release (evidence)
- `npm ci` → clean install completed (8 vulnerabilities: 7 moderate, 1 high — advisory only)
- `npm run typecheck` → exit 0
- `npm run lint` → exit 0
- `npm test` → 268 pass, 28 skip, 0 fail, exit 0 (28 PostgreSQL suites skip without
  `FAIRHOLD_TEST_DATABASE_URL`; with an isolated PostgreSQL 16 the figure is 296/296)
- `npm run build` → production build succeeds
- `npm run test:e2e` → 78/78 across the three default Playwright Chromium projects
  (desktop, mobile, tablet), 26 each, exit 0. Firefox and WebKit are opt-in by name
  (`node scripts/run-e2e.mjs --project=desktop-firefox`)
- Vercel production deployment `dpl_EdWck3xKW1vTeRCUPgfJuHfdPtgw` (Ready, target
  `production`) built from `githubCommitSha = 38385906f21ac1daeb8ca159f2f0ef1827a4dbb8`,
  identical to `origin/main`
- Production HTML verified to serve the approved shield branding:
  `<link rel="icon" href="/fairhold-shield.svg" type="image/svg+xml">` and navbar
  `<use href="/fairhold-shield.svg">`

## Repository curation (this release)
- Nine historical root documents moved to `docs/archive/`: `FAIRHOLD_STATE.md`,
  `FINAL_RELEASE_REPORT.md`, `FINAL_REMAINING_WORK.md`, `HANDOFF.md`, `QA_REPORT.md`,
  `TASKS.md`, `DECISIONS.md`, `RELEASE_CHECKLIST.md`, `DEMO.md` — plus a
  `docs/archive/README.md` index explaining what is archived and why.
- Deleted three unreferenced legacy branding files: `public/favicon.svg`,
  `public/shield-logo.svg`, `public/shield-wordmark.svg`.
- Kept `public/fairhold-hero.svg` (still linked from the README footer and CHANGELOG)
  and `public/fairhold-shield.svg` (the approved logo, integrated everywhere).
- `.gitignore` extended with Lighthouse output patterns (`lighthouse-*.json`,
  `*.lighthouse.json`, `lighthouse-report/`, `.lighthouseci/`).
- All documentation links repointed at `docs/archive/…`; `README.md` documentation
  index now leads with `RELEASE_REPORT.md` as the canonical current report.

## Branding
`public/fairhold-shield.svg` is the approved asset and is used for the favicon and the
navbar mark in `app/layout.tsx`. Red-and-black identity preserved.

## Safety corrections carried in this release
- `resolveDataBackend()` in `lib/data/db.ts` — production **requires** PostgreSQL;
  there is no silent JSON fallback. The only exception is an explicit, auditable
  operator pin (`FAIRHOLD_DATA_BACKEND=json`), honoured in production only when no
  real `DATABASE_URL` is configured, so it can never mask a configured database.
  The deployed production scope does not set it. Covered by regression tests in
  `lib/data/db.test.ts`.
- `getPaymentProvider()` — returns the demo provider when PayPal credentials are
  absent; no silent downgrade mid-flow, no PayPal Live path.
- No PayPal Live, no real money movement, the original $600 capture was not touched.

## External blockers (unchanged — do not wait on)
- PayPal sandbox credentials + public HTTPS webhook + `PAYPAL_WEBHOOK_ID`
  (sandbox lifecycle never executed here)
- Live Gemini calls (key not available in this environment; the deterministic fallback
  is labelled and tested)
- Hosted-PostgreSQL connectivity unverified from this environment
- Object storage for evidence files (currently local disk — does not survive a
  serverless redeploy)
- Production env scope incomplete: missing `FAIRHOLD_SESSION_SECRET`, `PAYPAL_*`,
  `NEXT_PUBLIC_APP_URL` and the demo allowlists → login and payment actions **fail
  closed** until an owner adds them (owner action; values never read here)
- Vercel Deployment Protection (SSO) on direct deployment URLs — left enabled by design

## Next action
Owner adds the production environment variables listed in `RELEASE_REPORT.md`
(§ Manual actions required), then the judge journey can be exercised against
production with real role logins.
