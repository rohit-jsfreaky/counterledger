export type HaltPoint = { ms: number; n: number };

/** Hourly withdrawals around a halt: blue before T, amber after, dashed line at T. Pure SVG. */
export function MiniHalt({ pts, T, className = "h-24 w-full" }: { pts: HaltPoint[]; T: number; className?: string }) {
  if (pts.length < 3) return null;
  const t0 = pts[0].ms;
  const t1 = pts[pts.length - 1].ms;
  const max = Math.max(1, ...pts.map((p) => p.n));
  const x = (ms: number) => ((ms - t0) / (t1 - t0)) * 100;
  const y = (n: number) => 38 - (n / max) * 34;
  const line = (arr: HaltPoint[]) => arr.map((p) => `${x(p.ms).toFixed(2)},${y(p.n).toFixed(2)}`).join(" ");
  const before = pts.filter((p) => p.ms <= T);
  const after = pts.filter((p) => p.ms >= T - 3600e3);
  return (
    <svg viewBox="0 0 100 40" preserveAspectRatio="none" className={className} aria-hidden>
      {before.length > 1 && <polyline points={`0,40 ${line(before)} ${x(before[before.length - 1].ms)},40`} fill="#3d68ff" fillOpacity={0.16} />}
      <polyline points={line(before)} fill="none" stroke="#8aa4ff" strokeWidth={1.4} vectorEffect="non-scaling-stroke" />
      <polyline points={line(after)} fill="none" stroke="#f0b45a" strokeWidth={1.4} vectorEffect="non-scaling-stroke" />
      <line x1={x(T)} x2={x(T)} y1={0} y2={40} stroke="rgba(255,255,255,0.4)" strokeDasharray="2 3" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
