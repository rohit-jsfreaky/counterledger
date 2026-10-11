"use client";

import { useEffect, useRef } from "react";
import { animate, useInView, useReducedMotion } from "motion/react";

/** Counts up once when it scrolls into view. The final value is in the markup, so it reads correctly without JS. */
export function CountUp({ to, decimals = 0, suffix = "" }: { to: number; decimals?: number; suffix?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.6 });
  const reduce = useReducedMotion();
  // after hydration, park at 0 until it is seen (the server markup keeps the real value for no-JS and crawlers)
  useEffect(() => {
    if (!reduce && ref.current && !inView) ref.current.textContent = `${(0).toFixed(decimals)}${suffix}`;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!inView || reduce || !ref.current) return;
    const el = ref.current;
    const controls = animate(0, to, {
      duration: 1.2,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => (el.textContent = `${v.toFixed(decimals)}${suffix}`),
    });
    return () => controls.stop();
  }, [inView, reduce, to, decimals, suffix]);
  return <span ref={ref}>{`${to.toFixed(decimals)}${suffix}`}</span>;
}
