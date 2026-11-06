# API reference

FairHold has two HTTP routes. Every other mutation is a Next.js **server action**, callable only from the application's own forms and always re-authenticated server-side.

Authenticated requests are identified by the `fairhold_session` cookie (HMAC-signed; see [SECURITY.md](./SECURITY.md)).

---

## `GET /api/evidence/{dealId}/{evidenceId}`

Streams a stored evidence file to a participant of the deal.

**Authorisation:** session required; `canAccessDeal(session, deal)` must pass. A reviewer must additionally hold an explicit `reviewer:dealId` grant.

| Outcome | Status | Body |
| --- | --- | --- |
| No session, no deal, not a participant, unknown evidence, or evidence without a file | `404` | `Not found` (deliberately identical for every case, so the route does not disclose existence) |
| Stored file cannot be read | `404` | `Evidence file unavailable` |
| Success | `200` | File bytes |

Success headers:

```
Content-Type: <type sniffed at upload — never the client-supplied type>
Content-Disposition: attachment; filename*=UTF-8''<percent-encoded name>
X-Content-Type-Options: nosniff
```

**Example**

```bash
curl -i --cookie "fairhold_session=<signed token>" \
  http://localhost:3100/api/evidence/8f2c4a1e-6b3d-4f7a-9c21-5d0e7b4a3c10/c3f6e9a4-5b70-4d12-a043-9e8c7d6f5a23
```

---

## `POST /api/paypal/webhook`

Receives PayPal sandbox notifications. Fail-closed by design: anything it cannot verify or understand is either retried by PayPal (`5xx`) or quarantined with a reason (`2xx`).

**Required transmission headers** (all five, else `400`):

`paypal-transmission-id`, `paypal-transmission-time`, `paypal-cert-url`, `paypal-auth-algo`, `paypal-transmission-sig`

**Limits:** body must be readable and at most 1,000,000 characters.

| Condition | Status | Body |
| --- | --- | --- |
| Missing config or `PAYPAL_WEBHOOK_ID` | `503` | `{"error":"webhook not configured"}` |
| Data backend is not PostgreSQL | `503` | `{"error":"webhook processing requires PostgreSQL"}` |
| Body unreadable | `400` | error text |
| Body too large | `413` | error text |
| Any transmission header missing | `400` | `missing transmission headers` |
| Malformed JSON | `400` | error text |
| Payload lacks a string `id` | `400` | `invalid event payload` |
| Signature verification could not complete | `500` | `webhook verification failed` — PayPal retries, validity is unknown |
| Signature definitively invalid | `400` | `invalid webhook signature` — never retried |
| Event processing threw | `500` | `webhook processing failed` — PayPal retries |
| Accepted | `200` | `{"received":true,"outcome":"processed" \| "duplicate" \| "unsupported" \| "quarantined"}` |

`GET` returns `405 Method not allowed`.

Processing outcomes:

- `processed` — the event matched a stored deal, authorization, approval or operation and was applied.
- `duplicate` — the event id was already processed; nothing changed.
- `unsupported` — an event type FairHold does not act on; ignored with a reason.
- `quarantined` — a recognised event that could not be reconciled (amount mismatch, unknown authorization, no matching human approval, conflicting capture id, …). Committed and answered `200` so PayPal stops retrying; an operator reads `webhook_events.reason`.

**Logging:** one sanitised line per request — event id, type, outcome, status, and a reason for quarantined or unsupported events. Headers, signatures, payloads and secrets are never logged.

---

## Server actions

All actions live in `app/deals/actions.ts` and `app/login/actions.ts`. They run on the server, read the session cookie themselves, and re-check role and deal access on every call. Two response styles exist:

- **Redirect actions** — `Promise<void>`; failures redirect to `/deals/{dealId}?actionError=<code>`.
- **Form-state actions** — `Promise<FormState>`; failures return `{ ok: false, errors: { field: message } }` for inline display.

### `actionError` codes

