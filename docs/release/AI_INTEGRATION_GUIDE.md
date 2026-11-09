# FairHold — AI Integration Guide

**Scope:** Advisory-only AI integration for milestone-based payment coordination. AI assists human reviewers; it never decides, approves, authorizes, or executes payments.

## 1. Principle

> "AI proposes. Rules decide. Humans approve. PayPal executes. The audit trail records everything."

AI is strictly advisory. Deterministic business rules and human approval remain authoritative at every step.

## 2. Architecture

```
┌─────────────┐      ┌──────────────────┐      ┌─────────────────┐
│   Seller    │      │      AI          │      │   Human         │
│ (submits    │─────▶│   advisory       │─────▶│   reviewer      │
│  evidence)  │      │   (summarize)    │      │   (decides)       │
└─────────────┘      └────────┬─────────┘      └────────┬────────┘
                             │                         │
                             ▼                         ▼
                    ┌─────────────────┐      ┌─────────────────┐
                    │ Deterministic   │      │   recordMilestone │
                    │ rules engine    │─────▶│   Approval        │
                    │ (planApproval)  │      │   (CAPTURE/VOID)  │
                    └─────────────────┘      └─────────────────┘
```

### Layers

| Layer | Responsibility | Key file |
|-------|---------------|----------|
| Advisory provider config | Reads `AI_API_KEY`/`AI_MODEL`; rejects placeholders | `lib/ai/advisory.ts` (`readAdvisoryProviderConfig`) |
| Milestone proposal | AI suggests milestone structure from agreement text | `resolveMilestoneProposal` |
| Evidence advisory | AI summarizes evidence against acceptance criteria | `resolveEvidenceAdvisory` |
| Output validation | Structured JSON parsing and bounds checking | `parseMilestoneProposal`, `parseEvidenceAdvisory` |
| Deterministic fallback | Runs when AI is unconfigured or fails | `deterministicMilestoneProposal`, `deterministicEvidenceAdvisory` |
| Approval gating | Human decision → payment plan via deterministic rules | `lib/domain/approval.ts` (`planApproval`) |

## 3. Provider configuration

| Variable | Purpose | Required? |
|----------|---------|-----------|
| `AI_API_KEY` | AI provider API key | Required for live AI |
| `AI_MODEL` | Model identifier | Required for live AI |
| `AI_API_URL` | Endpoint (defaults to OpenAI-compatible chat completions) | Optional |

`readAdvisoryProviderConfig` returns `null` when either key is missing or matches `/^your_/i`. When unconfigured, the deterministic fallback is used automatically — the application never crashes or silently fabricates AI output.

## 4. AI capabilities (advisory-only)

### 4.1 Milestone proposal (`resolveMilestoneProposal`)
- Input: deal agreement text (≤10,000 chars).
- Output: `{ title, description, acceptanceCriteria }`.
- System prompt: *"This advisory does not authorize payment or accept evidence."*
- The proposal is a suggestion only; a human reviewer must accept or revise it.

### 4.2 Evidence advisory (`resolveEvidenceAdvisory`)
- Input: acceptance criteria + evidence submissions (≤10,000 chars combined).
- Output: `{ summary, matchedCriteria: string[], concerns: string[] }`.
- System prompt: *"Do not decide or recommend acceptance: a human reviewer decides. This advisory never changes deal state."*
- The advisory summarizes and flags concerns; it never sets a review decision.

## 5. Advisory-only enforcement (mandatory)

AI **may**:
- Suggest milestone titles, descriptions, and acceptance criteria.
- Summarize evidence and identify matched criteria / concerns.
- Flag potential issues for human review.

AI **must never**:
- Approve or reject milestone evidence.
- Change payment status (`COMPLETED`, `PENDING`, `FAILED`, `VOIDED`).
- Authorize or execute a PayPal capture or void.
- Override buyer, seller, or reviewer permissions.
- Override deterministic domain rules (`planCapture`, `planApproval`).
- Fabricate payment provider references or transaction IDs.

### Enforcement mechanisms

1. **No mutation API** — `resolveMilestoneProposal` and `resolveEvidenceAdvisory` return plain data objects with no deal id, milestone id, approval action, or payment status. There is no code path for AI to write to deal state.
2. **Structured validation** — `parseMilestoneProposal` and `parseEvidenceAdvisory` reject malformed or incomplete responses (null return → deterministic fallback).
3. **Deterministic fallback** — On any fetch failure, parse failure, invalid schema, or missing config, the system falls back to deterministic logic. AI failure never blocks the core workflow.
4. **Human approval gate** — `planApproval` requires an explicit human `"approve"` decision on a `CAPTURE`/`VOID` recommendation before any payment action is planned. AI output is never an input to `planApproval`.
5. **Advisory labelling** — Every advisory result carries a `source: "ai" | "deterministic"` field so the UI can label AI-assisted content.

## 6. Privacy and input boundaries

- Only agreement text, acceptance criteria, and evidence submission text are sent to the model.
- No secrets, credentials, payment provider references, or personal data are included in AI requests.
- Requests use a 15-second timeout with `AbortSignal`.
- Provider failures are caught and fall back to deterministic output.

## 7. What is NOT implemented (honest limits)

- Live AI verification — **NOT VERIFIED** (no `AI_API_KEY`/`AI_MODEL` configured; deterministic fallback is live).
- AI-driven automatic evidence acceptance/rejection — intentionally not implemented.
- AI-initiated payment — intentionally not possible.
- Multi-model or agentic workflows — not part of the product scope.

## 8. Owner actions to enable live AI verification

1. Obtain an AI provider API key and model identifier.
2. Set `AI_API_KEY` and `AI_MODEL` (and optionally `AI_API_URL`).
3. Verify that AI-generated proposals/advisories are displayed with `source: "ai"` and labelled as advisory.
4. Verify the deterministic fallback still works when the provider is unavailable.

Until a key is provided, AI integration status is **IMPLEMENTED (code), deterministic fallback live, NOT VERIFIED (live provider)**.

## 9. Meaningful AI + PayPal connection

FairHold demonstrates the connection through a single user journey:

1. Seller submits milestone evidence.
2. AI summarizes the evidence against acceptance criteria (advisory).
3. Human reviewer reads the AI advisory and independently decides accept/revise.
4. On human acceptance of a `CAPTURE` recommendation, deterministic rules validate the authorization cap.
5. Only then does PayPal capture execute (sandbox adapter or simulated demo provider).
6. The audit trail records: AI advisory (source), human decision, deterministic rules result, provider outcome.

AI influences the human reviewer but never decides; PayPal executes only after human + rules authorization.

## 10. Test coverage

| Test file | Coverage |
|-----------|----------|
| `lib/ai/advisory.test.ts` | Provider output usage, invalid-output fallback, valid structured response, parser rejection/acceptance, deterministic fallback |
| `lib/payments/paypal-crossworkflow.test.ts` | AI advisory → human approval → capture gate, advisory-only boundaries, demo isolation |
| `lib/domain/approval.test.ts` | `planApproval` human-decision gating, reject never triggers payment |

Run: `FAIRHOLD_TEST_DATABASE_URL=… FAIRHOLD_SESSION_SECRET=… npm test`
