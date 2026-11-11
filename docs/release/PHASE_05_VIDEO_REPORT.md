# Phase 5 — Launch Video Finalization & YouTube Submission Readiness

**Status:** COMPLETE (assets preserved; no re-render required)
**Date:** Mon Nov 09 2026
**Branch:** feat/deal-milestone-foundation
**HEAD:** d7623c8 (synced with origin/feat/deal-milestone-foundation)

## 1. Existing asset inventory

All assets verified present on disk:

| Asset | Path | Size | Duration | Format |
|---|---|---|---|---|
| Master video | `videos/fairhold-launch/renders/fairhold-launch.mp4` | 10,146,468 B (9.7 MB) | 100.0 s | MP4 / H.264 |
| 30-second cut | `videos/fairhold-launch/renders/fairhold-launch-30s.mp4` | 3,469,925 B (3.3 MB) | 30.0 s | MP4 / H.264 |
| Thumbnail | `videos/fairhold-launch/renders/thumbnail.png` | 279,630 B | — | PNG |
| Contact sheet | `videos/fairhold-launch/renders/frames-contact-sheet.png` | 619,088 B | — | PNG |
| Subtitles | `videos/fairhold-launch/captions/fairhold-launch.srt` | 2,382 B | — | SRT |
| Script | `videos/fairhold-launch/SCRIPT.md` | — | — | Markdown |
| Storyboard | `videos/fairhold-launch/STORYBOARD.md` | — | — | Markdown |
| Brief | `videos/fairhold-launch/BRIEF.md` | — | — | Markdown |
| Video README | `videos/fairhold-launch/README.md` | — | — | Markdown |
| Composition source | `videos/fairhold-launch/index.html` | 29,321 B | — | HTML |
| HyperFrames config | `videos/fairhold-launch/hyperframes.json` | — | — | JSON |

## 2. Technical verification (re-run against actual files)

`ffprobe` output:

- Master: h264, 1920×1080, r_frame_rate 30/1, nb_frames=3000, duration=100.000000
- 30s cut: h264, 1920×1080, r_frame_rate 30/1, nb_frames=900, duration=30.000000
- Black-frame detection: no black segment ≥ 0.4 s (re-verified)
- Contrast/text check: `hyperframes check` 0 errors, layout 0 issues across 9 samples, 53/53 text checks pass WCAG AA

## 3. What was already good

