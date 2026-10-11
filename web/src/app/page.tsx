import Link from "next/link";
import { ArrowRight, ArrowUpRight, CheckCircle, EyeSlash, Fingerprint, Prohibit, ShieldCheck, WaveSine } from "@phosphor-icons/react/dist/ssr";
import { backtest, boardRow, coverBacktest, EXCHANGES, events, ftxGrid, liveHourly, proofs, replays, type HeartbeatState } from "@/lib/data";
import { ATTACKS } from "@/lib/attacks";
import { usd } from "@/components/ui";
import { Rise } from "./landing/rise";
import { CountUp } from "./landing/count-up";
import { FtxChart, type ChartMark } from "./landing/ftx-chart";

const MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const when = (iso: string, time = true) => {
  const d = new Date(iso);
  const day = `${MONTH[d.getUTCMonth()]} ${d.getUTCDate()}`;
  return time ? `${day}, ${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")} UTC` : `${day}, ${d.getUTCFullYear()}`;
};

const HB: Record<HeartbeatState, { text: string; dot: string }> = {
  normal: { text: "Withdrawals normal", dot: "bg-ok" },
  below_usual_pattern: { text: "Below its usual pattern", dot: "bg-amber" },
  halt_confirmed: { text: "Halt confirmed", dot: "bg-amber" },
  not_enough_data: { text: "Too quiet to compare", dot: "bg-line-strong" },
  unknown: { text: "Building history", dot: "bg-line-strong" },
};

