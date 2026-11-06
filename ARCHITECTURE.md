# Architecture

FairHold is a single Next.js application. Server components read state, server actions mutate it, and two HTTP routes exist for machine-to-machine traffic (evidence download and the PayPal webhook).

## Layering

```mermaid
flowchart TB
    subgraph Presentation
        Pages[app/**/page.tsx<br/>server components]
        Forms[Client form components<br/>milestone-forms · evidence-forms · new-deal-form]
    end
    subgraph Application
        Actions[app/deals/actions.ts<br/>app/login/actions.ts]
        Routes[app/api/**/route.ts]
    end
    subgraph Domain["Domain — pure, no I/O"]
        Status[status.ts<br/>state machines]
        Rules[rules.ts<br/>recommendations]
        Approval[approval.ts<br/>human gate]
        Evidence[evidence.ts<br/>validation]
        Workflow[workflow.ts<br/>dashboard summaries]
    end
    subgraph Infrastructure
        Auth[lib/auth]
        Data[lib/data facade]
        Pay[lib/payments]
        AI[lib/ai]
    end
    Pages --> Actions
    Forms --> Actions
    Pages --> Data
    Pages --> Auth
    Actions --> Domain
    Actions --> Data
    Actions --> Pay
    Actions --> Auth
    Routes --> Data
    Routes --> Pay
    Data --> Store[(JSON store)]
    Data --> PG[(PostgreSQL)]
    Pay --> PayPal[PayPal sandbox]
    AI --> Provider[LLM provider]
```

The dependency rule is one-directional: domain modules import only domain types; infrastructure modules may import domain; presentation imports both. No domain module performs I/O, which is why every rule is testable without a server, a database or a network.

## Directory map

| Path | Contents |
| --- | --- |
| `app/page.tsx` | Landing page: positioning, workflow, boundaries. |
| `app/login/` | Demo sign-in page and `loginAction` / `logoutAction`. |
| `app/dashboard/` | Role-framed workspace with Suspense skeleton, error and loading boundaries. |
| `app/deals/new/` | Deal creation form and action. |
| `app/deals/[id]/` | Deal detail: timeline, evidence, approvals, payment status. |
| `app/api/evidence/[dealId]/[evidenceId]/route.ts` | Authorised evidence download. |
| `app/api/paypal/webhook/route.ts` | Webhook entry point. |
| `app/deals/actions.ts` | Every deal mutation (651 lines, ten exported actions). |
| `lib/domain/` | State machines, rules, approval gate, evidence validation, formatting, dashboard summaries. |
| `lib/data/` | `index.ts` facade, `deals.ts` + `store.ts` (JSON), `postgres/` (SQL), `payment-operations.ts`, `storage.ts`. |
| `lib/payments/` | `provider.ts` contract, `runtime.ts` selection, `demo.ts`, `paypal.ts`, `capture-state.ts`, `transport.ts`, `webhook-endpoint.ts`. |
| `lib/ai/advisory.ts` | Advisory calls, schema validation, deterministic fallbacks. |
| `lib/auth/` | `session-token.ts` (HMAC), `session.ts` (cookie + `canAccessDeal`), `demo-allowlist.ts`. |
| `migrations/` | `0001_initial.sql` … `0004_payment_operations.sql`. |
| `tests/` | `evidence-lifecycle.spec.ts` — three journeys run across three device profiles. |
| `scripts/` | `demo-reset.mjs`, `db-migrate.mjs`, `db-import-json.mjs`. |

## Request flows

### Read path — deal detail

```mermaid
sequenceDiagram
    participant U as Browser
    participant P as app/deals/[id]/page.tsx
    participant A as lib/auth
    participant D as lib/data
    U->>P: GET /deals/:id
    P->>A: getDemoSession() — decode, verify HMAC, re-check allowlist
    P->>D: getDeal(id)
    alt no session, no deal, or not a participant
        P-->>U: notFound() — not-found UI
    else authorised
        P->>P: computeProgress, paymentStatusFor, paymentRuntime
        P-->>U: Suspense fallback, then the populated timeline
    end
```

The access check happens **before** the shell is streamed. An earlier build returned a blank streamed page when `notFound()` fired inside a Suspense child; the guard is now synchronous in the page body (see `DECISIONS.md`).

### Write path — booking a capture