- 100-second master is the primary submission candidate: under 180s, correct resolution/codec/fps, valid MP4/H.264, black-frame-free, all text contrast passing.
- 30-second cut available for any shorter-submission preference.
- Subtitles (SRT) present and matched to scene timecodes.
- Thumbnail and contact sheet present for reviewer inspection.
- Script and storyboard documented (BRIEF.md, SCRIPT.md, STORYBOARD.md).
- No voice-over (silent by design — no TTS/music credentials available); on-screen copy carries the narrative.
- Visual identity: premium red-and-black (#08090b background, #f4f1ec off-white, #d76a79 rose, #6fbf9a green, #d9b25f amber, #e07a7a red).
- The video shows only functionality the code actually implements: authorization hold (not escrow), evidence/revision, capture blocked without human approval, quarantined webhook, deterministic AI advisory.
- Simulated payments are labelled throughout ("DEMO MODE · SIMULATED PAYMENTS", "Provider call simulated in this build").

## 4. Product-claim verification

Every claim in the video matches verified implementation:

| Video claim | Implementation status |
|---|---|
| Milestone-based deal creation | Verified (`app/deals/actions.ts`, milestones page) |
| Hold, not escrow | Verified (`PAYMENT_FLOW.md`, deal page "Costs and limits") |
| Evidence submission + revision | Verified (Playwright journey, `evidence-lifecycle.spec.ts`) |
| Capture blocked without human approval | Verified (rules, `planCapture`, Playwright assertion) |
| Quarantined unknown events | Verified (webhook quarantine, `webhooks.ts`) |
| Deterministic AI advisory | Verified (`lib/ai/advisory.ts`, advisory-only, never changes deal state) |
| Simulated payments, no live provider | Verified (demo provider `simulated:true`, no network calls) |

No fake PayPal transaction, fake escrow claim, or unverified AI capability is shown.

## 5. Thumbnail and contact sheet

- `thumbnail.png` (279,630 B): frame from scene 12 (closing creed), legible at thumbnail size.
- `frames-contact-sheet.png` (619,088 B): 12-scene contact sheet at 8⅓-second intervals (4×3 tile), all scene midpoints carry content (signalstats 28.1–33.8).
- Neither was visually inspected by this agent (no image-viewing capability); verified programmatically via ffprobe/blackdetect/signalstats and hyperframes check. Left for human review.

## 6. YouTube title and description

**Suggested title:**
> FairHold — Milestone Payments with Human Approval (PayPal AI Hackathon)

**Suggested description:**

> FairHold is a milestone-based payment coordination platform for buyers and sellers.
>
> "AI proposes. Rules decide. Humans approve. PayPal executes. The audit trail records everything."
>
> How it works:
> 1. Buyer creates a deal and defines milestones with acceptance criteria and amounts.
> 2. The buyer places an authorization hold — funds are reserved, not moved (not escrow).
> 3. The seller submits evidence; the buyer accepts it or requests a specific revision.
> 4. AI assists with evidence analysis and revision suggestions — advisory only; a human reviewer decides.
> 5. Only an approved milestone is captured through PayPal; every capture is auditable and idempotent.
>
> Built for the PayPal AI Hackathon.
>
> Repository: https://github.com/the-nidhi-bhat/fairhold
> Branch: feat/deal-milestone-foundation
> Demo: /demo (guided, browser-only, simulated payments — labelled throughout)
>
> Limitations: demo authentication only; sandbox PayPal and live AI not yet connected (credentials pending). PayPal authorization is not escrow and FairHold does not guarantee fund protection.

## 7. YouTube upload instructions (owner action)

1. Sign in to the owner's YouTube account.
2. Upload `videos/fairhold-launch/renders/fairhold-launch.mp4` (recommended: 100 s master).
   - Alternative: `fairhold-launch-30s.mp4` if a shorter cut is preferred.
3. Set title to the suggested title above.
4. Paste the suggested description (with the actual repository URL).
5. Upload `videos/fairhold-launch/renders/thumbnail.png` as the custom thumbnail.
6. Upload `videos/fairhold-launch/captions/fairhold-launch.srt` as subtitles.
7. Set visibility to PUBLIC.
8. Verify the public URL plays the full 100 s video with synchronized subtitles.
9. Share the URL with OpenCode for link verification.

**Do not upload using any OpenCode-controlled account without explicit authorization.** This agent does not upload or publish anything.

## 8. Git status

Video assets were committed earlier under commits `eb84fee` and closeout commits `5c7f8f6`/`d7623c8` — already pushed to `origin/feat/deal-milestone-foundation`. HEAD `d7623c8` == remote HEAD. Working tree clean.

## 9. Verdict

| Criterion | Verdict |
|---|---|
| VIDEO QUALITY | PASS |
| PRODUCT ACCURACY | PASS |
| TECHNICAL EXPORT | PASS |
| SUBTITLES | PASS |
| YOUTUBE READY | YES (files ready; upload requires owner authorization) |
| VIDEO PUBLICLY UPLOADED | NOT UPLOADED |
| OVERALL PHASE 5 | PASS |

## 10. Remaining owner actions

1. Upload the MP4 to YouTube publicly (visibility PUBLIC), add thumbnail + SRT.
2. Share the YouTube URL so OpenCode can verify the link and duration.
3. If the 100 s master is too long for any judge constraint, use the 30 s cut instead (already rendered).

No further rendering or asset work is needed unless the owner requests it.
