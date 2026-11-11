# Phase 3 — Deployment Audit: Public Judge Demo

**Date:** 2026-11-09  
**Branch:** `feat/deal-milestone-foundation`  
**HEAD:** `d7623c8` (synced with `origin/feat/deal-milestone-foundation`)  
**Vercel project:** `fairhold` (`prj_vdIpZADs1M7qk17mPs96ubFhcZJp`, team `thenidhibhat-6721s-projects`)

## Current deployment state

### Deployments observed (via `vercel ls`)

| Deployment | URL | Target | Age | Status | Notes |
|---|---|---|---|---|---|
| `dpl_GWSE5VM6nv6jmD6x21xJ6HDVPu8p` | `https://fairhold-15cnlgak6-thenidhibhat-6721s-projects.vercel.app` | Preview | ~2m | Ready | Built from HEAD `d7623c8` via GitHub auto-deployment. Git-branch alias `https://fairhold-git-feat-deal-miles-e6b351-thenidhibhat-6721s-projects.vercel.app`. **Protected: anonymous `/demo` → 302 Vercel SSO.** |
| `dpl_ryCe3hEawuARLNgnSvKFUepUcibM` | `https://fairhold-1pxpwq2ia-thenidhibhat-6721s-projects.vercel.app` | Production | ~19m | Ready | Stale production build. Aliases include `fairhold-beta.vercel.app`, `fairhold-thenidhibhat-6721s-projects.vercel.app`, `fairhold-git-main-thenidhibhat-6721s-projects.vercel.app`. **Must not be modified or reassigned.** |
| `dpl_DjHoRHGtfUeZF91KW36YCaUd6d7f` | `https://fairhold-gpjdgtu59-thenidhibhat-6721s-projects.vercel.app` | Preview | ~26m | Ready | Previous Phase 2 closeout preview (HEAD `5c7f8f6`). Superseded by `fairhold-15cnlgak6`. |

### Environment variables (via `vercel env ls`)

Scope: `Preview` only. Production scope is empty.

| Name | Type | Environments |
|---|---|---|
| `FAIRHOLD_SESSION_SECRET` | Secret | Preview |
| `FAIRHOLD_REVIEWER_DEALS` | Config | Preview |
| `FAIRHOLD_DEMO_REVIEWERS` | Config | Preview |
| `FAIRHOLD_DEMO_SELLERS` | Config | Preview |
| `FAIRHOLD_DEMO_BUYERS` | Config | Preview |

No `DATABASE_URL`, `PAYPAL_*`, or `AI_*` variables are configured in either scope — consistent with demo-only operation.

## Anonymous access test

**Method:** `Invoke-WebRequest -UseBasicParsing -MaximumRedirection 0` against `https://fairhold-15cnlgak6-thenidhibhat-6721s-projects.vercel.app/demo`

**Result:** `302 Found` → `https://vercel.com/sso-api?url=...&nonce=...` with body "Protected by Vercel Authentication".

**Conclusion:** Deployment Protection is active on preview deployments. Anonymous visitors (judges without Vercel login) cannot reach `/demo`. **Public judge demo: BLOCKED.**

## Why the demo is blocked

Vercel Deployment Protection for this project is configured so that preview deployments require Vercel authentication. The protection mode (previously observed as `all_except_custom_domains`) means:
- Preview deployment URLs (`.vercel.app` deployment subdomains) → require login
- Custom domains → bypass protection

This cannot be changed via the Vercel CLI (no deployment-protection API endpoint exists in v65.2.0; `vercel curl` to the protection API returns `not_found`). It is a **Vercel dashboard-only setting**.

## What must NOT be changed (prohibitions honored)

- Do **not** globally disable Vercel Deployment Protection.
- Do **not** modify production deployment protection or settings.
- Do **not** delete, replace, or reassign the stale `fairhold-beta.vercel.app` alias.
- Do **not** create a production deployment merely to bypass preview protection.
- Do **not** provision paid infrastructure or services.

## Owner-only action: make the judge demo publicly accessible

The safest, narrowest change is to adjust Deployment Protection **for preview deployments only** (not production), or to add a bypass rule for the dedicated demo deployment. Exact dashboard steps:

1. Open **Vercel Dashboard** → Project `fairhold` → **Settings** → **Deployment Protection**.
2. Confirm protection is enabled for **Preview deployments** (do not touch Production).
3. Choose ONE of the following narrow options:
   - **Option A (recommended):** Add a **bypass rule** for the demo preview deployment URL `https://fairhold-15cnlgak6-thenidhibhat-6721s-projects.vercel.app` (or its git-branch alias) so anonymous visitors can reach `/demo` without SSO, while protection remains on for all other previews.
   - **Option B:** Temporarily disable protection for **Preview deployments only** during the judging window, then re-enable after. Production protection is untouched.
   - **Option C:** Add a **custom domain** to the demo deployment (protection is `all_except_custom_domains`, so custom domains bypass protection). Requires DNS configuration and is a larger change.
4. After the change, verify in a logged-out/incognito browser: `https://fairhold-15cnlgak6-thenidhibhat-6721s-projects.vercel.app/demo` should load without redirecting to `vercel.com/sso-api`.

## What is already verified (no owner action needed)

- HEAD `d7623c8` is deployed to the newest preview via GitHub auto-deployment (build exit 0, 10 routes incl. `/demo`).
- Local full gate green: typecheck 0, lint 0, unit 199/199, build 0, Playwright 27/27 (incl. demo journeys with PayPal-request guard).
- `/demo` is browser-only, deterministic, labelled `DEMO MODE · SIMULATED PAYMENTS`, makes **no PayPal calls** (Playwright guard fails if any request URL mentions PayPal), persists to localStorage only.
- Demo journeys: buyer, seller, reviewer all testable locally; demo isolation verified.

## Residual risks

- If the owner does not adjust protection, judges cannot access the public demo — the submission would rely on repository run instructions only.
- The production deployment (`fairhold-1pxpwq2ia`) and `fairhold-beta` alias remain stale and are owner decisions (out of scope for this phase).
- No hosted PostgreSQL, object storage, PayPal webhook, or AI key is configured — real-user mode and live sandbox verification remain blocked by configuration.

## Files changed in this phase

- `docs/release/PHASE_03_DEPLOYMENT_AUDIT.md` (this document, new)

No application code, deployment settings, protection config, or domain aliases were modified.

## Next step (owner decision needed)

Apply one of the narrow Deployment Protection changes above for the demo preview, then report back so I can verify anonymous access and complete Phase 3.
