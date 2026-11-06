# User guide

FairHold coordinates a piece of work between a buyer and a seller. Work is split into milestones. The seller submits evidence. The buyer reviews it. A human approves. Payment progress follows the approval, not the other way round.

Two people, two jobs:

| Role | Cares about | Sees |
| --- | --- | --- |
| Buyer | "Is the work actually done, and should I release this milestone?" | Deals they are the client on, evidence awaiting review, capture controls |
| Seller | "Have I delivered, and has it been accepted?" | Deals they are the freelancer on, milestones to submit against, revision requests |

A third role, **reviewer**, can act on specific deals they have been granted. Reviewers are never granted access by default.

## Signing in

Open `/login`, enter a display name and choose a role.

- The name must be allowlisted on the server for that role. If it is not, the form returns to `/login?error=invalid` — this is a server decision, not a client check.
- No account is created. There is no password.
- **Demo authentication is not production identity verification.** It proves you know an allowlisted name, nothing more.

Try `Alex Buyer` as buyer, or `Jamie Seller` as seller, when the demo store is seeded.

## Creating a deal

1. Choose **New deal**.
2. Fill in the title, the buyer's name, the seller's name, and the agreement text.
   - Title: 3–120 characters.
   - Names: up to 80 characters.
   - Agreement: 20–20,000 characters. This is the text both sides are agreeing to; write it as if a third party will read it later, because they will.
3. Submit. The deal is created in `Draft` and you land on its detail page.

Names matter: the buyer's name and the seller's name determine who can see the deal. They are matched case-insensitively against the signed-in session, so `Alex Buyer` and `alex buyer` are the same participant.

## Adding milestones

A deal needs at least one milestone before it can be authorized.

For each milestone you provide:

| Field | Rule |
| --- | --- |
| Title | 3–120 characters |
| Description | Up to 2,000 characters |
| Amount | A positive amount in USD. `90`, `90.5` and `$1,200.00` are all accepted and stored as integer cents. |
| Due date | Optional, formatted `YYYY-MM-DD` |
| Acceptance criteria | At least 10 characters — the written standard the evidence will be judged against |

Write acceptance criteria a stranger could check. "Looks good" is not a criterion; "the checkout button submits the form and shows a confirmation panel" is.

Milestones can be added while the deal is `Draft` or `Awaiting Agreement`. Once the deal is authorized, the milestone set is fixed.

## Moving a deal through its states

```
Draft → Awaiting Agreement → Ready for Authorization → Authorized → In Progress → Awaiting Review → Completed
                                                                 ↘ Disputed → In Progress / Cancelled
```

- Sellers and reviewers move the deal along the manual transitions.
- **`Authorized` cannot be set manually.** It is reachable only through the payment adapter, which is why it is absent from the status control.
- A deal in `Completed`, `Disputed` or `Cancelled` behaves differently: cancelled and disputed deals refuse new milestones, and the recommendation engine starts returning `VOID` or `DISPUTE` instead of `CAPTURE`.

## Authorizing the payment

When the deal is `Ready for Authorization` and has milestones:

1. The buyer selects **Authorize**.
2. The amount is the sum of the milestone amounts — the buyer does not type it.
3. In demo mode, the authorization completes immediately and is labelled **simulated**. No PayPal request was made.
4. In sandbox mode, the buyer is sent to PayPal to approve an order, then confirms. Only the confirmed result marks the deal authorized.

**An authorization is a hold, not a payment.** It reserves an amount; it does not transfer money, and it is not escrow. FairHold does not hold funds at any point.

## The seller's loop: submitting evidence

Open the deal, find your milestone, and submit evidence. At least one of these is required:

- A note (up to 1,000 characters)
- A URL (`http` or `https`, up to 500 characters)
- A file

File rules:

| Rule | Value |
| --- | --- |
| Allowed extensions | `png`, `jpg`, `jpeg`, `pdf`, `txt`, `md`, `csv` |
| Maximum size | 3 MB |
| Type detection | From the file's actual bytes, not its extension or the browser-reported type |

