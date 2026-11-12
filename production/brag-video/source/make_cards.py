"""Render the FairHold brag-video title cards, backgrounds and thumbnail with Pillow."""
import os
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

WORK = r"C:\Users\theni\AppData\Local\Temp\opencode\brag"
OUT = os.path.join(WORK, "cards")
os.makedirs(OUT, exist_ok=True)

W, H = 1920, 1080
CRIMSON = (220, 38, 60)
CRIMSON_SOFT = (255, 90, 110)
WHITE = (245, 245, 247)
MUTED = (150, 152, 160)
INK = (8, 8, 10)

F_DISPLAY = r"C:\Windows\Fonts\ARIALNB.TTF"
F_LABEL = r"C:\Windows\Fonts\bahnschrift.ttf"
F_BODY = r"C:\Windows\Fonts\segoeui.ttf"
F_MONO = r"C:\Windows\Fonts\consola.ttf"


def base_bg(glow_x=0.70, glow_y=0.16, glow_r=0.62, strength=0.30):
    """Near-black field with a soft crimson bloom and a gentle vignette."""
    yy, xx = np.mgrid[0:H, 0:W]
    nx, ny = xx / W, yy / H
    d = np.sqrt((nx - glow_x) ** 2 + ((ny - glow_y) * 0.78) ** 2) / glow_r
    bloom = np.clip(1.0 - d, 0.0, 1.0) ** 2.2
    base = np.zeros((H, W, 3), dtype=np.float64)
    base[:, :, 0] = INK[0]
    base[:, :, 1] = INK[1]
    base[:, :, 2] = INK[2]
    base[:, :, 0] += bloom * CRIMSON[0] * strength * 0.34
    base[:, :, 1] += bloom * CRIMSON[1] * strength * 0.34
    base[:, :, 2] += bloom * CRIMSON[2] * strength * 0.34
    r = np.sqrt((nx - 0.5) ** 2 + (ny - 0.5) ** 2) / 0.72
    vig = 1.0 - np.clip(r - 0.55, 0, 1) * 0.55
    base *= vig[:, :, None]
    return Image.fromarray(np.clip(base, 0, 255).astype(np.uint8), "RGB")


def track_text(draw, xy, text, font, fill, tracking=0, anchor_center=False):
    """Draw text with manual letter tracking (Pillow has no tracking)."""
    widths = [draw.textlength(ch, font=font) for ch in text]
    total = sum(widths) + tracking * max(0, len(text) - 1)
    x, y = xy
    if anchor_center:
        x -= total / 2
    for ch, w in zip(text, widths):
        draw.text((x, y), ch, font=font, fill=fill)
        x += w + tracking
    return total


def label(img, text, x=110, y=92, size=26, fill=CRIMSON):
    d = ImageDraw.Draw(img)
    f = ImageFont.truetype(F_LABEL, size)
    track_text(d, (x, y), text, f, fill, tracking=int(size * 0.26))
    return d


def rule(draw, x, y, w, h=4, fill=CRIMSON):
    draw.rectangle([x, y, x + w, y + h], fill=fill)


def headline(img, text, y=470, size=132, fill=WHITE, x=110, width=1700, align="left"):
    d = ImageDraw.Draw(img)
    f = ImageFont.truetype(F_DISPLAY, size)
    words = text.split()
    lines, cur = [], ""
    for w in words:
        trial = (cur + " " + w).strip()
        if d.textlength(trial, font=f) <= width:
            cur = trial
        else:
            lines.append(cur)
            cur = w
    if cur:
        lines.append(cur)
    yy = y
    for ln in lines:
        if align == "left":
            track_text(d, (x, yy), ln, f, fill, tracking=-2)
        else:
            track_text(d, (x, yy), ln, f, fill, tracking=-2, anchor_center=True)
        yy += int(size * 1.02)
    return yy


def body(img, text, y=760, size=38, fill=MUTED, x=110, width=1450):
    d = ImageDraw.Draw(img)
    f = ImageFont.truetype(F_BODY, size)
    words = text.split()
    lines, cur = [], ""
    for w in words:
        trial = (cur + " " + w).strip()
        if d.textlength(trial, font=f) <= width:
            cur = trial
        else:
            lines.append(cur)
            cur = w
    if cur:
        lines.append(cur)
    yy = y
    for ln in lines:
        d.text((x, yy), ln, font=f, fill=fill)
        yy += int(size * 1.34)
    return yy


def save(img, name):
    p = os.path.join(OUT, name)
    img.save(p, quality=96)
    print("card:", name)


shield = Image.open(os.path.join(WORK, "assets", "shield-crimson.png")).convert("RGBA")
shield_full = Image.open(os.path.join(WORK, "assets", "shield.png")).convert("RGBA")


