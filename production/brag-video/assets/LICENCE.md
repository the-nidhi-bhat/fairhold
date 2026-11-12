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
from 2:12 to carry the closing. Per-track beat and cue metadata is available in the skill's `cues/` folder.

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
