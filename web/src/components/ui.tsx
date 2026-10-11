import { CheckCircle, Question, WarningDiamond, WaveSine } from "@phosphor-icons/react/dist/ssr";
import type { Floor, HeartbeatState } from "@/lib/data";

export function usd(v: number | null | undefined, digits = 2): string {
  if (v == null) return "—";
  if (v >= 1e9) return `$${(v / 1e9).toFixed(digits)}B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(digits === 2 ? 1 : digits)}M`;
  if (v >= 1e3) return `$${(v / 1e3).toFixed(1)}K`;
  return `$${v.toFixed(2)}`;
}

export function amount(v: number, max = 6): string {
  return v.toLocaleString("en-US", { maximumFractionDigits: max });
}

const HB: Record<HeartbeatState, { label: string; tone: "ok" | "warn" | "dim"; icon: "ok" | "warn" | "q" }> = {
  normal: { label: "Normal pattern", tone: "ok", icon: "ok" },
  below_usual_pattern: { label: "Below its usual pattern", tone: "warn", icon: "warn" },
  halt_confirmed: { label: "Withdrawals halted", tone: "warn", icon: "warn" },
  not_enough_data: { label: "Too quiet to compare", tone: "dim", icon: "q" },
  unknown: { label: "Building 29-day history", tone: "dim", icon: "q" },
};

export function HeartbeatBadge({ state, compact = false, reason }: { state: HeartbeatState; compact?: boolean; reason?: string | null }) {
  const base = HB[state] ?? HB.unknown;
  const h = base;
  const color = h.tone === "ok" ? "text-ok" : h.tone === "warn" ? "text-amber" : "text-dim";
  const Icon = h.icon === "ok" ? CheckCircle : h.icon === "warn" ? WarningDiamond : Question;
  return (
    <span className={`inline-flex items-center gap-1.5 ${color} ${compact ? "text-xs" : "text-sm"}`}>
      <Icon size={compact ? 14 : 16} weight="bold" />
      {h.label}
    </span>
  );
}

export function ScoreBadge({ value, size = "md" }: { value: number | null; size?: "md" | "lg" }) {
  if (value == null) return <span className="text-dim num">—</span>;
  const tone = value >= 80 ? "text-blue" : value >= 60 ? "text-muted" : "text-amber";
  return (
    <span className={`num ${tone} ${size === "lg" ? "text-3xl font-semibold" : "text-sm font-medium"}`}>
      {value}
      <span className="text-dim text-[0.7em]">/100</span>
    </span>
  );
}

export function FloorCell({ floors, provers }: { floors: Floor[]; provers: number }) {
  if (!floors.length)
    return (
      <span className="text-dim text-sm">
        Not yet proven <span className="text-xs">(0 accounts)</span>
      </span>
    );
  const f = floors[0];
  return (
    <div className="leading-tight">
      <span className="num text-text text-sm">
        {amount(f.floor)} {f.asset}
      </span>
      <div className="text-dim text-[11px]">
        proven by {provers} account{provers === 1 ? "" : "s"} · a minimum, not the total
      </div>
    </div>
  );
}

export function SectionTitle({ kicker, title, children }: { kicker?: string; title: string; children?: React.ReactNode }) {
  return (
    <div className="mb-10">
      {kicker && <div className="mb-3 text-sm font-medium text-klein">{kicker}</div>}
      <h1 className="max-w-[22ch] text-[34px] font-semibold leading-[1.05] tracking-[-0.03em] md:text-[46px]">{title}</h1>
      {children && <p className="mt-4 max-w-[68ch] text-[17px] leading-relaxed text-muted">{children}</p>}
    </div>
  );
}

