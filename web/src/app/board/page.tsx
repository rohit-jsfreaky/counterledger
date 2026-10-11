import Link from "next/link";
import { ArrowRight, CheckCircle, Question, WarningDiamond } from "@phosphor-icons/react/dist/ssr";
import { boardRow, EXCHANGES, liveHourly, proofs, reservesSummary, scoreParams, type HeartbeatState } from "@/lib/data";
import { SectionTitle, Sparkline, amount, usd } from "@/components/ui";

export const metadata = { title: "Board — Counterledger" };

const HB: Record<HeartbeatState, { text: string; tone: string; Icon: typeof CheckCircle }> = {
  normal: { text: "Usual pattern", tone: "text-ok", Icon: CheckCircle },
  below_usual_pattern: { text: "Below its usual pattern", tone: "text-amber", Icon: WarningDiamond },
  halt_confirmed: { text: "Halt confirmed", tone: "text-amber", Icon: WarningDiamond },
  not_enough_data: { text: "Too quiet to compare", tone: "text-dim", Icon: Question },
  unknown: { text: "Building 29-day history", tone: "text-dim", Icon: Question },
};

export default function Board() {
  const rows = EXCHANGES.map(boardRow);
  const p = scoreParams();
  const reserves = Object.values(reservesSummary()).reduce((a: number, s: any) => a + (s.total_usd ?? 0), 0);
  const proofCount = proofs().length;
  const latest = rows.map((r) => r.heartbeatAsOf).filter(Boolean).sort().at(-1);

  return (
    <div className="mx-auto max-w-[1280px] px-5 py-14 lg:px-8 lg:py-20">
      <SectionTitle kicker="Board" title="What we can see, and what users have proven">
        Reserves come from each exchange&apos;s own published or labelled wallets. Proven floors come only from proofs our Solana program verified. Withdrawals are compared every hour with the exchange&apos;s own last 28 days.
      </SectionTitle>

      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-line bg-line md:grid-cols-4">
        {[
          [usd(reserves, 1), "held in listed wallets"],
          [String(rows.length), "exchanges watched"],
          [String(proofCount), `balance proof${proofCount === 1 ? "" : "s"} recorded`],
          [latest ? latest.slice(0, 16).replace("T", " ") : "-", "last heartbeat (UTC)"],
        ].map(([v, l]) => (
          <div key={l} className="bg-surface px-6 py-5">
            <div className="font-mono text-2xl font-medium tracking-tight">{v}</div>
            <div className="mt-1 text-[13px] text-dim">{l}</div>
          </div>
        ))}
      </div>

      <div className="mt-8 overflow-hidden rounded-2xl border border-line bg-surface">
        <div className="hidden grid-cols-12 gap-4 border-b border-line bg-panel px-6 py-3 text-[13px] font-medium text-dim lg:grid">
          <span className="col-span-3">Exchange</span>
          <span className="col-span-2">Held in listed wallets</span>
          <span className="col-span-3">Proven by users</span>
          <span className="col-span-3">Withdrawals, last 72 h</span>
          <span className="col-span-1 text-right">Score</span>
        </div>
        {rows.map((r) => {
          const pulse = liveHourly(r.id, 72).map((x) => x.n);
          const hb = HB[r.heartbeatState] ?? HB.unknown;
          const f = r.floors[0];
          return (
            <Link key={r.id} href={`/x/${r.id}`} className="group grid grid-cols-2 gap-4 border-b border-line px-6 py-5 transition-colors last:border-0 hover:bg-panel/50 lg:grid-cols-12">
              <div className="col-span-2 flex items-center gap-3 lg:col-span-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-panel font-semibold text-muted">{r.name[0]}</span>
                <div>
                  <div className="font-semibold group-hover:text-klein">{r.name}</div>
                  <div className="text-[12px] text-dim">{r.indian ? "India" : "Global"}{r.topAssets.length ? `, ${r.topAssets.slice(0, 3).join(", ")}` : ""}</div>
                </div>
              </div>
              <div className="lg:col-span-2">
                <div className="text-[12px] text-dim lg:hidden">Held</div>
                {r.reservesUsd == null ? <span className="text-[14px] text-dim">No current list</span> : <span className="font-mono text-[15px]">{usd(r.reservesUsd)}</span>}
              </div>
              <div className="lg:col-span-3">
                <div className="text-[12px] text-dim lg:hidden">Proven by users</div>
                {f ? (
                  <>
                    <span className="font-mono text-[15px]">{amount(f.floor)} {f.asset}</span>
                    <div className="text-[12px] text-dim">{r.provers} account{r.provers === 1 ? "" : "s"}, a minimum</div>
                  </>
                ) : (
                  <span className="text-[14px] text-dim">Not yet proven</span>
                )}
              </div>
              <div className="col-span-2 flex items-center gap-4 lg:col-span-3">
                <Sparkline values={pulse} className="h-8 w-28 shrink-0" tone={r.heartbeatState === "below_usual_pattern" || r.heartbeatState === "halt_confirmed" ? "amber" : "klein"} />
                <span className={`inline-flex items-center gap-1.5 text-[13px] ${hb.tone}`}>
                  <hb.Icon size={15} weight="bold" /> {hb.text}
                </span>
              </div>
              <div className="flex items-center justify-end gap-2 lg:col-span-1">
                <span className="font-mono text-xl font-medium">{r.score ?? "-"}</span>
                <ArrowRight size={14} className="text-dim transition-transform group-hover:translate-x-0.5" />
              </div>
            </Link>
          );
        })}
      </div>

      <div className="mt-16 grid gap-10 border-t border-line pt-10 md:grid-cols-2">
        <div>
          <h3 className="font-semibold">How the score works</h3>
          <p className="mt-2 text-[15px] leading-relaxed text-muted">
            It starts at {p?.start ?? 100} and loses points for what can&apos;t be seen or proven from outside: no sourced reserves (−{p?.deductions?.no_sourced_reserves?.points}), withdrawals too quiet to compare (−{p?.deductions?.heartbeat?.not_enough_data}) or below their usual pattern (−{p?.deductions?.heartbeat?.below_usual_pattern}), a proven shortfall in any coin (−{p?.deductions?.proven_shortfall?.points}), and no proofs yet (−{p?.deductions?.not_yet_proven?.points}). It is not a solvency rating. The formula was fixed before any score was computed, and each score&apos;s inputs are hashed on devnet.
          </p>
        </div>
        <div>
          <h3 className="font-semibold">What a floor means</h3>
          <p className="mt-2 text-[15px] leading-relaxed text-muted">
            Each verified proof adds one account&apos;s balance to that exchange&apos;s floor for that coin. A floor is a minimum, never the total: at least this much is owed to these accounts. If a floor ever passed the on-chain reserve of the same coin, that would be a proven gap, and the score would show it.
          </p>
        </div>
      </div>
    </div>
  );
}
