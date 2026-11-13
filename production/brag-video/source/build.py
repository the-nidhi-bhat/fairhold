"""Assemble the FairHold 3-minute brag video.

Timeline is driven by ABSOLUTE planned start times so the cross-dissolves never
drift the picture out of sync with the voiceover and captions.
"""
import os
import subprocess
import sys

WORK = r"C:\Users\theni\AppData\Local\Temp\opencode\brag"
BUILD = os.path.join(WORK, "build")
os.makedirs(BUILD, exist_ok=True)

FPS = 30
W, H = 1920, 1080
XF = 0.45          # cross-dissolve length
TARGET = 180.0

BRAG = r"C:\Users\theni\.agents\skills\brag"
VOICE = os.path.join(WORK, "voice")
MUSIC = os.path.join(BRAG, "assets", "music")
SFX = os.path.join(BRAG, "assets", "sfx")


def run(args, label):
    print("...", label, flush=True)
    r = subprocess.run(args, cwd=WORK, capture_output=True, text=True)
    if r.returncode != 0:
        print("FAILED:", label)
        print(r.stderr[-4000:])
        sys.exit(1)
    return r


def dur(path):
    r = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration",
                        "-of", "csv=p=0", path], cwd=WORK, capture_output=True, text=True)
    return float(r.stdout.strip())


# name, source, kind, planned start, source trim, extra seconds to hold the last frame
SEGMENTS = [
    ("s01a", "cards/card-problem-1.png", "card", 0.0, 0, 0),
    ("s01b", "cards/card-problem-2.png", "card", 7.0, 0, 0),
    ("s02a", "cards/card-reveal-1.png", "card", 20.0, 0, 0),
    ("s02b", "cards/card-reveal-2.png", "card", 27.5, 0, 0),
    ("s03a", "clips/01-landing.webm", "clip", 40.0, 0.0, 0.6),
    ("s03b", "clips/02-landing-story.webm", "clip", 48.4, 0.0, 0),
    ("s04a", "clips/06-signin.webm", "clip", 60.0, 0.8, 0),
    ("s04b", "clips/07-deal-structure.webm", "clip", 66.4, 0.0, 0),
    ("s05a", "clips/16-seller-evidence-v2.webm", "clip", 80.0, 14.0, 0),
    ("s06a", "clips/17-buyer-review-v2.webm", "clip", 95.0, 0.0, 1.6),
    ("s06b", "clips/05-demo-approve.webm", "clip", 117.5, 0.0, 0),
    ("s07a", "clips/05-demo-approve.webm", "clip", 126.0, 10.5, 1.39),
    ("s08a", "cards/card-philosophy-1.png", "card", 135.0, 0, 0),
    ("s08b", "cards/card-philosophy-2.png", "card", 143.5, 0, 0),
    ("s08c", "cards/card-philosophy-3.png", "card", 152.0, 0, 0),
    ("s09a", "cards/card-close-1.png", "card", 160.0, 0, 0),
    ("s09b", "cards/card-close-2.png", "card", 165.0, 0, 0),
    ("s09c", "cards/card-close-3.png", "card", 170.0, 0, 0),
    ("s09d", "cards/card-close-4.png", "card", 175.0, 0, 0),
]

n = len(SEGMENTS)
lengths = []
for i in range(n):
    if i == 0:
        lengths.append(SEGMENTS[1][3] - SEGMENTS[0][3])       # first segment runs to the next start
    elif i == n - 1:
        lengths.append(TARGET - SEGMENTS[i][3] + XF)           # last segment fills to the end
    else:
        lengths.append(SEGMENTS[i + 1][3] - SEGMENTS[i][3] + XF)
print("material total:", round(sum(lengths), 2), " final:", round(sum(lengths) - (n - 1) * XF, 2))

