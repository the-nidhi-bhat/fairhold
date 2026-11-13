# Audio and asset licence notes

Everything in this folder is either bundled with the agent skill that produced the film, or was rendered
in-house from the project's own brand asset. No commercial music is used and no copyrighted soundtrack is
reproduced.

## Music

| File | Title | Source |
| --- | --- | --- |
| `bgm-happy-beats-business-moves-vol-9.mp3` | Happy Beats / Business Moves — vol. 9 | [ende.app](https://ende.app/en) — "Happy Beats / Business Moves" series |
| `bgm-happy-beats-business-moves-vol-12.mp3` | Happy Beats / Business Moves — vol. 12 | [ende.app](https://ende.app/en) — "Happy Beats / Business Moves" series |

Both tracks ship with the `brag` skill (`assets/music/`) and were copied here so the film can be re-cut
without the skill installed. Track 9 carries the opening and the body of the mix; track 12 cross-fades in
from about **1:51.9** — the acrossfade starts at 113.6 s minus its 2 s overlapping half, i.e. at 111.9 s
(in earlier drafts of this note that point was written as "2:12", which was wrong). Per-track beat and cue
metadata is available in the skill's `cues/` folder.

### Licence grant — not verified

**Caveat, read before relying on this file.** The skill's bundled
`assets/music/README.md` names the source as `ende.app`'s "Happy Beats / Business Moves" series and nothing
else. It does **not** state the licence grant, and I did **not** independently fetch or confirm ende.app's
terms of use. I am not going to invent a licence (CC0, royalty-free, Creative Commons, etc.) that has not
been verified.

Until ende.app's terms are checked and recorded here, treat these tracks as usable only in ways the
ende.app terms plainly allow, or replace them with audio whose licence you have confirmed (an equivalent
royalty-free bed, or a licensed track). Because the film is published on YouTube, verify the terms before
relying on this file in a monetised or commercial context. The SFX cues come from the same skill bundle and
carry the same caveat.

## Sound effects

Interface and impact cues are taken from the `brag` skill's bundled SFX libraries
(`assets/sfx/interface/`, `assets/sfx/impact/`). They are used under the same terms as the music above and
are not redistributed here — the build script references them from the skill directory.

## Voiceover

Spoken offline by **Microsoft Zira Desktop**, the Windows system text-to-speech voice, at rate −1.
No text-to-speech service was called over the network and no voice data was uploaded anywhere.

## Brand mark

`fairhold-shield-crimson.png` is rendered from the project's own approved asset,
`public/fairhold-shield.svg`, by `source/render-logo.cjs`. The crimson treatment is a filter applied to that
same file — no third-party logo is used anywhere in the film.

## Recorded footage

Every frame of product footage in the film was captured by Playwright from the live FairHold deployment at
`https://fairhold-beta.vercel.app`. The demo deal shown uses fictional parties ("Alex Buyer",
"Jamie Seller") and a fictional agreement. No payment was created, captured, voided or refunded at any point.
