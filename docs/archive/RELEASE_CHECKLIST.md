# Release checklist

> **Superseded (2026-11-13) — PayPal sandbox credentials.** The configuration rows in this file
> that mark the PayPal sandbox variables "Not set", and the item that records the live sandbox
> transaction as unverified because no credentials were configured, are **incorrect** as to the
> credentials. PayPal **sandbox** credentials (`PAYPAL_ENV`, `PAYPAL_CLIENT_ID`,
> `PAYPAL_CLIENT_SECRET`) **are** configured in the Production scope: they are inherited at
> **team** level, which is why a project-scoped `vercel env ls` does not list them for Production.
> The signed-in workspace therefore uses the **PayPal sandbox** provider — authorizing a deal there
> creates a **real order in the PayPal sandbox** that the buyer must approve in a PayPal sandbox
> account. PayPal **Live** remains architecturally impossible: `readPayPalConfig()` returns `null`
> unless `PAYPAL_ENV` is exactly `sandbox`, so no live adapter can be built and no live money can
> move. The guided `/demo` page is a separate, browser-only path that uses the in-app **simulated**
> provider and says so on screen. The *public webhook*, `PAYPAL_WEBHOOK_ID` and an approved +
> captured sandbox order remain outstanding. See
> [RELEASE_REPORT.md](../../RELEASE_REPORT.md) §2 and §8. The original text is retained below for
> history.

Status is evidence-based. Anything not executed is marked **Unverified** rather than assumed.

## Configuration

| Item | Required for | Status |
| --- | --- | --- |
| `npm install` completes | Everything | Verified |
| `FAIRHOLD_SESSION_SECRET` set | Production session signing | Not set in any environment |
| `FAIRHOLD_DEMO_BUYERS` / `_SELLERS` | Sign-in | Set for local and test runs only |
| `FAIRHOLD_DEMO_REVIEWERS` + `FAIRHOLD_REVIEWER_DEALS` | Reviewer access | Set for test runs only |
| `DATABASE_URL` | Persistence, webhook processing, real payments | Not set |
| `PAYPAL_ENV` + client id + secret | Real sandbox payments | Not set |
| `PAYPAL_WEBHOOK_ID` | Webhook verification | Not set |
| Public HTTPS webhook listener registered with PayPal | Webhook delivery | Not configured |
| `GEMINI_API_KEY` + `GEMINI_MODEL` | Live advisory | Not set |
| Evidence object storage | Deployed file uploads | Not implemented (local disk only) |

## Authentication

| Check | Status | Evidence |
| --- | --- | --- |
| Login with allowlisted name reaches the dashboard | Verified | Playwright, 3 viewports |
| Non-allowlisted name redirects to `?error=invalid` | Verified | Unit tests on the allowlist + manual check |
| Cookie is signed, expiring and tamper-rejected | Verified | Unit tests on session-token |
| Allowlist is re-checked on every read | Verified | Unit tests |
| Logout clears the session | Verified | Playwright |
| Production without `FAIRHOLD_SESSION_SECRET` throws | Verified | Unit test |
| Demo auth is labelled as non-verifying | Verified | Login page copy, README, SECURITY.md |
| Real identity provider | Not implemented | — |

## Database

| Check | Status | Evidence |
| --- | --- | --- |
| Migrations apply to a fresh PostgreSQL 16 database | Verified | Integration test run against `fairhold-pg-test` |
| Schema contract matches the TypeScript types | Verified | `schema-contract.test.ts` |
| Referential integrity and `CHECK` constraints hold | Verified | Migration definitions + integration tests |
| Transaction rollback on failure | Verified | Integration tests around the payment ledger and webhook inbox |
| Concurrent capture cannot double-spend | Verified at ledger level | Reservation arithmetic + unique keys |
| Existing JSON data can be imported | Verified | `validateDealForImport` + `db:import` script |
| Backup and restore drill | Not performed | — |
| Evidence files included in backup | Not implemented | Files are outside the database |

## Payments