| Code | Meaning |
| --- | --- |
| `role` | Signed in, but the role may not perform this action. |
| `forbidden` | Not a participant of this deal. |
| `invalid_status` | Submitted status is unknown, or `Authorized` was submitted manually. |
| `invalid_transition` | The state machine refuses the transition. |
| `not_found` | Deal or milestone no longer exists. |
| `no_milestones` | Authorization requires at least one milestone. |
| `no_pending_authorization` | Confirmation attempted without a sandbox order. |
| `sandbox_unavailable` | Confirmation attempted while the demo provider is active. |
| `provider` | The provider refused the request, or the request failed. |

### Deal and milestone actions

| Action | Form fields | Roles | Behaviour |
| --- | --- | --- | --- |
| `createDealAction` | `title`, `clientName`, `freelancerName`, `currency`, `agreement` | buyer, seller | Validates (title 3–120, names ≤ 80, agreement 20–20,000, USD only), creates a `Draft` deal, revalidates, redirects to the new deal. |
| `addMilestoneAction` | `dealId`, `title`, `description`, `amount`, `dueDate`, `acceptanceCriteria` | buyer, seller | Parses `amount` into integer cents (`90`, `90.5`, `$1,200.00`), validates, refuses when the deal is terminal or already authorized. |
| `updateMilestoneAction` | as above + `milestoneId` | buyer, seller | Same validation; updates an existing milestone. |
| `changeMilestoneStatusAction` | `dealId`, `milestoneId`, `status` | seller, reviewer | Must satisfy the milestone state machine. |
| `changeDealStatusAction` | `dealId`, `status` | seller, reviewer | `Authorized` is rejected outright; only the adapter may set it. |

### Payment actions

| Action | Form fields | Roles | Behaviour |
| --- | --- | --- | --- |
| `authorizeDealAction` | `dealId` | buyer, reviewer | Deal must be `Ready for Authorization` with ≥ 1 milestone. Amount is the sum of milestone amounts. Sandbox: stores a pending order and stops until the buyer approves in PayPal. Demo: completes in one simulated step. A failed real request is never downgraded to simulated. |
| `confirmAuthorizationAction` | `dealId` | buyer, reviewer | Requires a pending sandbox order and a sandbox provider; calls `authorizeOrder` with request id `fairhold-confirm-{dealId}` and marks the deal authorized only when the provider returns a reference. |
| `recordApprovalAction` | `dealId`, `milestoneId`, `decision` (`approve` \| `reject`), `note` | buyer, reviewer | Recomputes the recommendation from stored state; rejects `approve` on `HOLD`/`DISPUTE`; plans the capture against the remaining authorization; reserves the operation; calls the provider; writes the ledger; records the approval only on success. |

### Evidence actions

| Action | Form fields | Roles | Behaviour |
| --- | --- | --- | --- |
| `submitEvidenceAction` | `dealId`, `milestoneId`, `note`, `url`, `file` | seller, reviewer | At least one of note/url/file; extension allowlist (`png jpg jpeg pdf txt md csv`); ≤ 3 MB; content type from magic numbers; sanitised filename. Buyers may not submit evidence. |
| `reviewEvidenceAction` | `dealId`, `submissionId`, `decision` (`accepted` \| `rejected`), `reviewNote` | buyer, reviewer | Records the decision; a rejection with a note is what drives the seller's revision loop. |

### Session actions

| Action | Form fields | Behaviour |
| --- | --- | --- |
| `loginAction` | `name`, `role` | Trims the name (≤ 100), requires `buyer \| seller \| reviewer`, requires an allowlist match; on failure redirects to `/login?error=invalid`; on success sets the signed cookie and redirects to `/dashboard`. |
| `logoutAction` | — | Clears the cookie and redirects to `/`. |

### Validation error keys

Field errors use the submitted field name (`title`, `clientName`, `freelancerName`, `agreement`, `amount`, `dueDate`, `acceptanceCriteria`, `note`, `url`, `file`). Form-level errors use the `_form` key.

---

## Conventions

- Money is integer cents everywhere. The only place a decimal string exists is the form input and `lib/domain/format.ts`.
- Currency is always `USD`.
- Actor strings are `{role}:{name}`, for example `buyer:Alex Buyer`.
- Idempotency keys follow `capture:{dealId}:{milestoneId}` and `void:{dealId}:{milestoneId}`.
- No endpoint accepts a provider reference, recommendation or payment status from the client. Those are always recomputed server-side.
