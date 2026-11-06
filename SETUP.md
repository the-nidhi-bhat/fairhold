# Setup

## Prerequisites

| Requirement | Version used here | Notes |
| --- | --- | --- |
| Node.js | 24.13.0 (20+ supported) | `node --test` and `--env-file-if-exists` are used by the scripts. |
| npm | bundled with Node | Only npm is used; there is no lockfile for another package manager. |
| PostgreSQL | 16 | Required for integration tests and for webhook processing. Optional for the demo. |
| Docker | optional | Used to run an isolated test database on port 55432. |

## Install

```bash
npm install
```

Runtime dependencies are `next`, `react`, `react-dom` and `pg`. Nothing else is required to run the demo.

## Environment

Copy `.env.example` to `.env` and fill in what you need. Never commit `.env`.

### Minimum for the local demo

```bash
FAIRHOLD_SESSION_SECRET=any-long-random-string-for-local-use
FAIRHOLD_DEMO_BUYERS=Alex Buyer
FAIRHOLD_DEMO_SELLERS=Jamie Seller
FAIRHOLD_DEMO_REVIEWERS=Morgan Reviewer
```

`FAIRHOLD_SESSION_SECRET` is only strictly required in production, where its absence throws. Set it anyway so a locally issued cookie is not interchangeable with another checkout's.

Without `DATABASE_URL`, data lives in `.data/fairhold.json` and evidence files in `.data/evidence/`. Both are gitignored.

### Full variable reference

| Variable | Required | Default / behaviour |
| --- | --- | --- |
| `NODE_ENV` | no | `development` locally. Production enables the secure cookie flag and the session-secret requirement. |
| `NEXT_PUBLIC_APP_URL` | no | Canonical URL used for metadata and absolute links. |
| `DATABASE_URL` | production only | Switches persistence to PostgreSQL. No silent fallback when set. |
| `FAIRHOLD_TEST_DATABASE_URL` | test only | Dedicated database for integration tests. Never point it at development data. |
| `FAIRHOLD_SESSION_SECRET` | production | HMAC secret for the demo session cookie. |
| `FAIRHOLD_DEMO_BUYERS` | yes for login | Comma-separated allowlist. |
| `FAIRHOLD_DEMO_SELLERS` | yes for login | Comma-separated allowlist. |
| `FAIRHOLD_DEMO_REVIEWERS` | only for reviewers | Comma-separated allowlist. |
| `FAIRHOLD_REVIEWER_DEALS` | only for reviewers | `reviewer-name:deal-id` pairs, comma-separated. |
| `PAYPAL_ENV` | only for sandbox | Must be exactly `sandbox`. Any other value keeps the demo adapter. |
| `PAYPAL_CLIENT_ID` | only for sandbox | Placeholder values (`your_…`) are rejected. |
| `PAYPAL_CLIENT_SECRET` | only for sandbox | Same placeholder rule. |
| `PAYPAL_WEBHOOK_ID` | only for webhooks | Registered listener id from developer.paypal.com. |
| `AI_API_KEY` | no | Enables live advisory calls. |
| `AI_MODEL` | no | Model name for advisory calls. |
| `AI_API_URL` | no | Defaults to `https://api.openai.com/v1/chat/completions`. |
| `AUTH_SECRET` | not read by the current build | Reserved. |
| `PAYMENT_CONDITIONS_SIGNING_SECRET` | not read by the current build | Reserved. |

Reserved variables are listed so nobody assumes the presence of a signature they do not have; the code does not read them today.

## Database

### Create a database

```bash
createdb fairhold
export DATABASE_URL=postgresql://user:password@127.0.0.1:5432/fairhold
```

### Apply migrations

```bash
npm run db:migrate
```

Migrations are forward-only and idempotent in effect: each creates its objects if absent. `0001` through `0004` must be applied in order.

### Import existing JSON demo data

```bash
npm run db:import
```

This validates the JSON with `validateDealForImport` before writing, so a malformed demo file fails loudly instead of producing partial data.

### Isolated test database

```bash
docker run -d --name fairhold-pg-test \
  -e POSTGRES_USER=fairhold \
  -e POSTGRES_PASSWORD=<local-only-password> \
  -e POSTGRES_DB=fairhold_test \
  -p 55432:5432 \
  postgres:16-alpine
```

Then:

```bash
export FAIRHOLD_TEST_DATABASE_URL=postgresql://fairhold:<local-only-password>@127.0.0.1:55432/fairhold_test
npm test
```

The integration suites create and clean their own rows. Do not reuse a development or production database for this.

## Run locally

```bash
npm run demo:reset    # seed the demo deal (refuses to run when DATABASE_URL is set)
npm run dev           # http://localhost:3000
```

Sign in at `/login` as `Alex Buyer` (buyer) or `Jamie Seller` (seller). To sign in as a reviewer, add the grant first:

```bash
FAIRHOLD_REVIEWER_DEALS="Morgan Reviewer:8f2c4a1e-6b3d-4f7a-9c21-5d0e7b4a3c10"
```

## Scripts

| Script | Command | Purpose |
| --- | --- | --- |
| `dev` | `next dev` | Development server with Turbopack. |
| `build` | `next build` | Production build. |
| `start` | `next start` | Serve the production build. |
| `lint` | `eslint` | Lint with `eslint-config-next`. |
| `typecheck` | `next typegen && tsc --noEmit` | Generate route types, then type-check. |
| `test` | `node --test "lib/**/*.test.ts"` | Unit and integration tests. |
| `test:e2e` | `playwright test` | Browser journeys (desktop, mobile, tablet Chromium). |
| `demo:reset` | `node scripts/demo-reset.mjs` | Rewrite the JSON demo store. |
| `db:migrate` | `node --env-file-if-exists=.env scripts/db-migrate.mjs` | Apply migrations. |
| `db:import` | `node --env-file-if-exists=.env scripts/db-import-json.mjs` | Import the JSON store into PostgreSQL. |

## Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| Login redirects to `/login?error=invalid` | The name is not on the allowlist for that role. | Check spelling and the comma-separated list; names are compared case-insensitively after trimming. |
| `FAIRHOLD_SESSION_SECRET is required in production.` | Production build without the secret. | Set it in the hosting environment, not in the repository. |
| Data disappears between requests | `DATABASE_URL` set but the database is unreachable and an error is being swallowed by a client retry — or the JSON store directory is not writable (serverless hosts). | Check the server log; the facade deliberately does not fall back. |
| Deal creation fails on a deployed server | Serverless filesystem is read-only and `DATABASE_URL` is unset. | Configure PostgreSQL. |
| Evidence upload rejected | Extension not in `png jpg jpeg pdf txt md csv`, file over 3 MB, or the bytes do not sniff as a supported type. | Re-export the file; the sniffed type is authoritative. |
| Webhook returns `503 webhook not configured` | `PAYPAL_WEBHOOK_ID` missing or still a placeholder. | Register the listener and set the id. |
| Webhook returns `503 webhook processing requires PostgreSQL` | `DATABASE_URL` unset. | Webhook processing requires durable storage. |
| Integration tests skip | `FAIRHOLD_TEST_DATABASE_URL` unset. | That is intentional — skipped, never silently passed. |
| Playwright times out on a slow machine | Dev-mode route compilation on first hit. | The suite allows 90 s per test; warm the server once or use a production build. |
| Port already in use | A previous `next dev` is still running. | Stop it, or run `npm run dev -- --port 3100` to match the Playwright config. |
