# Demo guide

A repeatable run-through for judges and reviewers. Everything here works with no PayPal credentials and no AI key, and every payment step is labelled **simulated** because no provider request is made.

## Before you start

```bash
npm install
npm run demo:reset
npm run dev
```

Environment for the demo:

```bash
FAIRHOLD_SESSION_SECRET=<any long local value>
FAIRHOLD_DEMO_BUYERS=Alex Buyer
FAIRHOLD_DEMO_SELLERS=Jamie Seller
FAIRHOLD_DEMO_REVIEWERS=Morgan Reviewer
FAIRHOLD_REVIEWER_DEALS=Morgan Reviewer:8f2c4a1e-6b3d-4f7a-9c21-5d0e7b4a3c10
```

`npm run demo:reset` refuses to run when `DATABASE_URL` is set, so the fixture can never overwrite real data.

## The seeded fixture

| Item | Value |
| --- | --- |
| Deal | `Website redesign — milestone agreement` |
| Deal id | `8f2c4a1e-6b3d-4f7a-9c21-5d0e7b4a3c10` |
| Buyer | `Alex Buyer` |
| Seller | `Jamie Seller` |
| Deal status | `Ready for Authorization` |
| Milestone 1 | `Design system and component library` — $1,200.00, due in 7 days, `In Progress`, one pending submission with a URL |
| Milestone 2 | `Responsive build and handoff` — $800.00, due in 21 days, `Draft`, no evidence |
| Payment | none — `authorization: null`, no payment operations |

Total authorization would be $2,000.00 (120000 + 80000 cents).

The fixture deliberately starts at `Ready for Authorization` so the demo can reach the payment step in seconds, and it ships one pending submission so the buyer has something to review immediately.

## The ten-minute script

### 1. The problem, stated plainly (30s)

Open the landing page. Read the hero: *Work moves forward. Payments move with proof.* Then point at the boundary chips — human approval required, demo payments simulated, AI advisory only. Those three chips are the product's honesty statement, not decoration.

### 2. Sign in as the buyer (1m)

`/login` → `Alex Buyer` → role **Buyer**. Note the page says demo authentication is not identity verification, and that names must be allowlisted server-side.

The dashboard shows the buyer's queue: a submission awaiting review, the deal, and the payment summary.

### 3. Look at the deal before any money exists (1m)

Open the deal. Point out:

- The milestone timeline with real states.
- The payment status reads **Not authorized** — the UI will not claim a hold that does not exist.
- The activity timeline: deal created, two milestones created, evidence submitted.

### 4. Review the pending evidence (1m)

Download the evidence link and show that a non-participant would get `404`, not the file. Then **Reject** with a note such as "Tokens are not documented yet; add the review link." The milestone stays open and the rejection is now the seller's brief.

### 5. Sign in as the seller and revise (1.5m)

Sign out, sign in as `Jamie Seller`. The dashboard now shows a rejected submission and the milestone that needs work.

Open the deal and submit new evidence — upload any small `.pdf` or `.png` under 3 MB, or a note plus URL. Then, as a bonus, try uploading a file with a disallowed extension or over 3 MB to show the validation refusing it.

### 6. Accept as the buyer (30s)

Back as `Alex Buyer`. Accept the new submission. Acceptance alone moves no money — say that out loud, because it is the point.

### 7. Authorize the deal (1m)

Still as the buyer: **Authorize**. In demo mode this completes in one step and is labelled **simulated — no PayPal request was made**. The amount is $2,000.00, computed from the milestones; nobody typed it.

Explain the sandbox behaviour that is deliberately different: with real credentials the deal would stay unauthorized while the buyer approves an order at PayPal, and only the confirmed result would mark it authorized.

### 8. Approve a milestone and watch the ledger (2m)

Open the approval control on the design milestone. Show the recommendation and its reason codes — deterministic, from stored state. Approve.

- The milestone becomes completed.
- The capture is `simulated`, reserving then recording the operation.
- The payment history shows $1,200.00 captured and $800.00 remaining.

Approve the second milestone: $800.00, and because it consumes the remainder the request is sent as a final capture.

### 9. Try to pay twice (1m)

Approve the first milestone again. The recommendation is `HOLD` with `ALREADY_PROCESSED`, and approving it is refused. That refusal is the double-payment protection working, not a UI quirk.

### 10. Close on the boundaries (30s)

- Authorization is a hold, never escrow.
- AI advised; a human approved; the rules engine decided; the adapter executed.
- A timeout would have been `PENDING`, not success.
- The audit trail is what actually happened.

## Reset between runs

```bash
npm run demo:reset
```

That rewrites `.data/fairhold.json`. Stop the dev server first only if you want a cold start; it is not required.

With PostgreSQL instead of the JSON store, reset by truncating and re-importing in an isolated database. Never run the reset script against a database you care about — it deliberately refuses.

## The revision scenario on its own

If you are short on time, this 90-second slice is the strongest single demonstration:

1. Buyer rejects the pending submission with a note.
2. Seller submits again.
3. Buyer accepts.
4. Buyer approves; payment is captured (simulated).
5. Buyer tries to approve again; refused.

It shows the loop that the whole product exists for: evidence, human judgement, revision, approval, payment, and the refusal of a duplicate.

## Common demo failures

| Symptom | Cause | Fix |
| --- | --- | --- |
| Login bounces back with "not allowlisted" | Name typo, or the allowlist env var is missing/not reloaded | Restart the dev server with the variables set; names are matched case-insensitively after trimming |
| Dashboard is empty | Fixture not seeded, or the deal's participant name does not match the session | Run `npm run demo:reset`, sign in as exactly `Alex Buyer` or `Jamie Seller` |
| Authorize says the deal is not ready | Someone advanced the status earlier and did not reset | `npm run demo:reset` |
| "Nothing was captured" | The milestone amount exceeds the remaining authorization (approvals spent it already) | Reset and follow the order above |
| Upload refused | Extension outside `png jpg jpeg pdf txt md csv`, over 3 MB, or bytes that do not sniff as a supported type | Use a real small PDF/PNG |
| Second approval appears to do nothing | Expected — the milestone is already processed | Explain it, do not click twice |
| Reviewer sees no deals | No grant, or the grant uses the wrong deal id | Set `FAIRHOLD_REVIEWER_DEALS` and restart |
| Page is slow on first hit | Dev-mode route compilation | Warm each route once before presenting |
| Nothing renders after a schema change | Stale `.data` fixture | `npm run demo:reset` |

## What not to claim while demoing

- Do not call the authorization escrow, or say funds are protected.
- Do not say the payment was captured by PayPal in demo mode.
- Do not say the AI reviewed or approved the evidence.
- Do not say the demo login verifies identity.
- Do not quote a production URL unless a deployment was actually made from this branch — see [DEPLOYMENT.md](./DEPLOYMENT.md).
