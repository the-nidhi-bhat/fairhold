# SCRIPT — FairHold (on-screen copy, no voice-over)

No narration track exists in this build: no TTS provider credentials are
available. The video is designed to be read, so every line below is on screen
long enough to be read once (minimum 4 s per sentence).

## 1 — The problem (0:00)

> 01 / THE PROBLEM
> **Work ships. Payment stalls.**
> Scope drifts, approval is verbal, and the money moves before anyone agrees it should.

## 2 — The product (0:07)

> 02 / THE PRODUCT
> **FairHold**
> Milestone payments for work where both sides need proof.
> *Authorization hold · Evidence · Human approval · Provider capture*

## 3 — Five actors (0:14)

> 03 / FIVE ACTORS
> **Five actors. One separation of duties.**
> 01 AI proposes
> 02 Rules decide
> 03 Humans approve
> 04 PayPal executes
> 05 The audit trail records everything
> No single one can spend.

## 4 — Agree (0:22)

> 04 / AGREE
> **Scope, split, sign off.**
> Discovery workshop $1,800.00
> Design handoff $4,200.00
> Final delivery $2,000.00
> Agreed total $8,000.00 · USD · integer cents

## 5 — Hold (0:30)

> 05 / HOLD
> **A hold. Not escrow.**
> $1,800.00
> AUTHORIZED · HELD
> The buyer authorizes the milestone amount. Funds are reserved, not transferred. No money moves here.

## 6 — Prove (0:39)

> 06 / PROVE
> **Evidence, not vibes.**
> Design handoff · Submitted
> Note — Responsive build with 768 and 1024 breakpoints.
> Link — example.com/fairhold/handoff
> Files — handoff-v2.zip
> Submitted by Jamie Seller · 14:02

## 7 — Review (0:48)

> 07 / REVIEW
> **Accept it, or ask for exactly one change.**
> Accepted — scope matches the criteria, evidence is reviewable.
> Revision requested — "Please add the 1280 breakpoint."

## 8 — Approve (0:56)

> 08 / APPROVE
> **No approval, no capture.**
> Capture blocked — no matching human approval
> A capture needs a human approval bound to this milestone, this amount and this currency. A stale approval does not count.

## 9 — Execute (1:04)

> 09 / EXECUTE
> **Then the provider moves the money.**
> 01 Reserve the operation
> 02 Capture the exact amount
> 03 Record the result
> One operation, one idempotency key. A duplicate capture is refused, not repeated.
> Provider call simulated in this build.

## 10 — Record (1:13)

> 10 / RECORD
> **Every fact gets a line.**
> 14:02 authorization created
> 14:02 evidence submitted
> 14:09 evidence accepted
> 14:09 approval recorded
> 14:10 capture completed
> 14:11 capture_pending — kept pending, not failed
> 14:12 unknown event — quarantined
> A webhook that does not match is quarantined, not guessed.

## 11 — Advisory (1:22)

> 11 / ADVISORY
> **The model advises. It never decides.**
> Advisory — Evidence includes 2 submissions. Matched criteria: responsive breakpoints at 768 and 1024.
> Outcome decided by: rules + human approval
> Advisory source: deterministic fallback (no model provider configured)

## 12 — Close (1:31)

> AI proposes. Rules decide. Humans approve. PayPal executes. The audit trail records everything.
> Guided demo at /demo
> Sandbox payments are simulated in this build. A real capture requires configured provider credentials.