| Check | Status | Evidence |
| --- | --- | --- |
| Authorization, capture, void through the demo adapter | Verified | Playwright lifecycle + unit tests |
| Capture arithmetic (`planCapture`) | Verified | Unit tests |
| Reservation before provider call | Verified | `recordApprovalAction` order + ledger tests |
| Approval recorded only on confirmed success | Verified | Code path + tests |
| Timeout and network failure yield `PENDING` | Verified | Adapter unit tests with injected transport |
| Duplicate approval refused | Verified | Playwright + rules tests |
| Webhook HTTP contract | Verified | Endpoint tests with injected deps |
| Webhook signature decision table | Verified | Unit tests |
| Duplicate webhook delivery | Verified | Integration test on the inbox |
| Reconciliation of `PENDING` operations | Not automated | Manual operator step |
| Live PayPal sandbox transaction | **Unverified** | No credentials or webhook id |
| Partial capture at milestone granularity | Verified | Arithmetic + demo flow |
| Refund | Not implemented | Out of scope |

## AI

| Check | Status | Evidence |
| --- | --- | --- |
| Deterministic fallbacks | Verified | Unit tests |
| Schema validation and clamping | Verified | Unit tests |
| Fallback on non-2xx, bad JSON, timeout | Verified | Unit tests with injected fetch |
| No write path from advisory to state or payment | Verified | Import boundaries + code review |
| Live provider call | **Unverified** | No `GEMINI_API_KEY` |
| Prompt regression / evaluation harness | Not implemented | — |

## Security

| Check | Status |
| --- | --- |
| Role and participant checks on every action | Verified |
| Evidence download refuses non-participants with `404` | Verified |
| Upload type sniffing, size cap, filename sanitisation | Verified |
| SQL injection surface (parameterised queries only) | Reviewed; no string-concatenated SQL |
| XSS surface (no HTML from model or evidence text) | Reviewed |
| CSRF posture (server actions, `sameSite=lax`) | Reviewed |
| Secrets not committed; `.env*` gitignored | Verified |
| Rate limiting | Not implemented |
| CSP / security headers | Not implemented |
| Dependency audit in CI | Not implemented |
| Penetration test | Not performed |

## Quality

| Check | Status | Result |
| --- | --- | --- |
| `npm run typecheck` | Verified | Pass |
| `npm run lint` | Verified | Pass |
| `npm run build` | Verified | Pass |
| `npm test` with isolated PostgreSQL | Verified | 172 pass, 0 fail, 0 skip |
| `npm test` without test database | Verified | 148 pass, 24 skip (integration suites) |
| `npm run test:e2e` | Verified | 9 pass, 3 viewports |
| Firefox | Not available | — |
| WebKit | Not available | — |
| Automated accessibility audit (axe) | Not wired | Manual keyboard/focus/contrast review |
| Lighthouse | Not run | — |
| Physical device testing | Not performed | Emulation only |

## Documentation

| Document | Status |
| --- | --- |
| `README.md` | Written; hero asset referenced by relative path |
| `ARCHITECTURE.md` | Written |
| `DATABASE.md` | Written |
| `API_REFERENCE.md` | Written |
| `PAYMENT_FLOW.md` | Written |
| `AI_DESIGN.md` | Written |
| `SECURITY.md` | Written |
| `SETUP.md` | Written |
| `USER_GUIDE.md` | Written |
| `TESTING.md` | Written |
| `DEPLOYMENT.md` | Written |
| `DEMO_GUIDE.md` | Written |
| `RELEASE_CHECKLIST.md` | This file |
| `CHANGELOG.md` | Written |
| `QA_REPORT.md` | Written |
| `HANDOFF.md` | Written |
| Mermaid diagrams render on GitHub | To be confirmed in the pushed branch view |

## Deployment

| Check | Status |
| --- | --- |
| Production build succeeds locally | Verified |
| Repository linked to a Vercel project | Not linked |
| Required production variables present in Vercel | Not set |
| Preview deployed and checked | Not performed |
| Production deployed | Not performed |
| Public HTTPS webhook listener reachable | Not configured |

## Git

| Check | Status |
| --- | --- |
| Branch | `feat/deal-milestone-foundation` |
| Working tree reviewed file by file | Yes |
| No secrets or `.env` staged | Yes |
| Meaningful commits | Yes |
| Pushed to `origin` | See `HANDOFF.md` for the recorded result |
| Local HEAD equals remote HEAD | See `HANDOFF.md` |

## Sign-off rule

A release for a real audience needs, at minimum: real identity, PostgreSQL, object storage for evidence, sandbox-verified PayPal with a registered webhook listener, and a reconciliation procedure for `PENDING` operations. None of those are in place. This build is submission-ready as a **demonstration** of the structure of fair milestone payments, and must be described that way.