export default function Home() {
  const rows = EXCHANGES.map(boardRow);
  const grid = ftxGrid();
  const points = grid.days.slice(-10).flatMap((d) => d.cells.map((c) => ({ t: c.t, count: c.count })));
  const ftxEvent = events().find((e) => e.id === "ftx-2022-11");
  const ftxBt = backtest("ftx-2022-11")?.result;
  const ftxCover = coverBacktest("ftx-2022-11");
  const replay = replays()[0];
  const proof = proofs("coindcx")[0];
  const bitget = rows.find((r) => r.id === "bitget")!;
  const pulse = liveHourly("bitget", 72);
  const pulseMax = Math.max(1, ...pulse.map((p) => p.n));
  const bts = ["ftx-2022-11", "wazirx-2024-07", "bitget-2026-09"].map((id) => ({ hb: backtest(id)?.result, cv: coverBacktest(id) }));
  const controlWeeks = bts.reduce((a, b) => a + (b.hb?.controls?.length ?? 0), 0);
  const falseAlarms = bts.reduce((a, b) => a + (b.hb?.control_alarms_total ?? 0), 0);
  const falsePayouts = bts.reduce((a, b) => a + (b.cv?.control_false_halts ?? 0), 0);
  const words = (n: number, w: string) => `${n === 0 ? "no" : n === 1 ? "one" : n} ${w}${n === 1 ? "" : "s"}`;
  const lead = Math.abs(ftxBt?.first_alarm_minus_T_hours ?? 0);
  const payH = Math.round(ftxCover?.first_payout_minus_T_hours ?? 0);
  const nexusDays = ftxCover?.nexus_earliest_claim_days_after_T ?? 100;
  const watched = rows.length;

  const marks: (ChartMark & { text: string })[] = [
    ftxBt?.first_alarm && { t: ftxBt.first_alarm, n: 1, tone: "us" as const, label: "Alarm", text: "Our alarm fires: three straight hours under a quarter of the usual level." },
    ftxEvent && { t: ftxEvent.T, n: 2, tone: "public" as const, label: "Public", text: "First public report that FTX has halted withdrawals." },
    replay?.historical?.halt_confirmed && { t: replay.historical.halt_confirmed, n: 3, tone: "us" as const, label: "Halt", text: "A full day under a tenth of normal. Halt confirmed; a 24-hour challenge window opens." },
    replay?.historical?.payout_due && { t: replay.historical.payout_due, n: 4, tone: "us" as const, label: "Paid", text: "No challenge. Cover pays out in full." },
  ].filter(Boolean) as (ChartMark & { text: string })[];

  return (
    <div className="overflow-x-clip">
      {/* 1. hero */}
      <section className="px-3 pt-3 sm:px-5 sm:pt-5">
        <div className="grain relative mx-auto max-w-[1360px] overflow-visible rounded-[28px] bg-klein text-white">
          <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 rounded-[28px] bg-[radial-gradient(70%_80%_at_85%_10%,#1f56e0_0%,transparent_60%),radial-gradient(60%_70%_at_0%_100%,#001f73_0%,transparent_70%)]" />
          <div className="px-6 pt-14 sm:px-10 md:px-14 lg:pt-20">
            <Rise>
              <Link href="/board" className="inline-flex items-center gap-2.5 rounded-full bg-white/10 px-3.5 py-1.5 text-[13px] text-ice ring-1 ring-white/15 hover:bg-white/15">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#7ee2c7] opacity-70 motion-reduce:animate-none" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-[#7ee2c7]" />
                </span>
                Watching {watched} exchanges, every hour
              </Link>
            </Rise>
            <Rise delay={0.06}>
              <h1 className="mt-8 text-[44px] font-semibold leading-[1.02] tracking-[-0.035em] sm:text-[56px] xl:text-[68px]">
                Your exchange shows you a balance.
                <br className="hidden lg:block" />{" "}
                <span className="text-ice/55">Now you can check it.</span>
              </h1>
            </Rise>
          </div>
          <div className="grid gap-12 px-6 pb-14 pt-10 sm:px-10 md:px-14 lg:grid-cols-12 lg:gap-8 lg:pb-0 lg:pt-12">
            <div className="lg:col-span-6 lg:pb-20">
              <Rise delay={0.12}>
                <p className="max-w-[40ch] text-lg leading-relaxed text-ice/85 sm:text-xl">
                  Prove the balance you hold, see when withdrawals slow down, and get paid if they stop.
                </p>
              </Rise>
              <Rise delay={0.18}>
                <div className="mt-9 flex flex-wrap gap-3">
                  <Link href="/prove" className="inline-flex h-12 items-center gap-2 rounded-full bg-white px-6 text-[15px] font-semibold text-klein transition hover:bg-ice active:scale-[0.98]">
                    Prove my balance <ArrowRight size={16} weight="bold" />
                  </Link>
                  <Link href="/board" className="inline-flex h-12 items-center rounded-full px-6 text-[15px] font-medium text-white ring-1 ring-white/30 transition hover:bg-white/10">
                    Open the board
                  </Link>
                </div>
              </Rise>
            </div>

            {proof && (
              <Rise delay={0.24} className="lg:col-span-5 lg:col-start-8 lg:self-end">
                <div className="rounded-2xl bg-surface p-6 text-text shadow-[0_30px_80px_-20px_rgb(0_20_80/0.45)] lg:-mb-20">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Balance proof</span>
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-ok/10 px-2.5 py-1 text-[12px] font-medium text-ok">
                      <CheckCircle size={14} weight="fill" /> Verified on Solana
                    </span>
                  </div>
                  <dl className="mt-6 space-y-3.5 text-[14px]">
                    <div className="flex justify-between gap-4"><dt className="text-dim">Exchange</dt><dd className="font-medium">CoinDCX</dd></div>
                    <div className="flex justify-between gap-4"><dt className="text-dim">Balance</dt><dd className="font-mono">{proof.bucketLabel}</dd></div>
                    <div className="flex justify-between gap-4"><dt className="text-dim">Account fingerprint</dt><dd className="truncate font-mono text-blue">{proof.nullifier.slice(0, 14)}…</dd></div>
                    <div className="flex justify-between gap-4"><dt className="text-dim">Signed by</dt><dd className="font-mono">Reclaim attestor</dd></div>
                  </dl>
                  <div className="mt-6 flex items-center justify-between gap-3 border-t border-line pt-4 text-[13px]">
                    <span className="text-dim">CoinDCX floor: proven by {rows.find((r) => r.id === "coindcx")?.provers ?? 1} account, a minimum</span>
                    <a href={proof.explorer} target="_blank" rel="noreferrer" className="inline-flex shrink-0 items-center gap-1 text-blue hover:underline">
                      Tx <ArrowUpRight size={12} />
                    </a>
                  </div>
                </div>
              </Rise>
            )}
          </div>
        </div>
      </section>

      {/* 2. exchanges strip */}
      <section className="mx-auto max-w-[1280px] px-5 pb-6 pt-16 lg:px-8 lg:pt-32">
        <div className="text-sm text-dim">Reserves and withdrawals watched from each exchange&apos;s own public wallets</div>
        <div className="mt-5 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-4 lg:grid-cols-7">
          {rows.map((r) => (
            <Link key={r.id} href={`/x/${r.id}`} className="group bg-surface px-4 py-4 transition-colors hover:bg-panel">
              <div className="flex items-center justify-between">
                <span className="font-semibold">{r.name}</span>
                {r.indian && <span className="font-mono text-[10px] text-dim">IN</span>}
              </div>
              <div className="mt-1 font-mono text-[13px] text-muted">{r.reservesUsd == null ? "no list" : usd(r.reservesUsd)}</div>
              <div className="mt-2 flex items-center gap-1.5 text-[12px] text-dim">
                <span className={`h-1.5 w-1.5 rounded-full ${HB[r.heartbeatState].dot}`} />
                {HB[r.heartbeatState].text}
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* 3. the FTX story */}
      <section className="mx-auto max-w-[1280px] px-5 py-24 lg:px-8 lg:py-32">
        <h2 className="max-w-[24ch] text-[38px] font-semibold leading-[1.04] tracking-[-0.03em] md:text-[54px]">
          FTX, November 2022. <span className="text-dim">The withdrawals stopped before the news did.</span>
        </h2>
        <div className="mt-14 rounded-2xl border border-line bg-surface p-5 sm:p-8">
          <div className="flex flex-wrap items-baseline justify-between gap-2 text-[13px] text-dim">
            <span>FTX hot-wallet withdrawals on Ethereum, per hour (3-hour average)</span>
            <span className="font-mono">Nov 1 to Nov 10, 2022</span>
          </div>
          <div className="mt-6">
            <FtxChart points={points} marks={marks} alarmT={ftxBt?.first_alarm ?? null} />
          </div>
          <ol className="mt-8 grid gap-x-8 gap-y-5 border-t border-line pt-7 sm:grid-cols-2">
            {marks.map((m) => (
              <li key={m.n} className="flex gap-3.5">
                <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full font-mono text-[11px] font-semibold ${m.tone === "us" ? "bg-klein text-white" : "border border-line-strong text-muted"}`}>{m.n}</span>
                <div>
                  <div className="font-mono text-[12px] text-dim">{when(m.t)}</div>
                  <p className="mt-0.5 text-[15px] leading-snug">
                    {m.text}
                    {m.tone === "public" && ftxEvent && (
                      <a href={ftxEvent.T_source} target="_blank" rel="noreferrer" className="ml-1.5 inline-flex items-center text-blue hover:underline">
                        CoinDesk <ArrowUpRight size={12} />
                      </a>
                    )}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </div>

        <div className="mt-6 grid gap-px overflow-hidden rounded-2xl border border-line bg-line md:grid-cols-3">
          {[
            { v: lead, d: 1, s: "h", t: "earlier than the first public report of the halt" },
            { v: payH, d: 0, s: "h", t: "from that report to a full cover payout" },
            { v: nexusDays, d: 0, s: " days", t: "before a claim could even start under today's custody cover" },
          ].map((n) => (
            <div key={n.t} className="bg-surface p-7">
              <div className="font-mono text-[44px] font-medium leading-none tracking-tight text-klein">
                <CountUp to={n.v} decimals={n.d} suffix={n.s} />
              </div>
              <p className="mt-3 max-w-[28ch] text-[15px] text-muted">{n.t}</p>
            </div>
          ))}
        </div>
        <p className="mt-5 text-[14px] text-dim">
          Rules fixed before the first run. Also tested on {controlWeeks} normal weeks across FTX, WazirX and Bitget: {words(falseAlarms, "false alarm")}, {words(falsePayouts, "false payout")}.{" "}
          <Link href="/replay" className="text-blue hover:underline">See every replay</Link>
        </p>
      </section>

      {/* 4. how it works */}
      <section className="border-t border-line bg-surface">
        <div className="mx-auto max-w-[1280px] px-5 py-24 lg:px-8 lg:py-32">
          <h2 className="max-w-[20ch] text-[38px] font-semibold leading-[1.04] tracking-[-0.03em] md:text-[54px]">
            Three parts. <span className="text-dim">One honest picture.</span>
          </h2>

          <div className="mt-16 grid items-center gap-10 border-t border-line pt-14 lg:grid-cols-2 lg:gap-16">
            <div>
              <Fingerprint size={28} className="text-klein" />
              <h3 className="mt-5 text-2xl font-semibold tracking-tight md:text-3xl">Prove what you&apos;re owed</h3>
              <p className="mt-4 max-w-[46ch] text-[17px] leading-relaxed text-muted">
                Log in to your exchange in a secure window. You get a signed proof of the balance it shows you. Every proof adds to a public floor: the least that exchange owes its users.
              </p>
              <Link href="/prove" className="mt-7 inline-flex items-center gap-1.5 font-medium text-blue hover:underline">Prove my balance <ArrowRight size={15} /></Link>
            </div>
            <div className="rounded-2xl border border-line bg-ink p-6 sm:p-8">
              <ol className="space-y-3">
                {[
                  ["Your exchange", "You log in as usual. Your password goes to the exchange, nobody else."],
                  ["Reclaim zkTLS", "A signed fact comes back: the coin, the balance, a hashed account ID."],
                  ["Solana program", "Checks the signature on-chain and adds you to the floor, once per account."],
                ].map(([a, b], i) => (
                  <li key={a} className="flex gap-4 rounded-xl border border-line bg-surface p-4">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-klein/10 font-mono text-[12px] font-semibold text-klein">{i + 1}</span>
                    <div>
                      <div className="font-medium">{a}</div>
                      <div className="mt-0.5 text-[14px] text-muted">{b}</div>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          </div>

          <div className="mt-14 border-t border-line pt-14">
            <div className="grid gap-8 lg:grid-cols-12">
              <div className="lg:col-span-5">
                <WaveSine size={28} className="text-klein" />
                <h3 className="mt-5 text-2xl font-semibold tracking-tight md:text-3xl">See withdrawals every hour</h3>
                <p className="mt-4 max-w-[46ch] text-[17px] leading-relaxed text-muted">
                  Money leaving each exchange&apos;s own wallets is counted hourly on Ethereum, Tron and BSC, and compared with the same hour over the last 28 days.
                </p>
              </div>
              <div className="rounded-2xl border border-line bg-ink p-6 lg:col-span-7">
                <div className="flex items-center justify-between text-[13px]">
                  <span className="font-medium">Bitget, last {pulse.length} hours</span>
                  <span className="inline-flex items-center gap-1.5 text-dim">
                    <span className={`h-1.5 w-1.5 rounded-full ${HB[bitget.heartbeatState].dot}`} /> {HB[bitget.heartbeatState].text}
                  </span>
                </div>
                <div className="mt-5 flex h-36 items-end gap-[2px]" role="img" aria-label={`Bitget withdrawals per hour over the last ${pulse.length} hours observed`}>
                  {pulse.map((p) => (
                    <span key={p.t} className="flex-1 rounded-t-[2px] bg-klein/80" style={{ height: `${Math.max(3, (p.n / pulseMax) * 100)}%` }} />
                  ))}
                </div>
                <div className="mt-2 flex justify-between font-mono text-[11px] text-dim">
                  <span>{pulse[0] ? when(pulse[0].t) : ""}</span>
                  <span>{pulse.at(-1) ? when(pulse.at(-1)!.t) : ""}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-14 grid items-center gap-10 border-t border-line pt-14 lg:grid-cols-2 lg:gap-16">
            {replay && (
              <div className="order-2 rounded-2xl border border-line bg-ink p-6 sm:p-8 lg:order-1">
                <div className="text-sm font-medium">FTX halt, replayed on Solana devnet</div>
                <ol className="mt-5 space-y-2.5 text-[14px]">
                  {[
                    ["Cover bought", `${replay.notional_test_usdc.toLocaleString("en-US")} test-USDC for ${replay.premium_test_usdc} premium`, replay.txs.buy_cover],
                    ["Halt posted", "with the hash of its evidence file", replay.txs.post_halt],
                    ["Window passed", `${replay.challenge_window_secs} s on devnet, 24 h in the rules`, replay.txs.finalize_trigger],
                    ["Paid", `${replay.paid_test_usdc.toLocaleString("en-US")} test-USDC to the buyer`, replay.txs.claim_cover],
                  ].map(([a, b, tx]) => (
                    <li key={a} className="flex items-center justify-between gap-4 rounded-xl border border-line bg-surface px-4 py-3">
                      <span><span className="font-medium">{a}</span> <span className="text-muted">{b}</span></span>
                      <a href={`https://explorer.solana.com/tx/${tx}?cluster=devnet`} target="_blank" rel="noreferrer" aria-label={`${a} transaction`} className="shrink-0 text-dim hover:text-blue"><ArrowUpRight size={14} /></a>
                    </li>
                  ))}
                </ol>
              </div>
            )}
            <div className="order-1 lg:order-2">
              <ShieldCheck size={28} className="text-klein" />
              <h3 className="mt-5 text-2xl font-semibold tracking-tight md:text-3xl">Get paid if they stop</h3>
              <p className="mt-4 max-w-[46ch] text-[17px] leading-relaxed text-muted">
                Cover for the exchange you use, priced from its score. When a halt is confirmed and nobody challenges it, you&apos;re paid automatically. No claim forms, no vote.
              </p>
              <Link href="/cover" className="mt-7 inline-flex items-center gap-1.5 font-medium text-blue hover:underline">See the cover market <ArrowRight size={15} /></Link>
            </div>
          </div>
        </div>
      </section>

      {/* 5. privacy */}
      <section className="border-t border-line">
        <div className="mx-auto grid max-w-[1280px] gap-12 px-5 py-24 lg:grid-cols-12 lg:px-8 lg:py-32">
          <div className="lg:col-span-5">
            <h2 className="text-[38px] font-semibold leading-[1.04] tracking-[-0.03em] md:text-[54px]">Private by design.</h2>
            <p className="mt-6 max-w-[40ch] text-[17px] leading-relaxed text-muted">
              Your login stays between you and your exchange. What reaches the chain is enough to count you once, and nothing more.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:col-span-7">
            <div className="rounded-2xl border border-line bg-surface p-7">
              <div className="flex items-center gap-2 text-sm font-medium"><CheckCircle size={18} className="text-klein" /> Kept on-chain</div>
              <ul className="mt-5 space-y-3 text-[15px]">
                <li className="flex justify-between gap-3"><span className="text-muted">Balance range</span><span className="font-mono">{proof?.bucketLabel ?? "< 1"}</span></li>
                <li className="flex justify-between gap-3"><span className="text-muted">Coin</span><span className="font-mono">{proof?.asset ?? "USDT"}</span></li>
                <li className="flex justify-between gap-3"><span className="text-muted">Period</span><span className="font-mono">30 days</span></li>
                <li className="flex justify-between gap-3"><span className="text-muted">Fingerprint</span><span className="font-mono text-blue">one-way hash</span></li>
              </ul>
            </div>
            <div className="rounded-2xl border border-line bg-surface p-7">
              <div className="flex items-center gap-2 text-sm font-medium"><EyeSlash size={18} className="text-dim" /> Never seen by us</div>
              <ul className="mt-5 space-y-3 text-[15px] text-dim">
                {["Your password", "Your email", "Your account ID", "Your exact balance"].map((t) => (
                  <li key={t} className="line-through decoration-line-strong">{t}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* 6. attacks */}
      <section className="border-t border-line bg-surface">
        <div className="mx-auto grid max-w-[1280px] gap-12 px-5 py-24 lg:grid-cols-12 lg:px-8 lg:py-32">
          <div className="lg:col-span-5">
            <h2 className="text-[38px] font-semibold leading-[1.04] tracking-[-0.03em] md:text-[54px]">
              We tried to cheat it. <span className="text-dim">The program said no.</span>
            </h2>
            <p className="mt-6 max-w-[40ch] text-[17px] leading-relaxed text-muted">
              Each attack is a real transaction against the deployed program, simulated on devnet. You can run them yourself.
            </p>
            <Link href="/break" className="btn btn-ghost mt-8">Try to break it <ArrowRight size={14} /></Link>
          </div>
          <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line lg:col-span-7">
            {ATTACKS.filter((a) => a.id !== "control").map((a) => (
              <li key={a.id} className="flex items-center gap-4 bg-ink px-5 py-4">
                <Prohibit size={18} className="shrink-0 text-dim" />
                <span className="flex-1 text-[15px]">{a.title}</span>
                <span className="hidden shrink-0 rounded-md bg-klein/[0.07] px-2 py-1 font-mono text-[12px] text-klein sm:block">{a.expect.split(" / ")[0]}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* 7. faq + closing */}
      <section className="border-t border-line">
        <div className="mx-auto grid max-w-[1280px] gap-12 px-5 py-24 lg:grid-cols-12 lg:px-8 lg:py-32">
          <div className="lg:col-span-4">
            <h2 className="text-[38px] font-semibold leading-[1.04] tracking-[-0.03em] md:text-[54px]">Questions.</h2>
          </div>
          <div className="divide-y divide-line border-y border-line lg:col-span-8">
            {[
              ["Is this insurance?", "No. Cover runs on Solana devnet with test-USDC. It shows how the protocol works; nothing here touches real money."],
              ["Does a low score mean an exchange is in trouble?", "No. The score is a published formula over facts anyone can check. We show what is proven and what is not proven yet, never a verdict."],
              ["Why is the proven amount called a floor?", "It only counts people who chose to prove. If ten people prove $1,000 each, the exchange owes at least $10,000, and almost certainly more."],
              ["Is logging in safe?", "Your login goes to your exchange, not to us. Reclaim Protocol's zkTLS proof reveals only the fields it was built to read: the coin, the balance and a hashed account ID."],
              ["Who runs the withdrawal watcher?", "One signer today, and we say so. Every report carries the hash of its evidence file, and one command recomputes all of them."],
            ].map(([q, a]) => (
              <details key={q} className="group py-6">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-6 text-lg font-medium">
                  {q}
                  <span className="text-2xl font-light text-dim transition-transform duration-200 group-open:rotate-45">+</span>
                </summary>
                <p className="mt-3 max-w-[62ch] leading-relaxed text-muted">{a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="px-3 pb-3 sm:px-5 sm:pb-5">
        <div className="grain relative mx-auto max-w-[1360px] overflow-hidden rounded-[28px] bg-klein px-6 py-20 text-white sm:px-10 md:px-14 lg:py-28">
          <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(60%_90%_at_100%_0%,#1f56e0_0%,transparent_60%)]" />
          <h2 className="max-w-[16ch] text-[46px] font-semibold leading-[0.98] tracking-[-0.035em] md:text-[80px]">
            Your balance is a fact. <span className="text-ice/55">Prove it.</span>
          </h2>
          <div className="mt-10 flex flex-wrap items-center gap-5">
            <Link href="/prove" className="inline-flex h-12 items-center gap-2 rounded-full bg-white px-6 text-[15px] font-semibold text-klein transition hover:bg-ice active:scale-[0.98]">
              Prove my balance <ArrowRight size={16} weight="bold" />
            </Link>
            <span className="text-[15px] text-ice/75">About a minute. Solana devnet, test-USDC only.</span>
          </div>
        </div>
      </section>
    </div>
  );
}
