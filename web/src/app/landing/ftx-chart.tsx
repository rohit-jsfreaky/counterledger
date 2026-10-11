"use client";

import { useRef } from "react";
import { motion, useInView, useReducedMotion } from "motion/react";

export type ChartPoint = { t: string; count: number };
export type ChartMark = { t: string; n: number; label: string; tone: "us" | "public" };

const W = 1000;
const H = 300;
const PAD_T = 34;
const PAD_B = 8;

/** FTX hot-wallet withdrawals per hour (3-hour average). The line draws once, then the four moments appear in order. */
export function FtxChart({ points, marks, alarmT }: { points: ChartPoint[]; marks: ChartMark[]; alarmT: string | null }) {
  const ref = useRef<SVGSVGElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.45 });
  const reduce = useReducedMotion();
  const play = reduce || inView;

  const smooth = points.map((_, i) => {
    const w = points.slice(Math.max(0, i - 1), i + 2);
    return w.reduce((a, p) => a + p.count, 0) / w.length;
  });
  const max = Math.max(...smooth) * 1.08;
  const t0 = Date.parse(points[0].t);
  const t1 = Date.parse(points[points.length - 1].t);
  const x = (ms: number) => ((ms - t0) / (t1 - t0)) * W;
  const y = (v: number) => PAD_T + (1 - v / max) * (H - PAD_T - PAD_B);
  const xy = smooth.map((v, i) => [x(Date.parse(points[i].t)), y(v)] as const);
  const split = alarmT ? Math.max(0, points.findIndex((p) => Date.parse(p.t) >= Date.parse(alarmT))) : xy.length;
  const line = (pts: (readonly [number, number])[]) => pts.map(([a, b], i) => `${i ? "L" : "M"}${a.toFixed(1)},${b.toFixed(1)}`).join("");
  const before = line(xy.slice(0, split + 1));
  const after = line(xy.slice(split));
  const area = `${line(xy)}L${W},${H}L0,${H}Z`;
  const dur = reduce ? 0 : 1.8;
  const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const ticks = Array.from({ length: Math.floor((t1 - t0) / 86400_000 / 3) + 1 }, (_, k) => t0 + k * 3 * 86400_000)
    .map((ms) => ({ ms: Math.min(ms, t1), label: `${MON[new Date(ms).getUTCMonth()]} ${new Date(ms).getUTCDate()}` }));
  const share = split / xy.length;

  return (
    <div>
      <svg ref={ref} viewBox={`0 0 ${W} ${H}`} className="h-auto w-full overflow-visible" role="img" aria-label="FTX withdrawals per hour from late October to 10 November 2022: a steady daily rhythm, then a collapse on 8 November.">
        {[0.25, 0.5, 0.75].map((f) => (
          <line key={f} x1={0} x2={W} y1={PAD_T + f * (H - PAD_T - PAD_B)} y2={PAD_T + f * (H - PAD_T - PAD_B)} stroke="rgba(255,255,255,0.07)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
        ))}
        <motion.path d={area} fill="#5b7cff" initial={{ opacity: 0 }} animate={{ opacity: play ? 0.1 : 0 }} transition={{ duration: 0.8, delay: reduce ? 0 : dur * 0.6 }} />
        <motion.path
          d={before}
          fill="none"
          stroke="#8aa4ff"
          strokeWidth={1.75}
          strokeLinejoin="round"
          strokeLinecap="round"
          initial={{ pathLength: reduce ? 1 : 0 }}
          animate={{ pathLength: play ? 1 : 0 }}
          transition={{ duration: dur * share, ease: "easeInOut" }}
        />
        <motion.path
          d={after}
          fill="none"
          stroke="#f0b45a"
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
          initial={{ pathLength: reduce ? 1 : 0 }}
          animate={{ pathLength: play ? 1 : 0 }}
          transition={{ duration: dur * (1 - share), delay: dur * share, ease: "easeOut" }}
        />
        {marks.map((m, i) => {
          const mx = x(Date.parse(m.t));
          const cy = i % 2 ? PAD_T + 20 : PAD_T - 8;
          return (
            <motion.g key={m.n} initial={{ opacity: reduce ? 1 : 0 }} animate={{ opacity: play ? 1 : 0 }} transition={{ duration: 0.35, delay: reduce ? 0 : dur + 0.15 + i * 0.35 }}>
              <line x1={mx} x2={mx} y1={cy + 12} y2={H} stroke={m.tone === "us" ? "#8aa4ff" : "#7d8492"} strokeWidth={1} strokeDasharray="3 4" vectorEffect="non-scaling-stroke" />
              <circle cx={mx} cy={cy} r={12} fill={m.tone === "us" ? "#3d5fe0" : "#0d0f12"} stroke={m.tone === "us" ? "#8aa4ff" : "rgba(255,255,255,0.3)"} strokeWidth={1.25} />
              <text x={mx} y={cy + 4.5} textAnchor="middle" fontSize={12.5} fontWeight={600} fontFamily="var(--font-jetbrains)" fill={m.tone === "us" ? "#ffffff" : "#b4bac6"}>{m.n}</text>
            </motion.g>
          );
        })}
      </svg>
      <div className="relative mt-3 h-4 font-mono text-[11px] text-dim">
        {ticks.map((tk, i) => (
          <span key={tk.label} className={`absolute top-0 whitespace-nowrap ${i === 0 ? "" : i === ticks.length - 1 ? "-translate-x-full" : "-translate-x-1/2"}`} style={{ left: `${(x(tk.ms) / W) * 100}%` }}>
            {tk.label}
          </span>
        ))}
      </div>
    </div>
  );
}
