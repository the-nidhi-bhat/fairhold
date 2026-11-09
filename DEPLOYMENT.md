# Deployment

FairHold is a Next.js 16 application. It runs anywhere Node runs, but two constraints decide whether a deployed instance is honest:

1. **Evidence files and the JSON store need a writable filesystem.** Serverless filesystems are read-only, so a deployed instance needs PostgreSQL (`DATABASE_URL`) plus object storage for evidence files.
2. **The payment adapter needs PostgreSQL to be real.** With credentials but no `DATABASE_URL`, `paymentRuntime()` deliberately stays on the demo provider and reports `sandboxRequiresPostgres`.

A deployment that has neither is a demo deployment: it works for browsing, and every payment action is labelled simulated.

## What a deployment needs

| Requirement | Why | State in this build |
| --- | --- | --- |
| Hosted PostgreSQL | Persistence, webhook processing, payment ledger | Not provisioned |
| `DATABASE_URL` | Selects the PostgreSQL backend | Not set |
| `FAIRHOLD_SESSION_SECRET` | Required in production, throws when missing | Not set |
| `FAIRHOLD_DEMO_BUYERS` / `_SELLERS` / `_REVIEWERS` | Login allowlists | Not set |
| `FAIRHOLD_REVIEWER_DEALS` | Per-deal reviewer grants | Not set |
| `PAYPAL_ENV=sandbox` + id + secret + webhook id | Real sandbox payments and webhook verification | Not set |
| `AI_API_KEY` + `AI_MODEL` | Live advisory | Not set |
| Public HTTPS URL registered as a PayPal webhook listener | Webhook delivery | Not configured |
| Evidence storage | Files are written to local disk today | Not addressed |

Because the evidence store is local-disk, a PostgreSQL-only deployment still loses uploaded files on redeploy. Treat storage as a known gap, listed in [RELEASE_CHECKLIST.md](./RELEASE_CHECKLIST.md).

## Build

```bash
npm ci
npm run build
npm run start        # serves the production build on :3000
```

The build must complete before any deployment attempt; a failing build is not a deployment problem to work around.

## Vercel

### Current linkage

- The Vercel CLI is installed and authenticated (`vercel whoami`).
- The project exists as `fairhold` in team `thenidhibhat-6721s-projects`
  (`prj_vdIpZADs1M7qk17mPs96ubFhcZJp`), linked locally through the gitignored
  `.vercel/project.json`.
- Framework preset: Next.js, auto-detected output directory and build command.
  The first deployment used the "Other" preset and published `public/`, which
  404'd every route; that was fixed on the project, not worked around.
- **A preview deployment is Ready.** It is not a production deployment and it is
  not publicly reachable: Vercel Deployment Protection
  (`all_except_custom_domains`) returns a 302 to Vercel SSO for anonymous
  requests.
- **No production deployment has been created.** The production environment
  scope is empty. The project's very first (broken) deployment still owns the
  `fairhold-beta.vercel.app` alias; replacing or deleting it is an owner action.
- Deployment protection was deliberately left enabled. Removing an access
  control to make a demo public is not an acceptable trade.

### Linking an existing project

If a project already exists in the dashboard, link it rather than creating a duplicate:

```bash
vercel link            # choose the existing project
vercel env ls          # variable NAMES only — never print values into a terminal log or a commit
```

Set the required variables through the dashboard or `vercel env add`, then verify with `vercel env ls`. Do not paste secret values into a shell command that will be recorded in history.

### Deploying

```bash
vercel                 # preview deployment
vercel --prod          # production deployment, only with explicit approval
```

For a hackathon submission where production infrastructure is incomplete, a preview deployment is the honest option: it demonstrates the product without implying a production payment system.

### Post-deployment checks

| Check | Expected |
| --- | --- |
| Landing page | Renders with the hero, workflow sections and boundary statements |
| `/login` | Form loads; allowlisted name signs in |
| `/dashboard` | Renders for the signed-in role |
| `/deals/{id}` | Deal detail renders with its timeline |
| Console | No uncaught errors, no failed asset requests |
| Payment copy | Still says simulated when the demo adapter is active |
| `/api/paypal/webhook` | Returns `503 webhook not configured` when no webhook id is set — that is correct, not a bug |

Serverless note: because `DATABASE_URL` is unset, any write attempt on Vercel will fail at the filesystem. Read-only browsing of the landing page and login works; creating a deal does not. Do not present that as a working deployment of the product.

## Environment configuration for a real deployment

```bash
# Database
DATABASE_URL=postgresql://...
npm run db:migrate

# Session
FAIRHOLD_SESSION_SECRET=<long random value>

# Demo allowlists (replace with real identity before real use)
FAIRHOLD_DEMO_BUYERS=<comma-separated>
FAIRHOLD_DEMO_SELLERS=<comma-separated>
FAIRHOLD_DEMO_REVIEWERS=<comma-separated>
FAIRHOLD_REVIEWER_DEALS=<reviewer-name>:<deal-id>,...

# PayPal sandbox
PAYPAL_ENV=sandbox
PAYPAL_CLIENT_ID=<sandbox app client id>
PAYPAL_CLIENT_SECRET=<sandbox app secret>
PAYPAL_WEBHOOK_ID=<registered listener id>

# AI (optional)
AI_API_KEY=<key>
AI_MODEL=<model>
AI_API_URL=<optional OpenAI-compatible endpoint>
```

Register `https://<host>/api/paypal/webhook` on developer.paypal.com and subscribe it to the authorization and capture events the app normalises: `authorization_created`, `authorization_voided`, `capture_completed`, `capture_pending`. Copy the resulting listener id into `PAYPAL_WEBHOOK_ID`.

## Operational notes

- Migrations are forward-only; back up before applying.
- Evidence files are not in the database. A database backup alone is incomplete.
- `PENDING` payment operations require a human to reconcile against the provider; there is no scheduled job.
- Quarantined webhook events accumulate in `webhook_events` with a sanitised `reason`; they are the first place to look when a provider fact did not land.
- Rotating `FAIRHOLD_SESSION_SECRET` invalidates every demo session — acceptable, and the correct response to a leaked secret.

## Rollback

`vercel rollback` restores a previous deployment. Because there is no backward migration, a rollback that crosses a schema change requires restoring the matching database snapshot. Do not roll back across migration `0004` without one.