def paste_shield(img, png, cx, cy, height, glow=False):
    ratio = height / png.height
    sh = png.resize((int(png.width * ratio), int(height)), Image.LANCZOS)
    if glow:
        g = sh.filter(ImageFilter.GaussianBlur(26))
        glow_layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
        g.putalpha(g.getchannel("A").point(lambda v: int(v * 0.55)))
        glow_layer.alpha_composite(g, (int(cx - sh.width / 2), int(cy - sh.height / 2)))
        img.alpha_composite(glow_layer)
    img.alpha_composite(sh, (int(cx - sh.width / 2), int(cy - sh.height / 2)))


# ---------------------------------------------------------------- background
save(base_bg(), "bg-plain.png")
save(base_bg(0.5, 0.5, 0.72, 0.22), "bg-center.png")

# ---------------------------------------------------------------- scene 01: the problem
img = base_bg(0.74, 0.22, 0.66, 0.26).convert("RGBA")
d = ImageDraw.Draw(img)
label(img, "01 / THE PROBLEM")
rule(d, 110, 148, 96)
headline(img, "Every project starts with trust.", y=430)
body(img, "Scope drifts. Approval is verbal. Money moves before anyone agrees it should.", y=610)
save(img.convert("RGB"), "card-problem-1.png")

img = base_bg(0.74, 0.22, 0.66, 0.26).convert("RGBA")
d = ImageDraw.Draw(img)
label(img, "01 / THE PROBLEM")
rule(d, 110, 148, 96)
headline(img, "But trust needs", y=380, size=128)
d2 = ImageDraw.Draw(img)
f = ImageFont.truetype(F_DISPLAY, 128)
track_text(d2, (110, 512), "accountability.", f, CRIMSON, tracking=-2)
body(img, "Milestones, evidence and a named human decide what happens next.", y=700)
save(img.convert("RGB"), "card-problem-2.png")

# ---------------------------------------------------------------- scene 02: brand reveal
img = base_bg(0.5, 0.46, 0.55, 0.30).convert("RGBA")
paste_shield(img, shield, 960, 470, 430, glow=True)
save(img.convert("RGB"), "card-reveal-1.png")

img = base_bg(0.5, 0.46, 0.55, 0.30).convert("RGBA")
paste_shield(img, shield, 960, 400, 330, glow=True)
d = ImageDraw.Draw(img)
f = ImageFont.truetype(F_DISPLAY, 112)
track_text(d, (960, 780), "FAIRHOLD", f, WHITE, tracking=6, anchor_center=True)
rule(d, 860, 900, 200, 3, CRIMSON)
fb = ImageFont.truetype(F_BODY, 34)
track_text(d, (960, 936), "Milestone-based payments. Built on trust.", fb, MUTED, anchor_center=True)
save(img.convert("RGB"), "card-reveal-2.png")

# ---------------------------------------------------------------- scene 08: philosophy
philosophy = [
    ("AI proposes.", "Suggestions only. The model never changes deal or payment state."),
    ("Humans decide.", "A named buyer or authorised reviewer approves every capture."),
    ("Rules protect.", "Deterministic rules read verified state and record the reason."),
]
for i, (head, sub) in enumerate(philosophy, start=1):
    img = base_bg(0.5, 0.5, 0.78, 0.16).convert("RGBA")
    d = ImageDraw.Draw(img)
    label(img, "08 / SEPARATION OF DUTIES", x=110, y=92)
    rule(d, 110, 148, 96)
    fl = ImageFont.truetype(F_LABEL, 30)
    track_text(d, (1810, 92), "0%d / 03" % i, fl, MUTED, tracking=4, anchor_center=True)
    fh = ImageFont.truetype(F_DISPLAY, 150)
    track_text(d, (960, 470), head, fh, WHITE if i != 2 else CRIMSON, tracking=-2, anchor_center=True)
    fs = ImageFont.truetype(F_BODY, 36)
    track_text(d, (960, 660), sub, fs, MUTED, anchor_center=True)
    save(img.convert("RGB"), "card-philosophy-%d.png" % i)

# ---------------------------------------------------------------- scene 09: closing
img = base_bg(0.5, 0.42, 0.55, 0.28).convert("RGBA")
paste_shield(img, shield, 960, 430, 360, glow=True)
d = ImageDraw.Draw(img)
f = ImageFont.truetype(F_DISPLAY, 118)
track_text(d, (960, 690), "FAIRHOLD", f, WHITE, tracking=6, anchor_center=True)
save(img.convert("RGB"), "card-close-1.png")

