import Link from "next/link";
import { backtest, coverBacktest, events, replays } from "@/lib/data";
import { HourlyChart, TxLink } from "@/components/ui";
import { HeroStats, PageHero, SHELL } from "@/components/page-hero";

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
  const runs = evs.map((ev) => ({ ev, hb: backtest(ev.id), cv: coverBacktest(ev.id) })).filter((x) => x.hb && x.cv);
  const controls = runs.reduce((a, x) => a + x.hb.result.controls.length, 0);
  const falseAlarms = runs.reduce((a, x) => a + x.hb.result.control_alarms_total, 0);
  const pays = runs.map((x) => x.cv.first_payout_minus_T_hours).filter((h: number | null) => h != null) as number[];
  const ftx = runs.find((x) => x.ev.id === "ftx-2022-11");
  return (
    <>
      <PageHero
        kicker="Replay"
        title="Three real halts,"
        accent="replayed hour by hour."
        aside={
          <HeroStats
            items={[
              [ftx ? hours(ftx.hb.result.first_alarm_minus_T_hours) : "—", "our FTX alarm, against its halt"],
              [pays.length ? `T + ${Math.min(...pays).toFixed(0)}–${Math.max(...pays).toFixed(0)} h` : "—", "cover pays, all three events"],
              [`${falseAlarms} of ${controls}`, "normal weeks with a false alarm"],
              ["T + 100 days", "Nexus Mutual custody cover claim rule"],
            ]}
          />
        }
      >
        For each one we fetched ~100 days of the exchange&apos;s hot-wallet outflows on Ethereum and ran the heartbeat with
        parameters fixed before the first run. Two normal weeks per exchange are controls: the alarm must stay quiet there.
        We publish the result whatever it shows.
      </PageHero>

      <div className={SHELL}>
        {runs.map(({ ev, hb, cv }, i) => {
          const r = hb.result;
          const markers = [
            { t: ev.T, label: "exchange halt (T)", tone: "dim" as const },
            ...(ev.first_abnormal ? [{ t: ev.first_abnormal, label: "first bad transfer", tone: "dim" as const }] : []),
            ...(r.first_alarm ? [{ t: r.first_alarm, label: "our alarm", tone: "amber" as const }] : []),
          ];
          const tIdx = r.series.findIndex((s: any) => s.t >= ev.T);
          const window = r.series.slice(Math.max(0, tIdx - 36), tIdx + 24);
          const [name, when] = (NAMES[ev.id] ?? ev.id).split(" · ");
          return (
            <section key={ev.id} className={`grid gap-8 py-14 lg:grid-cols-12 lg:gap-12 lg:py-20 ${i ? "border-t border-line" : ""}`}>
              <div className="lg:col-span-4">
                <div className="eyebrow">{String(i + 1).padStart(2, "0")} · {when}</div>
                <h2 className="mt-3 text-[40px] font-medium leading-none tracking-[-0.03em] md:text-[48px]">{name}</h2>
                <p className="serif-i mt-5 text-[19px] leading-snug text-text">&ldquo;{ev.T_quote}&rdquo;</p>
                <p className="num mt-4 text-[12px] leading-relaxed text-dim">
                  T = {ev.T.replace("T", " ").replace("Z", " UTC")} · {ev.T_kind} ·{" "}
                  <a className="link" href={ev.T_source} target="_blank" rel="noreferrer">source ↗</a>
                </p>
                <div className="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-[14px] border border-line bg-line">
                  <Cell label="Our alarm" value={hours(r.first_alarm_minus_T_hours)} sub={r.first_alarm ? r.first_alarm.slice(0, 16).replace("T", " ") : "no alarm"} tone={r.first_alarm_minus_T_hours < 0 ? "blue" : "muted"} />
                  <Cell label="Control weeks" value={`${r.control_alarms_total} false alarm${r.control_alarms_total === 1 ? "" : "s"}`} sub={r.controls.map((c: any) => c.window[0].slice(0, 10)).join(" · ")} tone={r.control_alarms_total ? "amber" : "blue"} />
                  <Cell label="Cover pays" value={cv.first_payout_minus_T_hours != null ? `T + ${cv.first_payout_minus_T_hours.toFixed(0)} h` : "—"} sub="halt + 24 h challenge" tone="blue" />
                  <Cell label="Nexus Mutual" value="T + 100 d" sub="custody cover rule" tone="muted" />
                </div>
              </div>
              <div className="lg:col-span-8">
                <div className="card p-5 md:p-6">
                  <div className="mb-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-[12px] text-dim">
                    <span className="flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-sm bg-blue-2" />outflows per hour</span>
                    <span className="flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-sm bg-amber" />stall hours</span>
                    <span className="flex items-center gap-2"><i className="w-4 border-t border-dashed border-muted" />28-day median</span>
                    <span className="sm:ml-auto">36 h before T to 24 h after</span>
                  </div>
                  <HourlyChart points={window.map((s: any) => ({ t: s.t, count: s.count, median: s.median, stall: s.stall }))} markers={markers} height={220} />
                </div>
                <div className="num mt-3 text-[11px] text-dim">
                  usable hours {r.event_window_hours_with_usable_baseline}/216 · evidence {hb.evidence_sha256.slice(0, 12)}… · raw data sha256 {hb.outflows_sha256?.slice(0, 12)}…
                </div>
              </div>
            </section>
          );
        })}
      </div>

      {devnetReplays.length > 0 && (
        <section className="border-t border-line bg-surface">
          <div className={`${SHELL} grid gap-10 py-14 lg:grid-cols-12 lg:py-20`}>
            <div className="lg:col-span-4">
              <span className="pill-label">On devnet</span>
              <h2 className="mt-5 text-[34px] font-medium leading-[1.05] tracking-[-0.03em] md:text-[42px]">
                The same halt, <span className="serif-i text-ice">run for real.</span>
              </h2>
              <p className="mt-5 text-[15px] leading-relaxed text-muted">
                We replayed FTX on a fresh pool: pre-halt heartbeat and score posted, a user bought cover, the halt was posted with the
                FTX evidence hash, and after the challenge window the cover paid. Every step is a devnet transaction.
              </p>
              <Link href="/judges" className="btn btn-ghost mt-8 h-11 px-5 text-[14px]">The 60-second judge path</Link>
            </div>
            {devnetReplays.map((d) => (
              <div key={d.pool} className="lg:col-span-8">
                <ol className="overflow-hidden rounded-[14px] border border-line">
                  {Object.entries(d.txs).map(([k, v], j) => (
                    <li key={k} className="flex items-center gap-4 border-b border-line bg-panel/60 px-5 py-3.5 last:border-0">
                      <span className="num w-6 text-[12px] text-dim">{String(j + 1).padStart(2, "0")}</span>
                      <span className="num flex-1 text-[13px] text-text/90">{k}</span>
                      <TxLink sig={String(v)} label="view tx ↗" />
                    </li>
                  ))}
                </ol>
                <p className="num mt-4 text-[12px] text-dim">
                  premium {d.premium_test_usdc} test-USDC for {d.notional_test_usdc} test-USDC of cover · paid {d.paid_test_usdc} after a {d.challenge_window_secs}s challenge window
                </p>
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  );
}

function Cell({ label, value, sub, tone }: { label: string; value: string; sub: string; tone: "blue" | "amber" | "muted" }) {
  const c = tone === "blue" ? "text-blue" : tone === "amber" ? "text-amber" : "text-muted";
  return (
    <div className="bg-surface px-4 py-3.5">
      <div className="label">{label}</div>
      <div className={`num mt-1 text-[17px] ${c}`}>{value}</div>
      <div className="num mt-0.5 text-[11px] leading-snug text-dim">{sub}</div>
    </div>
  );
}
