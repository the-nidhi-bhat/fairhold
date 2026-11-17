/**
 * Scroll-sequence frame manifests for the cinematic landing page.
 *
 * Frames live in `public/landing/frames/{desktop,mobile}/frame-NNN.webp`
 * (1-based numbering, extracted at the clips' native resolutions).
 *
 * Both clips open with ~2s of near-black formation; the scrub arc therefore
 * starts at frame 50 so the architecture is the centrepiece at first paint.
 *
 * - Desktop runtime uses frames 50–192 of the replacement brand film
 *   (two crimson gates joined by the red thread, closing into a sealed ring
 *   barrel). The clip carries no baked-in typography, so the full arc applies.
 * - Mobile runtime uses frames 50–120 of the replacement portrait film
 *   (silver gates merging around the red thread, closing into a ring barrel
 *   with the swirling thread and diamond). The source carries a "9:16" label
 *   baked into the top of the frame from ~frame 122 onward, so the arc stops
 *   before it; a small "Veo" corner watermark is baked into the source and
 *   accepted (the previous clip carried a similar corner mark).
 */

export type FrameSequence = {
  /** Ordered frame URLs, 0-based. */
  frames: string[];
  /** 0-based index drawn when JS is off (CSS poster) or motion is reduced. */
  staticIndex: number;
};

const range = (count: number, base: string): string[] =>
  Array.from({ length: count }, (_, i) => `${base}/frame-${String(i + 1).padStart(3, "0")}.webp`);

export const DESKTOP_SEQUENCE: FrameSequence = {
  frames: range(192, "/landing/frames/desktop").slice(49),
  staticIndex: 61, // frame 110: gates merged around thread + diamond (iconic still)
};

export const MOBILE_SEQUENCE: FrameSequence = {
  frames: range(190, "/landing/frames/mobile").slice(49, 120), // frames 50–120: stops before the baked-in "9:16" label
  staticIndex: 70, // frame 120: settled swirl around the diamond, ring closing
};
