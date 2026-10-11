import Link from "next/link";
import { ArrowRight, CheckCircle, Prohibit } from "@phosphor-icons/react/dist/ssr";
import { backtest, boardRow, coverBacktest, EXCHANGES, events, ftxGrid, proofs, replays, reservesSummary, type HeartbeatState } from "@/lib/data";
import { ATTACKS } from "@/lib/attacks";
import { usd } from "@/components/ui";
import { Reveal, Words } from "@/components/reveal";
import { FtxChart, type ChartMark } from "./landing/ftx-chart";
import { LedgerField } from "./landing/ledger-field";
import { CaseTabs, type Case } from "./landing/case-tabs";
import { EvidenceGallery } from "./landing/evidence-gallery";

const HB: Record<HeartbeatState, { text: string; tone: string }> = {
  normal: { text: "Normal", tone: "text-ok" },
  below_usual_pattern: { text: "Below usual", tone: "text-amber" },
  halt_confirmed: { text: "Halt confirmed", tone: "text-amber" },
  not_enough_data: { text: "Too quiet", tone: "text-dim" },
  unknown: { text: "Building history", tone: "text-dim" },
};

const TILE = [
  "linear-gradient(150deg,#1b3cff,#061456)",
  "linear-gradient(150deg,#e7eaf2,#9aa3b8)",
  "linear-gradient(150deg,#3d68ff,#0e1d5c)",
  "linear-gradient(150deg,#12b39a,#063a35)",
  "linear-gradient(150deg,#22262e,#0b0c0f)",
  "linear-gradient(150deg,#6d8bff,#1d2b7a)",
  "linear-gradient(150deg,#2a3346,#0d1119)",
];

function aroundT(id: string) {
  const bt = backtest(id)?.result;
  if (!bt?.series || !bt.T) return { pts: [], T: 0, lead: null as number | null };
  const T = Date.parse(bt.T);
  const pts: { ms: number; n: number }[] = bt.series
    .filter((s: any) => Date.parse(s.t) >= T - 48 * 3600e3 && Date.parse(s.t) <= T + 24 * 3600e3)
    .map((s: any) => ({ ms: Date.parse(s.t), n: s.count as number }));
  return { pts, T, lead: bt.first_alarm_minus_T_hours as number | null };
}

