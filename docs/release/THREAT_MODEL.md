# FairHold Threat Model

**Scope:** Milestone-based payment coordination platform.
**Product principle:** AI proposes. Rules decide. Humans approve. PayPal executes. The audit trail records everything.
**Trust boundary:** Server-side deterministic rules + human approvals are authoritative. Client-side state, AI outputs, and webhook payloads are never authoritative.

---

## 1. Threat scenarios

| # | Threat | Affected component | Existing protection | Severity | Status |
|---|---|---|---|---|---|
| T1 | Malicious buyer submits forged capture request or tampers with amount | `app/deals/actions.ts` capture path | Amounts re-derived server-side from stored milestones; client FormData never supplies amount | Critical | PASS |
| T2 | Malicious seller / buyer impersonates another role via client state | Session + `canAccessDeal` | HttpOnly signed session cookie; server-side role and deal-membership checks on every action | Critical | PASS |
| T3 | Compromised / expired demo session used to approve captures | `lib/auth/session-token.ts`, `session.ts` | HMAC-signed JWT-like token, 8h max age, timing-safe compare, allowlist-gated identities | High | PASS |
| T4 | Unauthorized reviewer bypasses deal grant | `authorizeReviewerDeal` | Explicit per-deal reviewer grant checked server-side | High | PASS |
| T5 | Duplicate capture request creates double accounting | `beginPaymentOperation`, idempotency keys `capture:<deal>:<milestone>` | Idempotency key uniqueness; PayPal-Request-Id dedupe | Critical | PASS |
| T6 | Concurrent captures exceed authorized amount | `planCapture`, capture cap enforced at two layers | `capturedCents` reconciliation; `finalCapture` cap; DB row locks | High | PASS |
| T7 | Forged / replayed webhook moves milestones | `webhook-endpoint.ts`, `verify-webhook-signature` | Signature verification (fails closed), `UNIQUE(provider,event_id)` dedupe, webhook cannot trigger captures — records evidence only | Critical | PASS |
| T8 | Ambiguous timeout treated as failed capture → blind retry | `lib/payments/paypal.ts` capture | `PENDING` on timeout/ambiguous; no blind retry; reconciliation required | High | PARTIAL (design-level: no automated reconciliation) |
| T9 | Webhook approved capture with no human approval | `recordMilestoneApproval` gate | `capture_completed` webhook records evidence only; milestone transitions via human `planApproval` | Critical | PASS |
| T10 | Client-supplied payment amount trusted | Actions layer | Amounts always server-derived; FormData never carries amount | Critical | PASS |
| T11 | AI approves evidence / authorizes payment / overrides rules | `lib/ai/advisory.ts` | Advisory-only prompts; structured output validation; AI never changes deal state; human `planApproval` gate | Critical | PASS |
| T12 | Demo mode invokes real PayPal | `lib/payments/demo.ts`, `paymentRuntime()` | Demo provider makes no network calls; `simulated:true`; runtime fails closed without real config | Critical | PASS |
| T13 | Secrets in client bundle / logs / error messages | `readPayPalConfig`, `readDatabaseUrl` | Server-only; values never returned to responses; provider errors truncated/sanitized | High | PASS |
| T14 | Webhook amplification / large body allocation | `webhook-endpoint.ts` | `Content-Length` pre-check + streamed read with 1MB hard byte cap | Medium | PASS |
| T15 | SQL injection | `lib/data/postgres/*` | Parameterized queries throughout; no string interpolation of user input | High | PASS |
| T16 | Malicious evidence / file upload escape | `readEvidenceFile`/`deleteEvidenceFile` | Key shape validation (`evidence/<name>`), `dirname` re-check, server-generated UUID names, `nosniff` + `attachment` | Medium | PASS |
| T17 | Prompt injection / malicious AI input | `lib/ai/advisory.ts` | Structured input/output schemas; malformed responses rejected; fallback on failure | Medium | PASS |
| T18 | Public demo abuse / SSO bypass | Vercel Deployment Protection | Protection left enabled; demo isolated; no real credentials in demo | Medium | BLOCKED (owner action to scope protection for demo) |
| T19 | Placeholder credentials accepted as real | `lib/payments/config.ts` | Broadened placeholder detection; real creds must be ≥12 chars | Medium | PASS |
| T20 | No production session secret | `lib/auth/session-token.ts` | Throws if `FAIRHOLD_SESSION_SECRET` missing in ALL envs (fallback removed) | Critical | PASS |

---

## 2. Security boundaries

- **Authorization boundary:** Every mutating server action calls `requireDealAccessOrRedirect` (or equivalent) before any state check or write. Client-side UI visibility is never the only enforcement.
- **Payment boundary:** No client input can create, authorize, capture, void, or refund. PayPal operations execute server-side only.
- **AI boundary:** AI output is advisory, validated, and labelled. AI cannot transition deal/milestone state, approve evidence, or execute capture.
- **Demo boundary:** `/demo` uses localStorage, deterministic rules, simulated payments, zero PayPal calls. Demo and real modes never share storage.
- **Webhook boundary:** Webhook verification fails closed (503/400/4xx). Webhook events are evidence only; business transitions require human approval.

---

## 3. Design-level limitations (accepted, not patched)

These require product decisions or external infrastructure:

1. **Demo identity strength** — name-only allowlist (`authorizeDemoLogin`). Sufficient for a hackathon demo; not production authentication.
2. **Ambiguous-capture reconciliation** — timeouts become `PENDING`; no automated provider query to reconcile. Operator reconciliation step documented.
3. **Webhook rate limiting** — no IP-based rate limit or token caching on the webhook endpoint.
4. **Webhook payload retention** — full verified PayPal event stored verbatim with no TTL or redaction.

---

## 4. Verification method

Each threat above is covered by existing unit tests (`lib/**/*.test.ts`) and/or Playwright journeys (`tests/*.spec.ts`). See `PHASE_07_SECURITY_AUDIT.md` for exact test names and results.
