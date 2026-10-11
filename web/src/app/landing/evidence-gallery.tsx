"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowUpRight } from "@phosphor-icons/react";

export type Evidence = { title: string; tag: string; href: string; art: string };

/** One open card, the rest as numbered slivers; hover or focus opens a card. */
export function EvidenceGallery({ items }: { items: Evidence[] }) {
  const [open, setOpen] = useState(0);
  return (
    <div className="flex h-[440px] gap-2.5 md:h-[500px]">
      {items.map((it, i) => {
        const on = i === open;
        const ext = it.href.startsWith("http");
        const cls = `group relative isolate overflow-hidden rounded-[14px] border border-line transition-[flex-grow] duration-700 ease-[cubic-bezier(0.12,0.23,0.17,0.99)] ${on ? "grow-[7]" : "grow"} basis-0 min-w-[56px]`;
        const inner = (
          <>
            <div className="absolute inset-0 -z-10" style={{ background: it.art }} />
            <div className="grain absolute inset-0 -z-10" />
            <div className="absolute inset-x-0 bottom-0 -z-10 h-2/3 bg-gradient-to-t from-black/85 to-transparent" />
            <span className="absolute left-4 top-4 font-mono text-[13px] text-white/80">{String(i + 1).padStart(2, "0")}</span>
            <div className={`absolute inset-x-6 bottom-6 transition-opacity duration-500 ${on ? "opacity-100" : "opacity-0"}`}>
              <div className="max-w-[18ch] text-[28px] font-medium leading-[1.08] tracking-[-0.02em] text-white md:text-[34px]">{it.title}</div>
              <div className="mt-4 flex items-center justify-between font-mono text-[12px] uppercase tracking-[0.06em] text-white/70">
                {it.tag} <ArrowUpRight size={16} />
              </div>
            </div>
          </>
        );
        return ext ? (
          <a key={it.title} href={it.href} target="_blank" rel="noreferrer" onMouseEnter={() => setOpen(i)} onFocus={() => setOpen(i)} className={cls} aria-label={it.title}>
            {inner}
          </a>
        ) : (
          <Link key={it.title} href={it.href} onMouseEnter={() => setOpen(i)} onFocus={() => setOpen(i)} className={cls} aria-label={it.title}>
            {inner}
          </Link>
        );
      })}
    </div>
  );
}