```mermaid
sequenceDiagram
    participant U as Buyer
    participant S as recordApprovalAction
    participant R as rules + approval
    participant L as data.beginPaymentOperation
    participant V as provider.captureAuthorization
    participant DB as storage
    U->>S: decision=approve
    S->>R: recommendMilestone then planApproval
    R-->>S: action CAPTURE or refusal
    S->>S: planCapture(authorized, captured, requested)
    S->>L: reservation with idempotencyKey capture:deal:milestone
    alt reservation rejected
        L-->>S: throw
        S-->>U: "Nothing was captured."
    else reserved
        S->>V: captureAuthorization(requestId = idempotencyKey)
        alt COMPLETED
            V-->>S: ok, providerReference
            S->>DB: updatePaymentOperation(COMPLETED)
            S->>DB: recordMilestoneApproval(paymentStatus COMPLETED)
        else PENDING
            V-->>S: ambiguous
            S->>DB: updatePaymentOperation(PENDING)
            S-->>U: unsettled message, no approval recorded
        else FAILED
            V-->>S: refused
            S->>DB: updatePaymentOperation(FAILED)
            S-->>U: provider message, no approval recorded
        end
    end
```

The reservation exists so two concurrent approvals, or one double-submitted form, cannot spend the same authorization twice. The approval record is written **after** the ledger update, so an approval never claims a payment that did not happen.

## Design decisions

| Decision | Rationale | Trade-off |
| --- | --- | --- |
| Deterministic rules instead of model judgement | Money decisions must be reproducible and explainable. | The rule set is conservative and sometimes lands on `HOLD` where a human could obviously proceed. |
| One data facade, two backends | The demo must run with zero infrastructure; production must be transactional. | Both implementations must be kept signature-compatible, which is enforced by the shared `lib/data/index.ts` bindings. |
| Reservation before provider call | Atomicity without a distributed transaction. | A crash between reservation and update leaves a `RESERVED` row that needs manual reconciliation — but never a double spend. |
| Ambiguity is `PENDING`, not failure | A timeout is not evidence that money did not move. | Some captures stay unresolved until an operator checks the provider. |
| Money in integer cents | No floating point anywhere in the payment path. | Formatting must happen at the edges (`lib/domain/format.ts`). |
| CSS-only motion | No animation runtime, no hydration cost, trivial reduced-motion support. | No timeline-driven choreography; scroll effects are CSS-only. |
| Server actions instead of a REST API for mutations | Fewer moving parts, no client-side auth duplication. | Not consumable by third-party clients; the API surface is the two routes below. |
| Webhook quarantines commit and return 200 | Retrying an event that can never match would loop forever. | A quarantined event needs an operator to read the reason and act. |

## Runtime modes

| Mode | Selected when | Payment adapter | Persistence |
| --- | --- | --- | --- |
| Local demo | `DATABASE_URL` unset, `PAYPAL_ENV` not `sandbox` | `DemoPaymentProvider` | `.data/fairhold.json` |
| Local sandbox | `PAYPAL_ENV=sandbox` with credentials, `DATABASE_URL` set | `PayPalSandboxProvider` | PostgreSQL |
| Degraded | PayPal credentials present, `DATABASE_URL` unset | `DemoPaymentProvider`, with `sandboxRequiresPostgres` reported | JSON |
| Production | `DATABASE_URL` + `FAIRHOLD_SESSION_SECRET` + allowlists | As configured | PostgreSQL |

The degraded mode is deliberate: real provider calls require durable accounting, so credentials without a database never silently produce real-money operations.

## Evidence storage

Uploads are validated in the domain layer (extension allowlist, 3 MB cap, magic-number sniffing), then written through `writeEvidenceFile` with a sanitised name, and the stored path is recorded on the evidence row. Downloads go through the route handler, which re-derives authorisation from the session and the deal, then pins `Content-Type` to the sniffed type and sets `X-Content-Type-Options: nosniff` on an attachment response.

## Audit history

`audit_events` rows are appended by the data layer on deal creation, milestone creation/update/status change, evidence submission and review, authorization, approval and payment outcomes. The UI renders only recorded events, newest first. There is no client-side event synthesis: an empty history renders as empty.

## Boundaries worth restating

- The AI module has no write path to the database, the ledger or the provider.
- `allowedManualDealTransitions` removes `Authorized`, so a form cannot forge payment state.
- The webhook reconciles provider facts against records a human already created; it cannot create an approval.
- Live PayPal credentials are refused; only `PAYPAL_ENV=sandbox` activates the real adapter.
