"use client";

import { useEffect } from "react";
import Lenis from "lenis";

/** Lenis smooth scrolling; off when the visitor prefers reduced motion. */
export function SmoothScroll() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const lenis = new Lenis({ autoRaf: true, lerp: 0.12 });
    return () => lenis.destroy();
  }, []);
  return null;
}