/** Hourly bars with an optional baseline line and markers (pure SVG, no chart library). */
export function HourlyChart({
  points,
  markers = [],
  height = 120,
}: {
  points: { t: string; count: number; median?: number; stall?: boolean }[];
  markers?: { t: string; label: string; tone?: "blue" | "amber" | "dim" }[];
  height?: number;
}) {
  if (!points.length) return <div className="text-dim text-sm">No data</div>;
  const w = 1000;
  const max = Math.max(1, ...points.map((p) => Math.max(p.count, p.median ?? 0)));
  const bw = w / points.length;
  const y = (v: number) => height - (v / max) * (height - 18);
  const idx = (t: string) => points.findIndex((p) => p.t >= t);
  const median = points.map((p, i) => `${i ? "L" : "M"}${i * bw + bw / 2},${y(p.median ?? 0)}`).join(" ");
  const placed = markers
    .map((m) => ({ ...m, i: idx(m.t) }))
    .filter((m) => m.i >= 0)
    .map((m, row) => ({ ...m, row, pct: (m.i * bw * 100) / w }));
  const color = (tone?: string) => (tone === "amber" ? "#b45309" : tone === "dim" ? "#6b7280" : "#002fa7");
  return (
    <div className="relative" style={{ paddingTop: placed.length ? placed.length * 18 + 4 : 0 }}>
      {/* labels live in HTML so they never stretch with the chart */}
      {placed.map((m) => (
        <span
          key={m.label}
          className={`absolute whitespace-nowrap font-mono text-[11px] ${m.pct > 70 ? "-translate-x-full pr-1.5" : "pl-1.5"}`}
          style={{ left: `${m.pct}%`, top: m.row * 18, color: color(m.tone) }}
        >
          {m.label}
        </span>
      ))}
      <svg viewBox={`0 0 ${w} ${height}`} className="block w-full" preserveAspectRatio="none" role="img" aria-label="hourly outflows">
        {points.map((p, i) => (
          <rect
            key={p.t}
            x={i * bw + 0.5}
            y={y(p.count)}
            width={Math.max(bw - 1, 0.5)}
            height={height - y(p.count)}
            fill={p.stall ? "#b45309" : "#002fa7"}
            opacity={p.stall ? 0.85 : 0.7}
          />
        ))}
        {points.some((p) => p.median != null) && <path d={median} fill="none" stroke="#6b7280" strokeWidth="1.5" strokeDasharray="4 3" vectorEffect="non-scaling-stroke" />}
        {placed.map((m) => (
          <line key={m.label} x1={m.i * bw} x2={m.i * bw} y1={0} y2={height} stroke={color(m.tone)} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
        ))}
      </svg>
      {placed.map((m) => (
        <span key={`tick-${m.label}`} aria-hidden className="absolute w-px" style={{ left: `${m.pct}%`, top: m.row * 18 + 15, height: placed.length * 18 + 4 - (m.row * 18 + 15), background: color(m.tone) }} />
      ))}
    </div>
  );
}

export function Pulse() {
  return <WaveSine size={14} weight="bold" className="text-blue" />;
}

export function TxLink({ sig, label }: { sig: string; label?: string }) {
  return (
    <a className="link num text-xs" href={`https://explorer.solana.com/tx/${sig}?cluster=devnet`} target="_blank" rel="noreferrer">
      {label ?? `${sig.slice(0, 8)}…${sig.slice(-6)}`}
    </a>
  );
}

/** Tiny hourly line (server-rendered SVG). Renders nothing when there is no data yet. */
export function Sparkline({ values, className = "", tone = "klein" }: { values: number[]; className?: string; tone?: "klein" | "amber" }) {
  if (values.length < 2) return null;
  const max = Math.max(1, ...values);
  const pts = values.map((v, i) => `${((i / (values.length - 1)) * 100).toFixed(2)},${(30 - (v / max) * 28).toFixed(2)}`).join(" ");
  const c = tone === "amber" ? "#b45309" : "#002fa7";
  return (
    <svg viewBox="0 0 100 32" preserveAspectRatio="none" className={className} aria-hidden>
      <polyline points={`0,32 ${pts} 100,32`} fill={c} fillOpacity={0.08} stroke="none" />
      <polyline points={pts} fill="none" stroke={c} strokeWidth={1.4} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  );
}
