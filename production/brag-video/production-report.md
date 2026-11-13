# FairHold — Production Report

**Deliverable:** a 3-minute (180.000 s) cinematic product film for the FairHold milestone-payment platform.
**Produced:** 12–13 November 2026.
**Subject:** the live deployment at `https://fairhold-beta.vercel.app`.

---

## 1. What was delivered

| File | What it is | Size |
| --- | --- | --- |
| `final-master.mp4` | The 16:9 master — 1920×1080, 30 fps, H.264 + AAC 48 kHz stereo, exactly 180.000 s | 29.7 MB |
| `final-vertical.mp4` | 9:16 social cut — 1080×1920, same 180 s, blurred brand fill behind the scaled frame | 12.7 MB |
| `thumbnail.png` | 1280×720 custom poster (shield mark, wordmark, tagline, URL) | 165 KB |
| `subtitles.srt` | The nine voiceover lines with exact timings | 1.4 KB |
| `source/` | Every script used to produce the film (capture, cards, voiceover, build, captions) | — |
| `assets/` | The two music tracks actually used, the rendered shield mark, and the licence note | — |
| `screenshots/` | 12 verified still frames captured from the live site | — |

---

## 2. The source video, and what was changed

The repository already contained a launch film at `videos/fairhold-launch/renders/fairhold-launch.mp4`
(HyperFrames composition, 1920×1080, 100.000 s, 10.1 MB). **That file was inspected and left untouched.**

Its weaknesses, and what this release does about them:

| Issue in the original | What this production does |
| --- | --- |
| **No audio stream at all.** Probed with `ffprobe`: a single video stream, zero audio. A 100-second silent film reads as a mock-up. | Full three-layer mix: royalty-free music bed, nine voiceover lines, and ten sound-design cues. Measured output: mean −16.6 dB, true peak −1.4 dB. |
| **No product footage.** Every scene was a typographic card describing the product rather than showing it. | Roughly half the running time is genuine screen recording of the live deployment: the landing page, the sign-in flow, a real signed-in deal with three milestones, a real evidence submission, a real human review and acceptance, and the guided demo's simulated capture. |
| **No voiceover.** The script file said so explicitly: "No narration track exists in this build". | A complete voiceover written from verified functionality and spoken by Microsoft Zira Desktop, placed line by line against the picture. |
| **Static, even pacing.** Twelve equal 8-second cards, no rhythm. | Nine scenes of unequal length with a deliberate rhythm: short cards, long product takes, and a slow build into the closing. |
| **No disclosure layer.** The original carried a bottom-right `DEMO MODE · SIMULATED PAYMENTS` badge only. | Kept, and strengthened: a persistent badge across every product shot, plus a full-width `SIMULATED PAYMENT · DEMO ONLY` caption over the capture scene itself, plus a written disclosure on the final card. |

The original file remains in `videos/fairhold-launch/` and is unmodified.

---

## 3. The nine-scene timeline

| # | Time | Scene | Source material |
| --- | --- | --- | --- |
| 1 | 0:00–0:20 | The problem | Motion-graphics card: "Every project starts with trust." → "But trust needs accountability." |
| 2 | 0:20–0:40 | Brand reveal | Shield mark resolves out of black, then FAIRHOLD wordmark and tagline |
| 3 | 0:40–1:00 | The product | **Live site**: landing hero and the seven-step path from agreement to outcome |
| 4 | 1:00–1:20 | Milestone structure | **Live site**: demo sign-in, then a real signed-in deal with three milestones and a total |
| 5 | 1:20–1:35 | Evidence | **Live site**: the seller opening the evidence form on a real milestone, typing a note and a link, and submitting it |
| 6 | 1:35–2:05 | Human review and approval | **Live site**: the buyer's review queue, the review note, acceptance, and the approval gate; then the guided demo's accept → approve action |
| 7 | 2:05–2:15 | The simulated capture | **Live guided demo**: `Human decision recorded: approve → CAPTURE`, `Simulated action — no PayPal request was made.`, `COMPLETED` — under a `SIMULATED PAYMENT · DEMO ONLY` caption |
| 8 | 2:15–2:40 | Separation of duties | Motion graphics: "AI proposes." → "Humans decide." → "Rules protect." |
| 9 | 2:40–3:00 | Closing | Shield mark, "Trust, backed by accountability.", the live URL, the repository URL, and the payment disclosure |

Scene boundaries are held to the second by an absolute-start-time schedule: each cross-dissolve is paid for
by the segment before it, so the picture never drifts against the voiceover.

---