# ---------------------------------------------------------------- build each segment
built = []
for (name, src, kind, tstart, trim, hold), length in zip(SEGMENTS, lengths):
    out = os.path.join(BUILD, name + ".mp4")
    if kind == "card":
        frames = int(round(length * FPS))
        vf = (f"scale=3840:2160:flags=lanczos,"
              f"zoompan=z='1.0+0.055*on/{max(1, frames - 1)}':"
              f"x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':"
              f"d={frames}:s={W}x{H}:fps={FPS},format=yuv420p")
        run(["ffmpeg", "-y", "-v", "error", "-loop", "1", "-i", src, "-vf", vf,
             "-frames:v", str(frames), "-r", str(FPS), "-c:v", "libx264", "-preset", "medium",
             "-crf", "16", "-pix_fmt", "yuv420p", out], "card " + name)
    else:
        vf = f"scale={W}:{H}:flags=lanczos,fps={FPS}"
        if name == "s07a":
            # The simulation disclosure is composited straight into this segment,
            # so its timing is exact and cannot drift. The label lives in a UTF-8
            # text file so the separator glyph is never mangled by the filter.
            with open(os.path.join(BUILD, "sim-label.txt"), "w", encoding="utf-8") as fh:
                fh.write("SIMULATED PAYMENT  \u00b7  DEMO ONLY")
            vf += (r",drawtext=fontfile='C\:/Windows/Fonts/ARIALNB.TTF':"
                   r"textfile=build/sim-label.txt:"
                   r"fontcolor=0xDC263C:fontsize=36:borderw=2:bordercolor=0x000000:"
                   r"shadowcolor=0x000000@0.6:shadowx=1:shadowy=2:box=1:boxcolor=0x0B0B0E@0.94:boxborderw=18:"
                   r"x=1118:y=560:enable='between(t,0.7,8.0)'")
        if hold > 0:
            vf += f",tpad=stop_mode=clone:stop_duration={hold}"
        vf += ",format=yuv420p"
        run(["ffmpeg", "-y", "-v", "error", "-ss", f"{trim}", "-i", src, "-t", f"{length}",
             "-vf", vf, "-an", "-c:v", "libx264", "-preset", "medium", "-crf", "17",
             "-pix_fmt", "yuv420p", out], "clip " + name)
    built.append((name, out, length))
    actual = dur(out)
    print(f"  {name}: {actual:.2f}s (planned start {tstart})")
    if actual < length - 0.1:
        print(f"ERROR: segment {name} encoded at {actual:.2f}s but its slot is {length:.2f}s. "
              f"The source is shorter than the planned trim/hold — refusing to ship a video whose picture "
              f"silently stops earlier than the audio.")
        sys.exit(1)

# ---------------------------------------------------------------- chain with cross-dissolves
inputs = []
for name, out, length in built:
    inputs += ["-i", out]

parts = []
acc = "0:v"
running = dur(built[0][1])
for i in range(1, len(built)):
    offset = running - XF
    out_label = f"v{i}"
    parts.append(f"[{acc}][{i}:v]xfade=transition=fade:duration={XF}:offset={offset:.3f}[{out_label}]")
    acc = out_label
    running = offset + dur(built[i][1])

visual = os.path.join(BUILD, "visual.mp4")
run(["ffmpeg", "-y", "-v", "error", *inputs, "-filter_complex", ";".join(parts), "-map", f"[{acc}]",
     "-c:v", "libx264", "-preset", "medium", "-crf", "17", "-pix_fmt", "yuv420p", "-r", str(FPS),
     visual], "chain")
print("visual:", dur(visual), "s")

# ---------------------------------------------------------------- audio bed
music_a = os.path.join(MUSIC, "happy-beats-business-moves-vol-9-by-ende-dot-app.mp3")
music_b = os.path.join(MUSIC, "happy-beats-business-moves-vol-12-by-ende-dot-app.mp3")
bgm = os.path.join(BUILD, "bgm.wav")
run(["ffmpeg", "-y", "-v", "error",
     "-i", music_a, "-i", music_b,
     "-filter_complex",
     f"[0:a]atrim=0:113.6,asetpts=N/SR/TB[a0];"
     f"[1:a]atrim=20:88.4,asetpts=N/SR/TB,afade=t=in:st=0:d=2,volume=0.92[a1];"
     f"[a0][a1]acrossfade=d=2:c1=tri:c2=tri,atrim=0:{TARGET},"
     f"afade=t=in:st=0:d=2.5,afade=t=out:st={TARGET - 4}:d=4,"
     f"aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo[out]",
     "-map", "[out]", "-c:a", "pcm_s16le", bgm], "bgm")
print("bgm:", dur(bgm), "s")

# ---------------------------------------------------------------- voiceover
VO = [("s01", 1.6), ("s02", 22.2), ("s03", 41.4), ("s04", 61.4), ("s05", 81.6),
      ("s06", 96.6), ("s07", 125.6), ("s08", 136.6), ("s09", 162.4)]
vo_args = []
vo_filters = []
for i, (vid, at) in enumerate(VO):
    vo_args += ["-i", os.path.join(VOICE, vid + ".wav")]
    vo_filters.append(f"[{i}:a]aresample=48000,aformat=channel_layouts=stereo,volume=1.35,adelay={int(at * 1000)}|{int(at * 1000)}[v{i}]")
