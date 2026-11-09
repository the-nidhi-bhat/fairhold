# FairHold — three-minute hackathon demo script

Spoken script for a three-minute live demo. Word count is ~430, which is about
three minutes at a calm pace; the bracketed beats are timing cues, not lines to
read aloud. Every claim below is implemented in this repository; nothing in the
script claims a live payment, escrow, or a verified sandbox.

**Before you start:** open the deployed preview if it is reachable, otherwise run
`npm run dev` and open `http://localhost:3000/demo`. Have `/demo` already loaded
and the launch video paused at its first frame. Do not open a second browser
window — the guided demo persists to `localStorage` in the window you use.

---

## 0:00 — The problem

**[Hook. No slides.]**

"Two freelancers agree on $8,000 of work. The work ships. Then someone waits
three weeks for a bank transfer — or pays up front and hopes.

FairHold is the missing layer: milestone-based payment coordination with a real
audit trail.

The rule we built it around is one sentence: **AI proposes. Rules decide. Humans
approve. PayPal executes. The audit trail records everything.** No single one of
those can spend money."

## 0:25 — The core mechanic

"Before work starts, the buyer's card is *authorized* — funds are held, not
moved. That is a hold, not escrow. FairHold never claims to hold money, because
PayPal does not offer that to a marketplace. Saying otherwise would be a lie a
judge could catch in one question."

## 0:40 — Guided demo, scene one

**[Click: Simulate authorization hold on the first milestone.]**

"Here is the deal: three milestones, $1,800, $4,200 and $2,000. Watch the money
summary. Nothing has been captured. The state is *authorized and held* — and the
event log already records who did it and when.

This is the demo mode, and it says so: every payment here is simulated. The app
never calls PayPal from this page; a test fails if any request so much as
mentions PayPal."

## 1:00 — Evidence

**[Switch to the seller view. Open the second milestone. Submit evidence.]**

"The seller submits a note, a link and a file. That creates a submission, not a
payment.

The buyer can accept it, or ask for a specific change — which is what most real
disputes are: *please fix the 1280 breakpoint*. Revision is a first-class state,
not an email thread."

## 1:25 — The gate

**[Back to the buyer. Click Approve recommendation.]**

"Notice what the AI did. It read the criteria and returned an advisory: two
submissions, the responsive criteria matched, and — this matters — the source is
the deterministic fallback, because no model provider is configured in this
build. It recommends; it has no authority.

The capture runs only after a human approval exists. The same engine refuses a
second capture, refuses an amount that does not match the approval, and refuses a
timeout as proof that nothing moved — a timeout is an unknown, and unknowns get
reconciled, not assumed."

## 1:55 — The audit trail

**[Scroll the activity log.]**

"Every transition lands in one append-only log: proposal, hold, submission,
revision, approval, capture outcome. A webhook that does not match an approval,
an amount or a stored authorization is quarantined with a reason and still
acknowledged — a fact we cannot use does not get retried forever."

## 2:15 — What is real, what is not

**[Point at the simulated label.]**

"Being precise about status: the lifecycle, the rules, the rounding — integer
cents, no floating point — the authorization, capture, reconciliation and
webhook quarantine are implemented and covered by 193 unit tests and 24 browser
journeys. A live PayPal sandbox run is **not** verified: that needs credentials
and a public webhook this environment does not have. So this demo never pretends
a simulated capture is real money."

## 2:35 — Close

**[Optional: play the first ten seconds of the launch video.]**

"Milestone payments where the AI advises, the rules constrain, a human decides,
the provider executes, and every step is written down. That is FairHold — and
the audit trail is the product."

---

## Delivery notes

- Say "hold, not escrow" out loud at least once. It is the most common
  misunderstanding and the most likely judge question.
- If asked what is missing: refunds, multi-currency, real accounts, monitoring.
  All four are listed with evidence in `FINAL_REMAINING_WORK.md`.
- If the deployed preview redirects to a Vercel login page, say so plainly and
  run the local demo instead. Do not claim public access that has not been
  verified.
- Do not narrate the launch video's simulated capture as a real payment.
