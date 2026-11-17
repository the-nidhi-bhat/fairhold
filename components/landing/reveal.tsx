"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * Reveal — minimal scroll-reveal wrapper (IntersectionObserver, CSS-owned motion).
 * Adds `.fl-in` once when the element enters the viewport; the transition itself
 * lives in CSS so there is exactly one animation owner. Under
 * `prefers-reduced-motion` the global CSS override makes the reveal instant.
 * With JavaScript disabled the `scripting: none` media query in CSS keeps
 * content fully visible.
 */

type RevealTag = "div" | "li" | "article" | "section";

type RevealProps = {
  children: ReactNode;
  className?: string;
  as?: RevealTag;
};

export function Reveal({ children, className, as = "div" }: RevealProps) {
  const ref = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      el.classList.add("fl-in");
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            el.classList.add("fl-in");
            observer.disconnect();
          }
        }
      },
      { threshold: 0.15, rootMargin: "0px 0px -8% 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const Tag = as;
  return (
    <Tag
      ref={ref as never}
      className={className ? `fl-reveal ${className}` : "fl-reveal"}
    >
      {children}
    </Tag>
  );
}
