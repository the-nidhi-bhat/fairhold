# FairHold launch video

HyperFrames source for the product video. The composition is one standalone
`index.html`: 1920×1080, 30 fps, 100 s, 12 timed scene clips, one paused GSAP
timeline registered as `window.__timelines["fairhold-launch"]`.

## Files

| File | What it is |
|---|---|
| `index.html` | The composition (source of truth) |
| `BRIEF.md` | Intent, constraints, audience, look |
| `STORYBOARD.md` | Scene table with timings and motion |
| `SCRIPT.md` | On-screen copy per scene (this build is silent; there is no voice-over) |
| `captions/fairhold-launch.srt` | Transcript captions on the same timecodes |
| `renders/fairhold-launch.mp4` | 100 s master, 1920×1080, 30 fps, H.264 |
| `renders/fairhold-launch-30s.mp4` | 30 s cut (scenes 1, 3, 5, 8, 9, 12 at 5 s each) |
| `renders/thumbnail.png` | Closing frame still |
| `renders/frames-contact-sheet.png` | 4×3 contact sheet for human review |

## Verified render output

```
codec_name=h264  width=1920  height=1080  pix_fmt=yuv420p
r_frame_rate=30/1  nb_frames=3000  duration=100.000000
size=10,146,468 bytes (9.7 MB)   rendered in 461 s · hardware gpu
```

30 s cut: `nb_frames=900  duration=30.000000`, 3,469,925 bytes.

## Checks that were actually run

| Check | Command | Result |
|---|---|---|
| Composition lint, runtime, layout, motion, contrast | `npx hyperframes@0.8.171 check` | `0 error(s), 13 warning(s)`; runtime 0/0; layout 0 issues across 9 samples; motion 0/0; **53/53 text checks pass WCAG AA** |
| No blank stretch in the master | `ffmpeg -vf blackdetect=d=0.4:pix_th=0.08` | no black segment of 0.4 s or longer |
| Per-scene content present | `ffmpeg -vf signalstats` at the 12 scene midpoints | mean luma 28.1–33.8 on a `#08090b` field, i.e. content is drawn in every scene |
| Container / frame count | `ffprobe` | 1920×1080, 30 fps, 3000 frames, 100.0 s |

**Not verified:** frames were not inspected visually by a human in this session.
`check` measured text fit and contrast, and `blackdetect` proved no dead frames,
but "looks good" is a human judgement. Open `renders/frames-contact-sheet.png`
before publishing.

## Warnings left in place (deliberate)

`check` reports 12 × `nested_structure_needs_subcomposition` and 1 ×
`composition_file_too_large`. Both are authoring-style advisories for a
monolithic 12-scene promo, not correctness findings: a 100 s single-file
composition is easier to review here than 12 sub-composition files with host
wiring. No error-level rule is suppressed.

## Re-render

```powershell
cd videos/fairhold-launch
npm run check                       # lint + runtime + layout + contrast
npx hyperframes@0.8.171 render -o renders/fairhold-launch.mp4 -f 30 -q looks
```

The 30 s cut is derived from the master (same frames, no re-authoring):

```powershell
ffmpeg -i renders/fairhold-launch.mp4 -filter_complex `
  "[0:v]trim=start=0:end=5,setpts=PTS-STARTPTS[v0];[0:v]trim=start=14:end=19,setpts=PTS-STARTPTS[v1];[0:v]trim=start=30:end=35,setpts=PTS-STARTPTS[v2];[0:v]trim=start=56:end=61,setpts=PTS-STARTPTS[v3];[0:v]trim=start=64:end=69,setpts=PTS-STARTPTS[v4];[0:v]trim=start=91:end=96,setpts=PTS-STARTPTS[v5];[v0][v1][v2][v3][v4][v5]concat=n=6:v=1:a=0[out]" `
  -map "[out]" -c:v libx264 -crf 18 -preset medium -pix_fmt yuv420p renders/fairhold-launch-30s.mp4
```

## Honesty rules baked into the video

- A persistent badge reads `DEMO MODE · SIMULATED PAYMENTS` for all 100 s.
- The capture scene says the provider call is simulated in this build.
- The closing frame says a real capture requires configured provider
  credentials; no live PayPal sandbox claim is made.
- The advisory scene states the advisory source is the deterministic fallback,
  because no model provider is configured in this build.
- No platform fee is shown, because none is implemented.

## Audio

Silent (`music: none`). No TTS or music provider credentials were available.
Adding a track is a one-line `<audio id="..." data-start="0">` element plus a
licence for the file.
