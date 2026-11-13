# BRIEF — FairHold launch video

## Intent

Promo (sell), not a site tour. The video must make one argument legible in 100
seconds: milestone payments fail when approval and money movement are the same
act, and FairHold separates them.

## Source of truth

Everything on screen is taken from the shipped build in this repository:

- `PAYMENT_FLOW.md` — hold/capture/void semantics, quarantine reasons,
  idempotency, ambiguous outcomes.
- `lib/domain/rules.ts`, `lib/domain/status.ts` — the transition rules a human
  cannot bypass.
- `lib/ai/advisory.ts` — advisory shape (`summary`, `matchedCriteria`,
  `concerns`) and the deterministic fallback.
- `app/deals/[id]/page.tsx` — payment state, "Costs and limits".
- `components/demo-experience.tsx` — the browser-only guided demo.

No metric, customer, logo, integration or provider capability is invented.

## Constraints (non-negotiable)

1. **Simulated money is never shown as a real capture.** A persistent badge
   reads `DEMO MODE · SIMULATED PAYMENTS` for the whole runtime, and the capture
   scene says the provider call is simulated in this build.
2. **No escrow claim.** The hold is described as an authorization hold that
   reserves funds; the video says "not escrow" explicitly.
3. **No AI authority.** The model output is called an advisory and the gate that
   follows is labelled rules + human approval.
4. **Live sandbox status is not claimed.** The closing frame states that sandbox
   payments are simulated in this build and that real captures require
   configured provider credentials.
5. Fee honesty: no FairHold platform fee exists in this build. The video never
   shows a platform fee line.

## Audience

Hackathon judges and a technical buyer. They will distrust a video that
overclaims faster than one that is precise, so precision is the aesthetic.

## Deliverables

- `renders/fairhold-launch.mp4` — 1920×1080, 30 fps, 100 s.
- `renders/fairhold-launch-30s.mp4` — 30 s cut.
- `renders/thumbnail.png` — closing-frame still.
- `captions/fairhold-launch.srt` — transcript of on-screen copy.
- `SCRIPT.md`, `STORYBOARD.md`, `index.html` (source).

## Look

Editorial fintech: near-black `#08090b`, warm off-white `#f4f1ec`, one rose
accent `#d76a79`, semantic green/amber/red used only for state. Monospaced
labels, tight display type, hairline borders, no glassmorphism, no gradient
soup, no stock footage.

## Audio

Silent by design (`music: none`). No TTS or music provider credentials are
available in this environment; adding a track is a one-line change once a
licence exists.
