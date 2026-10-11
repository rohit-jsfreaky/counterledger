import Link from "next/link";
import { backtest, coverBacktest, events, replays } from "@/lib/data";
import { HourlyChart, SectionTitle, TxLink } from "@/components/ui";

export const metadata = { title: "Replay — Counterledger" };

const NAMES: Record<string, string> = { "ftx-2022-11": "FTX · Nov 2022", "wazirx-2024-07": "WazirX · Jul 2024", "bitget-2026-09": "Bitget · Sep 2026" };

function hours(h: number | null | undefined) {
  if (h == null) return "—";
  const a = Math.abs(h);
  return `${a.toFixed(1)} h ${h < 0 ? "before" : "after"}`;
}

export default function Replay() {
  const evs = events();
  const devnetReplays = replays();
  return (
    <div className="mx-auto max-w-[1280px] px-5 py-14 lg:px-8 lg:py-20">
      <SectionTitle kicker="Replay" title="Three real halts, replayed hour by hour">
        For each one we fetched ~100 days of the exchange&apos;s hot-wallet outflows on Ethereum and ran the heartbeat with
        parameters fixed before the first run. Two normal weeks per exchange are controls: the alarm must stay quiet there.
        We publish the result whatever it shows.
      </SectionTitle>

      <div className="space-y-6">
        {evs.map((ev) => {
          const hb = backtest(ev.id);
          const cv = coverBacktest(ev.id);
          if (!hb || !cv) return null;
          const r = hb.result;
          const markers = [
            { t: ev.T, label: "exchange halt (T)", tone: "dim" as const },
            ...(ev.first_abnormal ? [{ t: ev.first_abnormal, label: "first bad transfer", tone: "dim" as const }] : []),
            ...(r.first_alarm ? [{ t: r.first_alarm, label: "our alarm", tone: "amber" as const }] : []),
          ];
          const tIdx = r.series.findIndex((s: any) => s.t >= ev.T);
          const window = r.series.slice(Math.max(0, tIdx - 36), tIdx + 24);
          return (
            <section key={ev.id} className="card p-5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-lg font-semibold">{NAMES[ev.id] ?? ev.id}</h3>
                <a className="link text-xs" href={ev.T_source}>source for T ↗</a>
              </div>
              <p className="mt-1 text-sm text-dim">
                T = {ev.T.replace("T", " ").replace("Z", " UTC")} · {ev.T_kind} · &ldquo;{ev.T_quote}&rdquo;
              </p>
              <div className="mt-4">
                <HourlyChart points={window.map((s: any) => ({ t: s.t, count: s.count, median: s.median, stall: s.stall }))} markers={markers} height={150} />
              </div>
              <div className="mt-1 text-[11px] text-dim">36 h before T to 24 h after · blue bars = outflows per hour · amber = stall hours · dashed = 28-day median</div>
              <div className="mt-4 grid gap-3 md:grid-cols-4">
                <Cell label="Our alarm" value={hours(r.first_alarm_minus_T_hours)} sub={r.first_alarm ?? "no alarm"} tone={r.first_alarm_minus_T_hours < 0 ? "blue" : "muted"} />
                <Cell label="Control weeks" value={`${r.control_alarms_total} false alarm${r.control_alarms_total === 1 ? "" : "s"}`} sub={r.controls.map((c: any) => c.window[0].slice(0, 10)).join(" · ")} tone={r.control_alarms_total ? "amber" : "blue"} />
                <Cell label="Cover pays" value={cv.first_payout_minus_T_hours != null ? `T + ${cv.first_payout_minus_T_hours.toFixed(0)} h` : "—"} sub="halt confirmed + 24 h challenge" tone="blue" />
                <Cell label="Nexus Mutual" value="T + 100 days" sub="custody cover claim rule" tone="muted" />
              </div>
              <div className="mt-3 text-xs text-dim">
                Usable hours in the event window: {r.event_window_hours_with_usable_baseline}/216 · evidence{" "}
                <span className="num">{hb.evidence_sha256.slice(0, 12)}…</span> · raw data sha256 <span className="num">{hb.outflows_sha256?.slice(0, 12)}…</span>
              </div>
            </section>
          );
        })}
      </div>

      {devnetReplays.length > 0 && (
        <section className="card mt-8 p-5">
          <div className="label mb-2 text-blue">The same halt, run on devnet</div>
          <p className="text-sm text-muted">
            We replayed FTX on a fresh pool: pre-halt heartbeat and score posted, a user bought cover, the halt was posted with the
            FTX evidence hash, and after the challenge window the cover paid. Every step is a devnet transaction.
          </p>
          {devnetReplays.map((d) => (
            <div key={d.pool} className="mt-4 grid gap-2 text-xs md:grid-cols-4">
              {Object.entries(d.txs).map(([k, v]) => (
                <div key={k} className="well flex items-center justify-between p-2">
                  <span className="num text-muted">{k}</span>
                  <TxLink sig={String(v)} label="tx ↗" />
                </div>
              ))}
              <div className="md:col-span-4 text-dim">
                Premium {d.premium_test_usdc} test-USDC for {d.notional_test_usdc} test-USDC of cover · paid {d.paid_test_usdc} after a {d.challenge_window_secs}s challenge window.
              </div>
            </div>
          ))}
          <Link href="/judges" className="link mt-4 inline-block text-sm">Judges: the 60-second path →</Link>
        </section>
      )}
    </div>
  );
}

function Cell({ label, value, sub, tone }: { label: string; value: string; sub: string; tone: "blue" | "amber" | "muted" }) {
  const c = tone === "blue" ? "text-blue" : tone === "amber" ? "text-amber" : "text-muted";
  return (
    <div className="well p-3">
      <div className="label">{label}</div>
      <div className={`num mt-1 text-lg ${c}`}>{value}</div>
      <div className="num text-[11px] text-dim">{sub}</div>
    </div>
  );
}