vo_mix = ";".join(vo_filters) + ";" + "".join(f"[v{i}]" for i in range(len(VO))) + \
    f"amix=inputs={len(VO)}:normalize=0:dropout_transition=0[vox]"
vo = os.path.join(BUILD, "voice.wav")
run(["ffmpeg", "-y", "-v", "error", *vo_args, "-filter_complex", vo_mix, "-map", "[vox]",
     "-c:a", "pcm_s16le", "-t", str(TARGET + 4), vo], "voice")
print("voice:", dur(vo), "s")

# ---------------------------------------------------------------- sound effects
SFX_PICKS = [
    ("impact/impactMetal_heavy_000.ogg", 0.10, 0.55),
    ("impact/impactBell_heavy_000.ogg", 20.20, 0.40),
    ("impact/impactGeneric_light_002.ogg", 40.20, 0.26),
    ("impact/impactGeneric_light_001.ogg", 60.20, 0.26),
    ("interface/click_003.ogg", 82.60, 0.30),
    ("interface/click_002.ogg", 98.40, 0.28),
    ("impact/impactPunch_heavy_000.ogg", 125.30, 0.34),
    ("impact/impactGlass_heavy_002.ogg", 135.40, 0.30),
    ("impact/impactBell_heavy_003.ogg", 160.20, 0.42),
    ("interface/select_008.ogg", 176.20, 0.26),
]
available = []
for rel, at, gain in SFX_PICKS:
    path = os.path.join(SFX, rel.replace("/", os.sep))
    if os.path.exists(path):
        available.append((rel, at, gain, path))
    else:
        print("  ! missing sfx", rel)
sfx_args = []
sfx_filters = []
for i, (rel, at, gain, path) in enumerate(available):
    sfx_args += ["-i", path]
    sfx_filters.append(f"[{i}:a]aresample=48000,aformat=channel_layouts=stereo,volume={gain},adelay={int(at * 1000)}|{int(at * 1000)}[s{i}]")
sfx = None
if sfx_filters:
    labels = "".join(f"[s{i}]" for i in range(len(available)))
    mix = ";".join(sfx_filters) + ";" + labels + f"amix=inputs={len(available)}:normalize=0:dropout_transition=0[sfx]"
    sfx = os.path.join(BUILD, "sfx.wav")
    run(["ffmpeg", "-y", "-v", "error", *sfx_args, "-filter_complex", mix, "-map", "[sfx]",
         "-c:a", "pcm_s16le", "-t", str(TARGET + 4), sfx], "sfx")

# ---------------------------------------------------------------- final mix
mix_parts = ["[0:a]volume=0.40[bg]", "[1:a]asplit=2[voxmain][voxside]"]
mix_inputs = ["-i", bgm, "-i", vo]
if sfx:
    mix_inputs += ["-i", sfx]
    mix_parts.append("[2:a]volume=1.0[sfx]")
mix_parts.append("[voxside]apad=whole_dur=" + str(TARGET) + ",asetpts=N/SR/TB[voxpad]")
mix_parts.append("[bg][voxpad]sidechaincompress=threshold=0.05:ratio=9:attack=12:release=380:makeup=1[ducked]")
mix_parts.append("[ducked][voxmain]" + ("[sfx]" if sfx else "") + "amix=inputs=" +
                 ("3" if sfx else "2") + ":normalize=0:dropout_transition=0[mix]")
mix_parts.append("[mix]apad,atrim=0:" + str(TARGET) + ",loudnorm=I=-14:TP=-1.5:LRA=11[final]")
master_audio = os.path.join(BUILD, "master-audio.wav")
run(["ffmpeg", "-y", "-v", "error", *mix_inputs, "-filter_complex", ";".join(mix_parts),
     "-map", "[final]", "-c:a", "pcm_s16le", "-t", str(TARGET), master_audio], "mix")
print("master audio:", dur(master_audio), "s")

# ---------------------------------------------------------------- burn captions and mux
master = os.path.join(BUILD, "final-master.mp4")
run(["ffmpeg", "-y", "-v", "error",
     "-i", visual, "-i", master_audio,
     "-vf", "subtitles=captions.ass",
     "-map", "0:v", "-map", "1:a",
     "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-pix_fmt", "yuv420p",
     "-r", str(FPS), "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-movflags", "+faststart",
     "-t", str(TARGET), master], "master")
print("MASTER:", dur(master), "s")
master_duration = dur(master)
if abs(master_duration - TARGET) > 0.5:
    print(f"ERROR: final master is {master_duration:.3f}s, not {TARGET}s — refusing to ship a truncated film.")
    sys.exit(1)
print("BUILD DONE — master duration verified:", master_duration, "s")
