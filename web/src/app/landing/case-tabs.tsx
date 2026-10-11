"use client";

import { useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { EASE } from "@/components/reveal";
import { MiniHalt, type HaltPoint } from "./mini-halt";

export type Case = {
  id: string;
  name: string;
  when: string;
  kind: string;
  headline: string;
  body: string;
  note: string;
  payout: string | null;
  pts: HaltPoint[];
  T: number;
};

export function CaseTabs({ cases }: { cases: Case[] }) {
  const [i, setI] = useState(0);
  const reduce = useReducedMotion();
  const c = cases[i];
  return (
    <div>
      <div role="tablist" className="flex gap-10 border-b border-line px-1">
        {cases.map((x, k) => (
          <button
            key={x.id}
            role="tab"
            aria-selected={k === i}
            onClick={() => setI(k)}
            className={`relative -mb-px pb-4 text-xl font-medium tracking-tight transition-colors md:text-2xl ${k === i ? "text-text" : "text-dim hover:text-muted"}`}
          >
            {x.name}
            {k === i && <motion.span layoutId="case-tab" className="absolute inset-x-0 -bottom-px h-[2px] bg-accent" transition={{ duration: 0.5, ease: EASE }} />}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={c.id}
          initial={reduce ? false : { opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduce ? undefined : { opacity: 0, y: -12 }}
          transition={{ duration: 0.6, ease: EASE }}
          className="grid items-center gap-14 py-16 lg:grid-cols-2"
        >
          {/* layered cards, like a desk of evidence */}
          <div className="relative mx-auto h-[360px] w-full max-w-[520px]">
            <div className="absolute left-2 top-6 w-[78%] -rotate-[3deg] rounded-[14px] border border-line-strong bg-surface p-4 shadow-[0_30px_80px_rgb(0_0_0/0.6)]">
              <div className="mb-3 flex items-center justify-between text-[12px]">
                <span className="rounded-md bg-white/[0.06] px-2 py-1 text-muted">Withdrawals per hour</span>
                <span className="rounded-md bg-white/[0.06] px-2 py-1 text-muted">halt at T</span>
              </div>
              <MiniHalt pts={c.pts} T={c.T} className="h-36 w-full" />
            </div>
            <div className="absolute bottom-4 left-[18%] w-[70%] rotate-[1.5deg] rounded-[14px] border border-line-strong bg-panel/95 p-5 font-mono text-[13px] leading-relaxed text-muted shadow-[0_30px_80px_rgb(0_0_0/0.7)] backdrop-blur">
              {c.note}
            </div>
            <div className="absolute right-4 top-24 flex h-24 w-24 rotate-[8deg] items-center justify-center rounded-[18px] bg-[linear-gradient(140deg,#3d68ff,#0b2a8f)] text-4xl font-semibold text-white shadow-[0_20px_60px_rgb(61_104_255/0.35)]">
              {c.name[0]}
            </div>
          </div>

          <div>
            <div className="eyebrow">{c.name} · {c.when} · {c.kind}</div>
            <h3 className="mt-4 text-[40px] font-medium leading-[1.05] tracking-[-0.03em] md:text-[48px]">{c.headline}</h3>
            <p className="mt-5 max-w-[46ch] text-[17px] leading-relaxed text-muted">{c.body}</p>
            <div className="mt-8 flex flex-wrap items-center gap-4">
              <Link href="/replay" className="btn btn-ghost h-12 px-6 text-[15px]">See the replay</Link>
              {c.payout && <span className="font-mono text-[13px] text-ok">{c.payout}</span>}
            </div>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
