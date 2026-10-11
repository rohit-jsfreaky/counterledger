"use client";

import { motion, useReducedMotion } from "motion/react";

// One motion for the whole site: fade + rise 40px over 1s on a long, soft ease-out.
export const EASE = [0.12, 0.23, 0.17, 0.99] as const;

/** Fade + rise into view once (on scroll, or on load with `load`). */
export function Reveal({ children, delay = 0, className, load = false }: { children: React.ReactNode; delay?: number; className?: string; load?: boolean }) {
  const reduce = useReducedMotion();
  const to = { opacity: 1, y: 0 };
  return (
    <motion.div
      className={className}
      initial={reduce ? false : { opacity: 0.001, y: 40 }}
      {...(load ? { animate: to } : { whileInView: to, viewport: { once: true, margin: "-60px" } })}
      transition={{ duration: 1, delay, ease: EASE }}
    >
      {children}
    </motion.div>
  );
}

/** Headline revealed word by word. `dimFrom` greys every word from that index on. */
export function Words({ text, className = "", dimFrom, load = false, delay = 0, stagger = 0.06 }: { text: string; className?: string; dimFrom?: number; load?: boolean; delay?: number; stagger?: number }) {
  const reduce = useReducedMotion();
  const words = text.split(" ");
  return (
    <span className={className} aria-label={text}>
      {words.map((w, i) => {
        const to = { opacity: 1, y: 0 };
        return (
          <span key={i} aria-hidden className={`inline-block overflow-hidden pb-[0.1em] align-bottom ${i < words.length - 1 ? "mr-[0.25em]" : ""}`}>
            <motion.span
              className={`inline-block ${dimFrom != null && i >= dimFrom ? "text-dim" : ""}`}
              initial={reduce ? false : { opacity: 0.001, y: 40 }}
              {...(load ? { animate: to } : { whileInView: to, viewport: { once: true, margin: "-40px" } })}
              transition={{ duration: 1, delay: delay + i * stagger, ease: EASE }}
            >
              {w}
            </motion.span>
          </span>
        );
      })}
    </span>
  );
}