If the sniffed type is not a supported image, PDF or text file, the upload is refused. Renaming a `.zip` to `.png` will not get past it.

### After a rejection

If the buyer rejects the submission with a note, the milestone stays open and the seller can submit again. Each submission is kept, so the history shows what was sent and what was rejected — the rejection note is the instruction, so read it as the next revision's brief.

## The buyer's loop: reviewing evidence

Evidence awaiting review appears on the dashboard and on the deal.

1. Download the evidence and check it against the written acceptance criteria. The download is authorised server-side; a non-participant receives `404`, not the file.
2. Choose **Accept** or **Reject**.
   - Accept records the decision.
   - Reject records the decision plus a note. The note is what makes the rejection actionable.
3. Reviewing is not approving. Acceptance makes the milestone eligible; approval is the separate step that can move money.

## Approving a milestone (the step that can capture)

Approval is where a human decision and a payment action meet, and it is deliberately narrow.

When the buyer (or a granted reviewer) opens the approval control, FairHold first computes a recommendation from stored state:

| Recommendation | Meaning |
| --- | --- |
| `CAPTURE` | Evidence was accepted, the deal is authorized, the deadline has not passed. |
| `VOID` | The deal or milestone was cancelled. |
| `DISPUTE` | The milestone is disputed, or the latest submission was rejected and never re-accepted. |
| `HOLD` | Something is unresolved: no evidence, nothing accepted, deal not authorized, deadline passed, already processed. |

Then:

- **Reject** is always allowed and never touches payment.
- **Approve** is allowed only for `CAPTURE` and `VOID`. Approving a `HOLD` or `DISPUTE` is refused — a human must resolve it first.

On approval with `CAPTURE`, FairHold:

1. Computes what remains of the authorization.
2. Refuses the capture if the milestone amount exceeds the remainder.
3. Reserves the operation so two approvals cannot spend the same money.
4. Calls the provider.
5. Records the approval — **only if the provider confirmed it**.

So the ordering is: reserve, call, confirm, record. A timeout leaves the operation `PENDING` and no approval is recorded. Nothing in the UI shows a captured payment that the provider did not confirm.

### What the payment states mean

| State | What to do |
| --- | --- |
| Authorization: simulated | Demo mode. No PayPal request exists. |
| Authorization: PayPal sandbox | A sandbox hold exists. Still not escrow, still not a capture. |
| Buyer approval pending (PayPal sandbox) | The buyer has not approved the order yet. No authorization exists. |
| Payment: completed | The provider confirmed a capture with a reference. |
| Payment: pending / unsettled | Ambiguous. Do not retry; reconcile against the provider. |
| Payment: failed | The provider refused. No money moved. |

## The activity timeline

Every deal shows its audit events in order: deal created, milestones created, evidence submitted, authorizations, reviews, approvals, captures. The timeline is what actually happened, read from stored rows — it is not reconstructed or embellished. Users cannot edit it.

## Revision history

Accepted and rejected submissions both remain visible. A rejection followed by a resubmission reads as a revision: what was asked for, what was sent, and when it was accepted.

## Common problems

| Symptom | Cause |
| --- | --- |
| Login returns to the form with an error | The name is not on the allowlist for that role. |
| "Authorize" fails | The deal is not `Ready for Authorization`, or has no milestones. |
| "Nothing was captured" | The milestone amount exceeds the remaining authorization, or the provider refused. |
| A second approval does nothing | The milestone was already processed — the recommendation is `HOLD` with `ALREADY_PROCESSED`. |
| Upload refused | Wrong extension, over 3 MB, or the bytes are not a supported type. |
| Evidence link 404s | The session is not a participant of that deal, or the stored file is missing. |
| Reviewer sees nothing | No `reviewer-name:deal-id` grant exists for that deal. |