img = base_bg(0.5, 0.42, 0.55, 0.28).convert("RGBA")
paste_shield(img, shield, 960, 370, 290, glow=True)
d = ImageDraw.Draw(img)
f = ImageFont.truetype(F_DISPLAY, 108)
track_text(d, (960, 590), "FAIRHOLD", f, WHITE, tracking=6, anchor_center=True)
ft = ImageFont.truetype(F_DISPLAY, 62)
track_text(d, (960, 700), "Trust, backed by accountability.", ft, CRIMSON, tracking=-1, anchor_center=True)
save(img.convert("RGB"), "card-close-2.png")

img = base_bg(0.5, 0.42, 0.55, 0.28).convert("RGBA")
paste_shield(img, shield, 960, 340, 270, glow=True)
d = ImageDraw.Draw(img)
f = ImageFont.truetype(F_DISPLAY, 104)
track_text(d, (960, 545), "FAIRHOLD", f, WHITE, tracking=6, anchor_center=True)
ft = ImageFont.truetype(F_DISPLAY, 58)
track_text(d, (960, 650), "Trust, backed by accountability.", ft, CRIMSON, tracking=-1, anchor_center=True)
rule(d, 800, 740, 320, 3, CRIMSON)
fm = ImageFont.truetype(F_MONO, 38)
track_text(d, (960, 790), "fairhold-beta.vercel.app", fm, WHITE, anchor_center=True)
track_text(d, (960, 848), "github.com/the-nidhi-bhat/fairhold", fm, MUTED, anchor_center=True)
save(img.convert("RGB"), "card-close-3.png")

img = base_bg(0.5, 0.42, 0.55, 0.28).convert("RGBA")
paste_shield(img, shield, 960, 330, 260, glow=True)
d = ImageDraw.Draw(img)
f = ImageFont.truetype(F_DISPLAY, 100)
track_text(d, (960, 530), "FAIRHOLD", f, WHITE, tracking=6, anchor_center=True)
ft = ImageFont.truetype(F_DISPLAY, 56)
track_text(d, (960, 630), "Trust, backed by accountability.", ft, CRIMSON, tracking=-1, anchor_center=True)
rule(d, 800, 720, 320, 3, CRIMSON)
fm = ImageFont.truetype(F_MONO, 36)
track_text(d, (960, 768), "fairhold-beta.vercel.app", fm, WHITE, anchor_center=True)
track_text(d, (960, 822), "github.com/the-nidhi-bhat/fairhold", fm, MUTED, anchor_center=True)
fd = ImageFont.truetype(F_BODY, 30)
track_text(d, (960, 916), "Payments in the guided demo are simulated. No real money moves.", fd, (120, 122, 130), anchor_center=True)
save(img.convert("RGB"), "card-close-4.png")

# ---------------------------------------------------------------- thumbnail (1280x720)
tw, th = 1280, 720
yy, xx = np.mgrid[0:th, 0:tw]
nx, ny = xx / tw, yy / th
d2 = np.sqrt((nx - 0.72) ** 2 + ((ny - 0.18) * 0.8) ** 2) / 0.55
bloom = np.clip(1.0 - d2, 0, 1) ** 2.0
base = np.zeros((th, tw, 3), dtype=np.float64)
base[:, :, 0] = INK[0] + bloom * 120
base[:, :, 1] = INK[1] + bloom * 18
base[:, :, 2] = INK[2] + bloom * 26
thumb = Image.fromarray(np.clip(base, 0, 255).astype(np.uint8), "RGB").convert("RGBA")
sh = shield.resize((int(shield.width * 330 / shield.height), 330), Image.LANCZOS)
gl = sh.filter(ImageFilter.GaussianBlur(22))
gl.putalpha(gl.getchannel("A").point(lambda v: int(v * 0.6)))
thumb.alpha_composite(gl, (830 - sh.width // 2, 360 - sh.height // 2))
thumb.alpha_composite(sh, (830 - sh.width // 2, 360 - sh.height // 2))
dt = ImageDraw.Draw(thumb)
fl = ImageFont.truetype(F_LABEL, 24)
track_text(dt, (80, 150), "FAIRHOLD", fl, CRIMSON, tracking=8)
fd2 = ImageFont.truetype(F_DISPLAY, 82)
track_text(dt, (80, 250), "Trust, backed", fd2, WHITE, tracking=-1)
track_text(dt, (80, 336), "by accountability.", fd2, CRIMSON, tracking=-1)
fm2 = ImageFont.truetype(F_MONO, 28)
track_text(dt, (80, 520), "fairhold-beta.vercel.app", fm2, MUTED)
track_text(dt, (80, 570), "Milestone-based payments. Built on trust.", ImageFont.truetype(F_BODY, 26), (130, 132, 140))
thumb.convert("RGB").save(os.path.join(WORK, "thumbnail.png"), quality=95)
print("thumbnail.png written")
print("CARDS DONE")