export default function Home() {
  const rows = EXCHANGES.map(boardRow);
  const reserves = Object.values(reservesSummary()).reduce((a: number, s: any) => a + (s.total_usd ?? 0), 0);
  const proof = proofs("coindcx")[0];
  const grid = ftxGrid();
  const points = grid.days.slice(-10).flatMap((d) => d.cells.map((c) => ({ t: c.t, count: c.count })));
  const ftxEvent = events().find((e) => e.id === "ftx-2022-11");
  const ftxBt = backtest("ftx-2022-11")?.result;
  const replay = replays()[0];
  const marks: ChartMark[] = [
    ftxBt?.first_alarm && { t: ftxBt.first_alarm, n: 1, tone: "us" as const, label: "Alarm" },
    ftxEvent && { t: ftxEvent.T, n: 2, tone: "public" as const, label: "Public" },
    replay?.historical?.halt_confirmed && { t: replay.historical.halt_confirmed, n: 3, tone: "us" as const, label: "Halt" },
    replay?.historical?.payout_due && { t: replay.historical.payout_due, n: 4, tone: "us" as const, label: "Paid" },
  ].filter(Boolean) as ChartMark[];

  const f = aroundT("ftx-2022-11");
  const w = aroundT("wazirx-2024-07");
  const b = aroundT("bitget-2026-09");
  const cvF = coverBacktest("ftx-2022-11");
  const cvW = coverBacktest("wazirx-2024-07");
  const cvB = coverBacktest("bitget-2026-09");
  const h = (x: number | null) => (x == null ? "—" : Math.abs(x).toFixed(1));
  const paid = (cv: any) => (cv?.first_payout_minus_T_hours != null ? `Cover would have paid at T+${Math.round(cv.first_payout_minus_T_hours)}h` : null);
  const cases: Case[] = [
    {
      id: "ftx", name: "FTX", when: "Nov 2022", kind: "A run, then silence", ...f,
      headline: `${h(f.lead)} hours before the news.`,
      body: "FTX's hot-wallet withdrawals ran far above normal for two days, then collapsed. Our rule, fixed before the first run, fired at 14:00 UTC on 8 November. The halt was first reported at 21:51.",
      note: `With Counterledger, the FTX alarm fired ${h(f.lead)} h before the first public report, from ${(cvF?.outflows_rows ?? 0).toLocaleString("en-US")} transfers.`,
      payout: paid(cvF),
    },
    {
      id: "wazirx", name: "WazirX", when: "Jul 2024", kind: "Hot-wallet attack", ...w,
      headline: `Confirmed ${h(w.lead)} hours after the halt.`,
      body: "A hot-wallet attack stopped withdrawals on 18 July 2024. WazirX's wallets move little, so the heartbeat confirmed the halt rather than predicting it.",
      note: "WazirX moves about 83 withdrawals a day. One normal week raised a false alarm, and we publish it.",
      payout: paid(cvW),
    },
    {
      id: "bitget", name: "Bitget", when: "Sep 2026", kind: "Reconciliation alert", ...b,
      headline: `Confirmed ${h(b.lead)} hours after the halt.`,
      body: "Bitget's risk system blocked withdrawals on 24 September 2026 after a reconciliation alert. The heartbeat saw it within hours, from the exchange's own wallets.",
      note: `${(cvB?.outflows_rows ?? 0).toLocaleString("en-US")} transfers read. No false alarms in two normal weeks.`,
      payout: paid(cvB),
    },
  ];
  const rate = (score: number | null) => (score == null ? null : (200 + (100 - score) * 30 + 10) / 100);
  const names = rows.map((r) => r.name);

  return (
    <div className="overflow-x-clip">
      {/* hero */}
      <section className="relative -mt-[72px] min-h-[100dvh] overflow-hidden">
        <div className="absolute inset-x-0 bottom-0 top-[28%] [mask-image:linear-gradient(to_bottom,transparent,#000_22%,#000_80%,transparent)]">
          <LedgerField />
        </div>
        <div className="relative mx-auto max-w-[1360px] px-5 pt-[180px] lg:px-10 lg:pt-[200px]">
          <Reveal load delay={0.1}>
            <Link href="/replay" className="inline-flex items-center gap-3 rounded-full border border-line bg-white/[0.03] py-1 pl-1 pr-4 text-[14px] text-text/90 backdrop-blur hover:bg-white/[0.06]">
              <span className="rounded-full bg-accent px-2.5 py-0.5 font-mono text-[12px] text-white">Replay</span>
              FTX: our alarm fired {h(f.lead)} hours early
            </Link>
          </Reveal>
          <Reveal load delay={0.2}>
            <p className="mt-10 text-[22px] font-medium tracking-[-0.01em] text-muted md:text-[26px]">Proof of liabilities, on Solana</p>
          </Reveal>
          <h1 className="mt-3 text-[44px] leading-[1.04] tracking-[-0.035em] sm:text-[60px] lg:text-[72px]">
            <Words load delay={0.3} text="Your exchange shows you a balance." />
            <br />
            <span className="serif-i text-[50px] leading-[1.1] sm:text-[68px] lg:text-[84px]">
              <Words load delay={0.6} text="Now you can check it." />
            </span>
          </h1>
        </div>

        <div className="absolute inset-x-0 bottom-0">
          <div className="relative overflow-hidden py-6 [mask-image:linear-gradient(to_right,transparent,#000_12%,#000_88%,transparent)]">
            <div className="marquee flex w-max items-center gap-20">
              {[...names, ...names].map((n, i) => (
                <span key={i} className="text-[34px] font-semibold tracking-[-0.03em] text-text/80 md:text-[40px]">{n}</span>
              ))}
            </div>
          </div>
          <p className="pb-10 text-center font-mono text-[13px] text-dim">
            {rows.length} exchanges watched every hour · {usd(reserves, 1)} in their listed wallets
          </p>
        </div>
      </section>

      {/* case studies */}
      <section className="mx-auto max-w-[1180px] px-5 pt-32 lg:px-10 lg:pt-44">
        <h2 className="text-center text-[38px] leading-[1.08] tracking-[-0.03em] md:text-[56px]">
          <Words text="Tested on real withdrawal halts" />
          <br />
          <span className="serif-i text-[42px] md:text-[64px]"><Words text="FTX, WazirX & Bitget." delay={0.2} /></span>
        </h2>
        <Reveal className="mt-16">
          <CaseTabs cases={cases} />
        </Reveal>
      </section>

      {/* products */}
      <section className="mx-auto max-w-[1280px] px-5 pt-24 lg:px-10 lg:pt-32">
        <div className="text-center">
          <span className="pill-label">Product</span>
          <h2 className="mt-5 text-[38px] tracking-[-0.03em] md:text-[52px]"><Words text="One ledger, three parts" /></h2>
        </div>
        <div className="mt-14 grid gap-3 lg:grid-cols-12">
          {/* prove */}
          <Reveal className="lg:col-span-5">
            <article className="flex h-full flex-col overflow-hidden rounded-[16px] border border-line bg-surface">
              <div className="p-8">
                <div className="text-[15px] font-medium text-blue">Prove</div>
                <h3 className="mt-3 text-[26px] leading-[1.15] tracking-[-0.02em]">Prove what your exchange owes you</h3>
                <p className="mt-4 text-[15px] leading-relaxed text-muted">Log in to your exchange in a secure window. A signed proof of your balance is checked inside our Solana program and adds to a public floor.</p>
                <Link href="/prove" className="mt-5 inline-block font-mono text-[13px] text-blue hover:text-ice">Prove my balance &gt;</Link>
              </div>
              <div className="mt-auto border-t border-line bg-[radial-gradient(80%_90%_at_50%_100%,#0d1d5e_0%,transparent_70%)] p-6">
                {proof && (
                  <div className="rounded-[12px] border border-line-strong bg-black/60 p-5 backdrop-blur">
                    <div className="flex items-center justify-between text-[13px]">
                      <span className="font-medium">CoinDCX balance proof</span>
                      <span className="inline-flex items-center gap-1.5 text-[12px] text-ok"><CheckCircle size={13} weight="fill" /> Verified</span>
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-3 font-mono text-[12px]">
                      <span className="rounded-lg bg-white/[0.05] px-3 py-2"><span className="block text-dim">Balance</span>{proof.bucketLabel}</span>
                      <span className="rounded-lg bg-white/[0.05] px-3 py-2"><span className="block text-dim">Fingerprint</span>{proof.nullifier.slice(0, 10)}…</span>
                    </div>
                  </div>
                )}
              </div>
            </article>
          </Reveal>

          {/* watch */}
          <Reveal className="lg:col-span-7" delay={0.08}>
            <article className="flex h-full flex-col overflow-hidden rounded-[16px] border border-line bg-surface">
              <div className="p-8">
                <div className="text-[15px] font-medium text-blue">Watch</div>
                <h3 className="mt-3 text-[26px] leading-[1.15] tracking-[-0.02em]">See withdrawals stop before the news does</h3>
                <p className="mt-4 max-w-[52ch] text-[15px] leading-relaxed text-muted">Every hour, money leaving each exchange&apos;s own wallets is compared with the same hour over its last 28 days. Below: FTX, November 2022.</p>
                <Link href="/replay" className="mt-5 inline-block font-mono text-[13px] text-blue hover:text-ice">See every replay &gt;</Link>
              </div>
              <div className="mt-auto border-t border-line px-6 pb-5 pt-6">
                <FtxChart points={points} marks={marks} alarmT={ftxBt?.first_alarm ?? null} />
              </div>
            </article>
          </Reveal>

          {/* cover */}
          <Reveal className="lg:col-span-7">
            <article className="flex h-full flex-col overflow-hidden rounded-[16px] border border-line bg-surface">
              <div className="p-8">
                <div className="text-[15px] font-medium text-blue">Cover</div>
                <h3 className="mt-3 text-[26px] leading-[1.15] tracking-[-0.02em]">Get paid if withdrawals stop</h3>
                <p className="mt-4 max-w-[52ch] text-[15px] leading-relaxed text-muted">One pool per exchange, priced from its score. A confirmed halt that nobody challenges pays every live cover in full. Devnet and test-USDC: a protocol demo, not insurance.</p>
                <Link href="/cover" className="mt-5 inline-block font-mono text-[13px] text-blue hover:text-ice">Open the cover market &gt;</Link>
              </div>
              <div className="mt-auto space-y-2 border-t border-line p-5">
                {rows.filter((r) => r.score != null).slice(0, 4).map((r) => (
                  <div key={r.id} className="flex items-center justify-between rounded-[12px] bg-white/[0.03] px-4 py-3">
                    <span className="flex items-center gap-3">
                      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/[0.07] text-[14px] font-semibold">{r.name[0]}</span>
                      <span>
                        <span className="block text-[15px] font-medium">{r.name}</span>
                        <span className={`block font-mono text-[12px] ${HB[r.heartbeatState].tone}`}>{HB[r.heartbeatState].text}</span>
                      </span>
                    </span>
                    <span className="text-right">
                      <span className="block font-mono text-[15px]">{rate(r.score)?.toFixed(1)}%</span>
                      <span className="block font-mono text-[11px] text-dim">score {r.score}</span>
                    </span>
                  </div>
                ))}
              </div>
            </article>
          </Reveal>

          {/* attacks */}
          <Reveal className="lg:col-span-5" delay={0.08}>
            <article className="flex h-full flex-col overflow-hidden rounded-[16px] border border-line bg-surface">
              <div className="p-8">
                <div className="text-[15px] font-medium text-blue">Break it</div>
                <h3 className="mt-3 text-[26px] leading-[1.15] tracking-[-0.02em]">We tried to cheat it. The program said no.</h3>
                <Link href="/break" className="mt-5 inline-block font-mono text-[13px] text-blue hover:text-ice">Run the attacks &gt;</Link>
              </div>
              <ul className="mt-auto space-y-1.5 border-t border-line p-5">
                {ATTACKS.filter((a) => a.id !== "control").slice(0, 5).map((a) => (
                  <li key={a.id} className="flex items-center gap-3 rounded-[10px] bg-white/[0.03] px-3.5 py-2.5 text-[14px]">
                    <Prohibit size={15} className="shrink-0 text-dim" />
                    <span className="flex-1 truncate text-muted">{a.title}</span>
                    <span className="shrink-0 font-mono text-[11px] text-amber">rejected</span>
                  </li>
                ))}
              </ul>
            </article>
          </Reveal>
        </div>
      </section>

      {/* watching: fan of exchanges */}
      <section className="mx-auto max-w-[1280px] px-5 pt-32 lg:px-10 lg:pt-44">
        <h2 className="text-center text-[38px] tracking-[-0.03em] md:text-[56px]"><Words text="Watching every hour" /></h2>
        <div className="relative mx-auto mt-16 h-[200px] max-w-[1000px] origin-top scale-[0.42] sm:h-[260px] sm:scale-[0.7] md:h-[320px] md:scale-100">
          {rows.map((r, i) => {
            const mid = (rows.length - 1) / 2;
            const off = i - mid;
            return (
              <Link
                key={r.id}
                href={`/x/${r.id}`}
                className="group absolute left-1/2 top-6 flex h-[168px] w-[132px] flex-col justify-between rounded-[22px] border border-white/10 p-4 shadow-[0_30px_70px_rgb(0_0_0/0.65)] transition-transform duration-500 hover:z-10 hover:-translate-y-3 md:h-[196px] md:w-[152px]"
                style={{ background: TILE[i % TILE.length], transform: `translateX(calc(-50% + ${off * 138}px)) translateY(${off * off * 7}px) rotate(${off * 4.5}deg)`, zIndex: 10 - Math.round(Math.abs(off)) }}
              >
                <span className={`text-[44px] font-semibold leading-none ${i === 1 ? "text-black/80" : "text-white/90"}`}>{r.name[0]}</span>
                <span className={`text-[14px] font-medium ${i === 1 ? "text-black/75" : "text-white/85"}`}>{r.name}</span>
              </Link>
            );
          })}
        </div>
      </section>

      {/* evidence */}
      <section className="mx-auto max-w-[1280px] border-t border-line px-5 py-28 lg:px-10 lg:py-40">
        <div className="grid items-center gap-12 lg:grid-cols-12">
          <Reveal className="lg:col-span-4">
            <h2 className="text-[34px] tracking-[-0.03em] md:text-[40px]">Check every claim</h2>
            <p className="mt-5 max-w-[34ch] text-[17px] leading-relaxed text-muted">Replays, attacks, a real proof and one command that recomputes every number on this site.</p>
            <Link href="/judges" className="btn btn-ghost mt-8 h-12 px-6 text-[15px]">For judges</Link>
          </Reveal>
          <Reveal className="lg:col-span-8" delay={0.1}>
            <EvidenceGallery
              items={[
                { title: "Three halts, replayed hour by hour", tag: "Replay", href: "/replay", art: "radial-gradient(70% 60% at 50% 60%,#2b5cff 0%,#0a1a66 45%,#020414 100%)" },
                { title: "Seven attacks, all rejected on devnet", tag: "Attacks", href: "/break", art: "radial-gradient(80% 70% at 30% 30%,#14b8a6 0%,#073b3a 50%,#010807 100%)" },
                { title: "A real CoinDCX proof, verified on Solana", tag: "Proof", href: proof?.explorer ?? "/x/coindcx", art: "linear-gradient(160deg,#6d8bff 0%,#1d2b7a 50%,#05081c 100%)" },
                { title: "Check your record in Binance's liability tree", tag: "Inclusion", href: "/x/binance", art: "radial-gradient(60% 80% at 70% 20%,#c9d2e8 0%,#4a5570 40%,#0b0e16 100%)" },
                { title: "One command recomputes every number", tag: "Verify", href: "/judges", art: "radial-gradient(70% 70% at 50% 100%,#3d68ff 0%,#14204f 50%,#03050d 100%)" },
              ]}
            />
          </Reveal>
        </div>
      </section>

      {/* closing */}
      <section className="relative overflow-hidden">
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(55%_70%_at_60%_95%,#1d3fd1_0%,#0a1650_35%,transparent_70%)] blur-2xl" />
        <div className="relative mx-auto max-w-[1180px] px-5 py-36 text-center lg:py-48">
          <h2 className="text-[42px] leading-[1.05] tracking-[-0.035em] text-text md:text-[64px]">
            <Words text="Your balance is a fact." />
            <br />
            <span className="serif-i text-[48px] md:text-[76px]"><Words text="Prove it." delay={0.2} /></span>
          </h2>
          <Reveal delay={0.3}>
            <Link href="/prove" className="btn btn-ghost mt-10 h-12 px-7 text-[15px] backdrop-blur">Prove my balance <ArrowRight size={16} /></Link>
          </Reveal>
        </div>
      </section>
    </div>
  );
}
