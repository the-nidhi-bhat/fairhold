# STORYBOARD — FairHold (100 s, 12 scenes, 1920×1080)

Persistent layer: dark field, slow-drifting hairline grid, two low rose/blue
glows, and a bottom-right badge `DEMO MODE · SIMULATED PAYMENTS` that never
leaves the frame.

| # | Time | Scene | On screen | Motion |
|---|------|-------|-----------|--------|
| 1 | 0.0–7.0 | The problem | `01 / THE PROBLEM`; "Work ships. Payment stalls."; one line: scope drifts, approval is verbal, money moves before anyone agrees | Display type rises 26 px and fades; lede fades 0.1 s later |
| 2 | 7.0–14.0 | The product | `02 / THE PRODUCT`; "FairHold" wordmark with rose rule; "Milestone payments for work where both sides need proof."; four chips: Authorization hold / Evidence / Human approval / Provider capture | Rule wipes left→right; chips stagger up |
| 3 | 14.0–22.0 | Separation of duties | `03 / FIVE ACTORS`; five rows: AI proposes · Rules decide · Humans approve · PayPal executes · Audit trail records. Sub: "No single one can spend." | Rows stagger in 0.08 s apart |
| 4 | 22.0–30.0 | Agree | `04 / AGREE`; "Scope, split, sign off."; three milestone cards: Discovery workshop $1,800.00 · Design handoff $4,200.00 · Final delivery $2,000.00, total $8,000.00 | Cards rise; total fades last |
| 5 | 30.0–39.0 | Hold | `05 / HOLD`; "A hold. Not escrow."; amount $1,800.00 with `AUTHORIZED · HELD` badge; copy: funds reserved, not transferred | Amount scales 0.96→1 with fade; badge fades in |
| 6 | 39.0–48.0 | Prove | `06 / PROVE`; "Evidence, not vibes."; evidence panel: milestone *Design handoff*, note, link, submitted by seller, state `Submitted` | Panel rises as a block; rows stagger inside |
| 7 | 48.0–56.0 | Review | `07 / REVIEW`; "Accept it, or ask for exactly one change."; two cards: `Accepted` and `Revision requested` with a quoted change | Left card first, right card 0.12 s later |
| 8 | 56.0–64.0 | Approval gate | `08 / APPROVE`; "No approval, no capture."; blocked callout: `Capture blocked — no matching human approval`; copy: approval bound to milestone, amount and currency; stale approvals do not count | Callout lands with a single 0.5 s settle, no bounce |
| 9 | 64.0–73.0 | Execute | `09 / EXECUTE`; "Then the provider moves the money."; three steps: reserve the operation · capture the exact amount · record the result; note: one idempotency key, duplicate captures refused; note: provider call simulated in this build | Steps wipe in sequence; note fades last |
| 10 | 73.0–82.0 | Record | `10 / RECORD`; "Every fact gets a line."; seven event rows with times; copy: webhooks that do not match are quarantined, not guessed | Rows stagger 0.07 s; the quarantined row is the last to land |
| 11 | 82.0–91.0 | Advisory | `11 / ADVISORY`; "The model advises. It never decides."; advisory panel with summary + matched criteria; gate line: `Outcome decided by: rules + human approval`; small note: advisory source `deterministic fallback` | Panel first, gate line after 0.4 s |
| 12 | 91.0–100.0 | Close | Philosophy, verbatim, as five numbered rows: AI proposes. Rules decide. Humans approve. PayPal executes. The audit trail records everything. Footer: guided demo at `/demo`; sandbox payments simulated in this build | Rows land in order, 0.1 s apart; final hold |

## Cut-down (30 s)

Six scenes at 5 s each: 1 → 3 → 5 → 8 → 9 → 12. Same copy, same order, no
re-authoring: the 30 s version reuses the identical clips with retimed
`data-start`/`data-duration`.

## Editorial rules

- Never cut on a full-black frame; every cut lands on content.
- One idea per frame; nothing on screen competes with the headline.
- State colour only ever encodes a real state (green accepted, amber held,
  red blocked).
- No motion that implies money moved before the capture scene.