## 4. Tools and skills used

| Stage | Tool |
| --- | --- |
| Environment audit | `deploy-to-vercel` and `brag` skills; FFmpeg, Playwright, HyperFrames CLI and the Python/Pillow stack inspected and reused |
| Footage capture | **Playwright 1.64.1** — `recordVideo` screen recordings at 1920×1080 of the live site, plus high-resolution stills |
| Brand mark | Playwright rendering of `public/fairhold-shield.svg` (the approved asset) to a transparent PNG |
| Title cards, poster | **Python 3.11 + Pillow 12.3 + numpy** — procedurally rendered black/crimson cards with letter-tracked typography and a radial bloom |
| Voiceover | **Windows SAPI** — Microsoft Zira Desktop, offline, one WAV per line for exact placement |
| Editing and mix | **FFmpeg 9.0.1** (gyan.dev full build) — `xfade` dissolves, `zoompan` card push-ins, `drawtext` disclosure, `sidechaincompress` music ducking, `loudnorm` master |
| Captions | **ASS + libass**, burned in with fades; a matching `subtitles.srt` is delivered alongside |

---

## 5. Audio

- **Music:** *Happy Beats / Business Moves* vol. 9, cross-faded into vol. 12 (source: [ende.app](https://ende.app/en)).
  Both files are bundled with the `brag` skill and are copied into `assets/`.
- **Voiceover:** nine lines, written only from behaviour that exists in the deployed product. No claim in the
  narration is not visible in the footage behind it.
- **Sound design:** ten cues from the `brag` skill's impact/interface libraries — a low metal impact on the
  first frame, a bell on the brand reveal, light impacts on the two scene changes, interface clicks on the
  evidence and approval beats, a punch on the simulated capture, a glass hit on the philosophy scene, and a
  bell on the close.
- **Mix:** music at −8 dB under a −14 LUFS master, ducked by the voiceover with `sidechaincompress`
  (threshold 0.05, ratio 9, 12 ms attack, 380 ms release). The sidechain input is padded to the full 180 s
  before compression — see §10; without that padding, `sidechaincompress` terminates when the voice ends and
  the tail of the mix went digitally silent. The music bed itself is healthy to the end (the vol. 9 → vol. 12
  cross-fade starts at **111.9 s**, i.e. 1:51.9).
- **Licence:** see `assets/LICENCE.md`. The ende.app "Happy Beats / Business Moves" tracks carry no
  documented licence grant in the bundled skill metadata, and ende.app's own terms were not verified. Verify the
  terms before commercial use; do not treat the film's music as licensed-for-marketing.

## 6. Honesty and disclosure

- No real payment was created, captured, voided or refunded at any point. The only payment actions in the
  film are the guided demo's simulated ones, which the app labels itself
  (`Simulated action — no PayPal request was made.`).
- The film states the simulation three times: the persistent `DEMO MODE · SIMULATED PAYMENTS` badge, the
  scene-7 caption, and the final card.
- The claim "AI proposes. Humans decide. Rules protect." is accurate for the deployed product: the advisory
  layer is labelled advisory, the recommendation comes from deterministic rules, and approval is a
  server-side human action.
- Every screenshot and clip in `screenshots/` is a real frame from the live deployment.

## 7. Quality checks performed after the final render

- `ffprobe`: duration **180.000000 s**, 1920×1080, 30/1 fps, H.264 video + AAC 48 kHz stereo audio.
- `volumedetect`: mean −16.5 dB, max −1.4 dB (re-measured on the re-rendered master, 2026-11-13).
- Silence map: **no** frame below −55 dBFS anywhere; 169–179 s band measures −20.2 dB mean and 163–169 s
  −15.5 dB — the closing VO and the fade carry the end card, which previously played in digital silence.
- Frame-by-frame review of 18 evenly spaced frames covering the whole runtime — every scene lands on its
  planned second, every caption is on screen while its line is spoken, and no frame is blank or black.
- Close review of the transition zones (t=120, 126, 131, 136, 142, 150) to confirm the scene-7 disclosure
  lands over the capture and the philosophy cards begin at 2:15.
- Caption timing validated by an independent render pass over a synthetic timeline before the master was
  cut, so no caption can drift.

## 8. Known limitations

1. The voiceover is synthetic (offline Windows TTS). It is clear and correctly paced, but it is not a
   human performance. Replacing `source/make-voiceover.ps1` with a studio or neural voice is a drop-in change.
2. The vertical cut scales the 16:9 frame to fit a 9:16 canvas with a blurred brand fill. Interface text is
   small on a phone; it is a social teaser, not the primary artefact.
3. The film shows the real signed-in deal **before** its authorization hold, because placing that hold in
   production requires a PayPal sandbox order to be approved by the buyer's PayPal account. The storyboard's
   payment scene therefore uses the guided demo, which is where the app's own simulated capture is labelled
   unambiguously.
4. The production PostgreSQL database now contains one demo deal ("Meridian Studio website", client
   "Alex Buyer", freelancer "Jamie Seller", three milestones, four evidence items). It is the dataset the
   film shows. It is fictional and safe to keep, but it can be removed from the Vercel production scope
   without touching the film.
5. The master is ~27 MB and is committed to the repository. GitHub's per-file guidance keeps files under
   100 MB, so this is within limits, but if the repository should stay lean, the file can be replaced by the
   YouTube release alone.
6. The recorded footage shows the guided-demo reviewer labelled **"Sam Reviewer"**, because it was captured
   before the application's fixture was renamed to **"Morgan Reviewer"** (see §10). The shipped application no
   longer contains that name anywhere; the filmed frames predate the rename. A judge following along in the app
   will see "Morgan Reviewer".
7. The buyer recording shows the button **"Create PayPal sandbox authorization"**, because PayPal **sandbox**
   credentials resolve at runtime in the Production deployment (they are team-level inherited variables that a
   project-scoped `vercel env ls` does not list). That path creates real orders in the PayPal sandbox and is
   labelled as such on screen. Nothing in the film or the app implies PayPal **Live**, which the configuration
   refuses.

## 9. Reproducing the film

```bash
# 1. capture the real footage from the live deployment
node source/capture-website.mjs
node source/capture-deal-workflow.mjs

# 2. render the brand mark and the title cards
node source/render-logo.mjs
python source/make_cards.py

# 3. record the voiceover
powershell -ExecutionPolicy Bypass -File source/make-voiceover.ps1

# 4. cut the master
python source/build.py
```

`source/build.py` is the single place where the edit lives: the segment schedule, the cross-dissolve chain,
the music cross-fade, the ducking and the loudness target.

## 10. Post-delivery fixes (2026-11-13)

A release review of the shipped film found two material defects and one continuity error. All three were
fixed and the master was **re-rendered**. The committed artefacts are the re-rendered versions.

1. **The final 11 seconds of the master were digital silence.** `sidechaincompress` terminates when its
   sidechain (the voiceover, which ends at 168.953 s) ends, so the ducked music bed was truncated at ~169 s
   and the loudness analysis showed runs at **−177 dBFS** from 169 to 180 s — the end card carrying the shield,
   the tagline, the live URL, the GitHub link and the payment disclosure played in silence. The vertical cut
   had the identical defect. **Fix:** pad the sidechain to the full runtime with
   `[voxside]apad=whole_dur=180,asetpts=N/SR/TB[voxpad]` and compress the bed against `voxpad`. **Re-verified:**
   no silence run below −55 dBFS anywhere; 169–179 s carries the music bed; the 179→180 s fade is present.
2. **The `SIMULATED PAYMENT · DEMO ONLY` caption overlapped the product UI.** It sat at `y=862` directly on
   top of the milestone card's title and acceptance criteria, making both hard to read. **Fix:** moved to
   `y=1000` with a semi-opaque backing (`box=1:boxcolor=0x101012@0.85:boxborderw=16`).
3. **Two incompatible states of the same deal were shown.** The seller beat showed **$6,000.00 / 0 of 2**
   milestones, the buyer beat showed **$8,000.00 / 0 of 3**, because the demo deal was edited mid-capture.
   **Fix:** the seller and buyer beats were re-captured against the live deployment as
   `16-seller-evidence-v2.webm` and `17-buyer-review-v2.webm`; both show **$8,000.00 / 0 of 3 / "Ready for
   Authorization"**. The buyer beat was shot against the live site and therefore shows the honest
   **"Create PayPal sandbox authorization"** button rather than the simulated path — that button creates a real
   order in the PayPal **sandbox**, which the app labels on screen. No PayPal sandbox order was created,
   captured, voided or refunded for the recording.
4. **Reviewer persona rename.** The application's demo reviewer was renamed "Sam Reviewer" → **"Morgan Reviewer"**
   (the /login page and the Playwright config already used the latter, so the product spoke two names). The
   recorded `/demo` footage predates the rename and still shows "Sam Reviewer"; see §8.6.

`build.py` also drives the caption timing, the music cross-fade and the loudness target; those were audited
and needed no changes.
