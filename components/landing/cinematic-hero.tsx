"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { FrameSequence } from "./frame-sequences";

/**
 * CinematicHero — a scroll-controlled canvas frame sequence.
 *
 * Behaviour contract:
 * - The sequence is driven ONLY by scroll position (no autoplay, no <video>).
 *   Scrolling down advances frames; scrolling up reverses them.
 * - Frames load progressively, nearest to the current playhead first, so the
 *   full sequence is never decoded into memory up front.
 * - If a frame is not decoded yet, the nearest loaded frame is drawn instead —
 *   the canvas never flashes empty.
 * - The canvas is transparent until the first draw, so a CSS poster (a single
 *   representative frame) shows through for no-JS visitors and while loading.
 * - `prefers-reduced-motion: reduce` disables the scrub entirely: the track
 *   collapses to a normal-height hero and one static frame is drawn.
 * - Everything is sized against devicePixelRatio (capped at 2) and re-measured
 *   via ResizeObserver; all timers, observers and animation frames are torn
 *   down on unmount (React Strict Mode safe).
 */

type CinematicHeroProps = {
  /** Sequence used at viewports ≥ 768px (native 16:9 frames). */
  desktop: FrameSequence;
  /** Sequence used at viewports < 768px (native 9:16 frames). */
  mobile: FrameSequence;
  /** Accessible name for the hero region. */
  label: string;
  /** Editorial copy rendered inside the pinned viewport; fades near the end of the scrub. */
  children: ReactNode;
};

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

const smoothstep = (edge0: number, edge1: number, x: number): number => {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
};

const DESKTOP_QUERY = "(min-width: 768px)";
const REDUCED_QUERY = "(prefers-reduced-motion: reduce)";

export function CinematicHero({ desktop, mobile, label, children }: CinematicHeroProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const copyRef = useRef<HTMLDivElement>(null);
  const meterRef = useRef<HTMLSpanElement>(null);

  const [isDesktop, setIsDesktop] = useState(true);
  const [reducedMotion, setReducedMotion] = useState(false);

  // Media queries are read in an effect so SSR markup stays deterministic.
  useEffect(() => {
    const desktopMq = window.matchMedia(DESKTOP_QUERY);
    const reducedMq = window.matchMedia(REDUCED_QUERY);
    const onDesktop = () => setIsDesktop(desktopMq.matches);
    const onReduced = () => setReducedMotion(reducedMq.matches);
    onDesktop();
    onReduced();
    desktopMq.addEventListener("change", onDesktop);
    reducedMq.addEventListener("change", onReduced);
    return () => {
      desktopMq.removeEventListener("change", onDesktop);
      reducedMq.removeEventListener("change", onReduced);
    };
  }, []);

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const sequence = isDesktop ? desktop : mobile;
    const frames = sequence.frames;
    const frameCount = frames.length;

    const images = new Map<number, HTMLImageElement>();
    const pending = new Map<number, Promise<void>>();
    const failed = new Set<number>();
    let disposed = false;
    let lastDrawnIndex = -1;
    let lastWidth = -1;
    let lastHeight = -1;
    let rafId = 0;
    let scheduledId: number | undefined;
    let loaderRunning = true;

    const load = (index: number): Promise<void> => {
      const existing = pending.get(index);
      if (existing) return existing;
      const promise = new Promise<void>((resolve) => {
        const img = new Image();
        img.decoding = "async";
        img.onload = () => {
          if (disposed) return;
          images.set(index, img);
          lastDrawnIndex = -1; // allow a redraw with the newly available frame
          resolve();
        };
        img.onerror = () => {
          failed.add(index); // missing frame: excluded from loading forever, nearest loaded frame draws instead
          resolve();
        };
        img.src = frames[index];
      });
      pending.set(index, promise);
      return promise;
    };

    /** Nearest index to `center` (searching outward) that still needs loading. */
    const nearestUnloaded = (center: number): number => {
      for (let d = 0; d < frameCount; d++) {
        const up = center + d;
        if (up < frameCount && !images.has(up) && !failed.has(up) && !pending.has(up)) return up;
        const down = center - d;
        if (down >= 0 && !images.has(down) && !failed.has(down) && !pending.has(down)) return down;
      }
      return -1;
    };

    const scheduleIdle = (fn: () => void): number => {
      if (typeof window.requestIdleCallback === "function") {
        return window.requestIdleCallback(fn, { timeout: 200 });
      }
      return window.setTimeout(fn, 24);
    };

    const cancelScheduled = (id: number): void => {
      if (typeof window.cancelIdleCallback === "function") window.cancelIdleCallback(id);
      else window.clearTimeout(id);
    };

    /** Background loader: fills frames outward from the current playhead, one per idle slot. */
    const runLoader = (center: number): void => {
      if (disposed || !loaderRunning) return;
      const next = nearestUnloaded(Math.round(center));
      if (next === -1) {
        loaderRunning = false; // every frame accounted for
        return;
      }
      void load(next).then(() => {
        if (disposed || !loaderRunning) return;
        scheduledId = scheduleIdle(() => runLoader(center));
      });
    };

    const drawCover = (img: HTMLImageElement, w: number, h: number): void => {
      const imageAspect = img.naturalWidth / img.naturalHeight;
      const canvasAspect = w / h;
      let dw: number;
      let dh: number;
      if (imageAspect > canvasAspect) {
        dh = h;
        dw = h * imageAspect;
      } else {
        dw = w;
        dh = w / imageAspect;
      }
      // Aspect ratio is preserved at all times; the frame is centred and cropped
      // to cover the viewport (never stretched).
      ctx.fillStyle = "#050607";
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
    };

    /** Draw `index`, or the nearest decoded frame to it. Never clears to blank. */
    const draw = (index: number): void => {
      const w = canvas.width;
      const h = canvas.height;
      if (!w || !h) return;
      let img: HTMLImageElement | undefined;
      for (let d = 0; d < frameCount; d++) {
        const up = images.get(index + d);
        if (up) {
          img = up;
          break;
        }
        const down = images.get(index - d);
        if (down) {
          img = down;
          break;
        }
      }
      if (!img) return; // keep whatever is on screen / the CSS poster shows through
      if (index === lastDrawnIndex && w === lastWidth && h === lastHeight) return;
      drawCover(img, w, h);
      lastDrawnIndex = index;
      lastWidth = w;
      lastHeight = h;
    };

    const resize = (): void => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.max(1, Math.round(wrap.clientWidth * dpr));
      const h = Math.max(1, Math.round(wrap.clientHeight * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
        lastDrawnIndex = -1;
        lastWidth = -1;
        lastHeight = -1;
      }
      if (reducedMotion) draw(sequence.staticIndex);
    };

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(wrap);
    resize();

    if (reducedMotion) {
      // Static fallback: one representative frame, still responsive to resize.
      void load(sequence.staticIndex).then(() => {
        if (!disposed) {
          lastDrawnIndex = -1;
          draw(sequence.staticIndex);
        }
      });
      return () => {
        disposed = true;
        loaderRunning = false;
        resizeObserver.disconnect();
        if (scheduledId !== undefined) cancelScheduled(scheduledId);
        images.clear();
        pending.clear();
        failed.clear();
      };
    }

    // ---- Scroll-scrubbed mode -------------------------------------------
    let current = 0;
    let lastTime = performance.now();
    let lastMeterText = "";

    const updateOverlay = (progress: number): void => {
      const copy = copyRef.current;
      if (copy) {
        const opacity = 1 - smoothstep(0.8, 0.97, progress);
        copy.style.opacity = opacity.toFixed(3);
        copy.style.transform = `translate3d(0, ${(progress * -7).toFixed(3)}vh, 0)`;
        copy.style.visibility = progress > 0.985 ? "hidden" : "visible";
        copy.style.pointerEvents = progress > 0.92 ? "none" : "auto";
      }
      const meter = meterRef.current;
      if (meter) {
        const text = `${String(Math.min(frameCount, Math.round(current) + 1)).padStart(3, "0")} / ${String(
          frameCount,
        ).padStart(3, "0")}`;
        if (text !== lastMeterText) {
          meter.textContent = text;
          lastMeterText = text;
        }
      }
    };

    const tick = (now: number): void => {
      if (disposed) return;
      const dt = Math.min(now - lastTime, 120);
      lastTime = now;

      const track = trackRef.current;
      if (!track) return;
      const rect = track.getBoundingClientRect();
      const travel = Math.max(rect.height - window.innerHeight, 1);
      const progress = clamp01(-rect.top / travel);
      const target = progress * (frameCount - 1);

      // Frame-rate independent smoothing keeps scrubbing fluid in both directions.
      const smoothing = 1 - Math.exp(-dt / 110);
      current += (target - current) * smoothing;
      if (Math.abs(target - current) < 0.02) current = target;

      draw(Math.round(current));
      updateOverlay(progress);

      rafId = requestAnimationFrame(tick);
    };

    // Prime the first handful of frames so the top of the page is crisp at once.
    void Promise.all(Array.from({ length: 6 }, (_, i) => load(i))).then(() => {
      if (!disposed) {
        lastDrawnIndex = -1;
        draw(0);
      }
    });
    runLoader(current);
    rafId = requestAnimationFrame(tick);

    return () => {
      disposed = true;
      loaderRunning = false;
      cancelAnimationFrame(rafId);
      if (scheduledId !== undefined) cancelScheduled(scheduledId);
      resizeObserver.disconnect();
      images.clear();
      pending.clear();
      failed.clear();
    };
  }, [desktop, mobile, isDesktop, reducedMotion]);

  const posterUrl = (isDesktop ? desktop : mobile).frames[
    Math.min((isDesktop ? desktop : mobile).staticIndex, (isDesktop ? desktop : mobile).frames.length - 1)
  ];

  return (
    <section className="fl-hero" aria-label={label}>
      <div className={`fl-track${reducedMotion ? " fl-static" : ""}`} ref={trackRef}>
        <div className="fl-sticky">
          <div ref={wrapRef} className="fl-canvas-wrap" style={{ backgroundImage: `url(${posterUrl})` }}>
            <canvas ref={canvasRef} className="fl-canvas" aria-hidden="true" />
            <div className="fl-scrim" aria-hidden="true" />
          </div>
          <div ref={copyRef} className="fl-copy">
            {children}
          </div>
          <p className="fl-meter" aria-hidden="true">
            <span ref={meterRef}>000 / 000</span>
          </p>
        </div>
      </div>
    </section>
  );
}
