import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowSquareOut } from "@phosphor-icons/react/dist/ssr";
import {
  binanceRoots,
  boardRow,
  devnet,
  EXCHANGES,
  EXPLORER,
  heartbeat,
  inclusionVectors,
  onchainReports,
  proofs,
  registry,
  reserves,
  score,
  type ExchangeId,
} from "@/lib/data";
import { amount, FloorCell, HeartbeatBadge, HourlyChart, ScoreBadge, TxLink, usd } from "@/components/ui";

export function generateStaticParams() {
  return EXCHANGES.map((exchange) => ({ exchange }));
}

export default async function ExchangePage({ params }: { params: Promise<{ exchange: string }> }) {
  const { exchange } = await params;
  if (!EXCHANGES.includes(exchange as ExchangeId)) notFound();
  const id = exchange as ExchangeId;
  const row = boardRow(id);
  const res = reserves(id);
  const sc = score(id);
  const hb = heartbeat(id);
  const reg = registry(id);
  const st = devnet();
  const ex = st.exchanges?.[id];
  const pool = st.pools?.[id];
  const posted = onchainReports()[id] ?? {};
  const prf = proofs(id);

  return (
    <div className="mx-auto max-w-[1280px] px-5 py-14 lg:px-8 lg:py-20">
      <Link href="/board" className="inline-flex items-center gap-1 text-sm text-dim hover:text-text">← All exchanges</Link>
      <div className="mt-6 flex flex-wrap items-center gap-4">
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-klein text-2xl font-semibold text-white">{row.name[0]}</span>
        <div>
          <h1 className="text-[40px] font-semibold leading-none tracking-[-0.03em] md:text-[52px]">{row.name}</h1>
          <p className="mt-2 text-[15px] text-dim">
            {row.indian ? "Indian exchange" : "Global exchange"}. Account on devnet{" "}
            {ex?.address ? <a className="link font-mono text-[13px]" href={EXPLORER("address", ex.address)}>{ex.address.slice(0, 8)}…</a> : "-"}
          </p>
        </div>
      </div>
      <div className="mt-10 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-line bg-line md:grid-cols-4">
        <div className="bg-surface px-6 py-5">
          <div className="font-mono text-3xl font-medium text-klein">{row.score ?? "-"}<span className="text-base text-dim">/100</span></div>
          <div className="mt-1 text-[13px] text-dim">score</div>
        </div>
        <div className="bg-surface px-6 py-5">
          <div className="font-mono text-2xl font-medium">{row.reservesUsd == null ? "-" : usd(row.reservesUsd)}</div>
          <div className="mt-1 text-[13px] text-dim">held in listed wallets</div>
        </div>
        <div className="bg-surface px-6 py-5">
          <div className="font-mono text-2xl font-medium">{row.floors[0] ? `${amount(row.floors[0].floor)} ${row.floors[0].asset}` : "-"}</div>
          <div className="mt-1 text-[13px] text-dim">{row.provers ? `proven by ${row.provers} account${row.provers === 1 ? "" : "s"}, a minimum` : "not yet proven"}</div>
        </div>
        <div className="bg-surface px-6 py-5">
          <div className="pt-1"><HeartbeatBadge state={row.heartbeatState} reason={row.heartbeatReason} /></div>
          <div className="mt-2 text-[13px] text-dim">withdrawals</div>
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        {/* reserves */}
        <section className="rounded-2xl border border-line bg-surface p-6 lg:col-span-2">
          <h2 className="mb-4 text-lg font-semibold tracking-tight">Reserves in listed wallets</h2>
          {res ? (
            <>
              <div className="font-mono text-3xl font-medium">{usd(res.total_usd)}</div>
              <div className="mt-1 text-xs text-dim">as of {res.as_of} · {res.note}</div>
              <table className="mt-4 w-full text-sm">
                <thead>
                  <tr className="border-b border-line text-left">
                    <th className="label py-2 font-normal">Asset</th>
                    <th className="label py-2 font-normal text-right">Amount</th>
                    <th className="label py-2 font-normal text-right">USD</th>
                  </tr>
                </thead>
                <tbody>
                  {res.assets.slice(0, 10).map((a: any) => (
                    <tr key={a.asset} className="border-b border-line/50 last:border-0">
                      <td className="py-1.5 num">{a.asset}</td>
                      <td className="py-1.5 num text-right text-muted">{a.amount == null ? "—" : amount(a.amount, 2)}</td>
                      <td className="py-1.5 num text-right">{usd(a.usd)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="mt-4 space-y-1 text-xs text-dim">
                <div>Balances: <a className="link" href={res.source.balances}>{res.source.balances}</a></div>
                <div>Addresses: <a className="link" href={res.source.addresses}>{res.source.addresses.replace("https://github.com/", "")}</a></div>
                {res.source.upstream && <div>Upstream: {res.source.upstream}</div>}
                {reg && (
                  <div className="num">
                    Wallets we watch: Ethereum {reg.chains.ethereum.length} · BSC {reg.chains.bsc.length} · Tron {reg.chains.tron.length}
                  </div>
                )}
              </div>
            </>
          ) : (
            <div>
              <div className="num text-2xl text-dim">—</div>
              <p className="mt-2 text-sm text-muted">{row.reservesReason}</p>
            </div>
          )}
        </section>

        {/* floor */}
        <section className="rounded-2xl border border-line bg-surface p-6">
          <h2 className="mb-4 text-lg font-semibold tracking-tight">Proven by users</h2>
          <FloorCell floors={row.floors} provers={row.provers} />
          {row.floors.map((f) => (
            <div key={f.asset} className="mt-3 well p-3 text-xs text-muted">
              <div className="flex justify-between"><span>{f.asset} proven</span><span className="num">{amount(f.floor)}</span></div>
              <div className="flex justify-between"><span>{f.asset} on-chain reserve</span><span className="num">{f.reserve == null ? "—" : amount(f.reserve, 2)}</span></div>
            </div>
          ))}
          <div className="mt-4 space-y-2">
            {prf.map((p) => (
              <div key={p.proofRecord} className="text-xs text-dim">
                <div className="text-muted">{p.bucketLabel} · epoch {p.epoch}</div>
                <TxLink sig={p.txs.recordProof} label="record_proof ↗" /> · nullifier <span className="num">{p.nullifier.slice(0, 10)}…</span>
              </div>
            ))}
          </div>
          <Link href="/prove" className="btn btn-primary mt-6 w-full justify-center py-3">Prove my {row.name} balance</Link>
        </section>

        {/* heartbeat */}
        <section className="rounded-2xl border border-line bg-surface p-6 lg:col-span-2">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold tracking-tight">Withdrawals, last 72 hours</h2>
            <HeartbeatBadge state={row.heartbeatState} reason={row.heartbeatReason} />
          </div>
          {hb ? (
            <>
              <div className="mt-4">
                <HourlyChart points={hb.series_72h.map((s: any) => ({ t: s.t, count: s.count, median: s.median }))} />
              </div>
              <div className="mt-2 flex flex-wrap gap-4 text-xs text-dim">
                <span>bars: outflows per hour (all chains)</span>
                <span>dashed: median of the same hour over 28 days</span>
                <span className="num">as of {hb.as_of}</span>
              </div>
              <div className="num mt-2 text-xs text-muted">
                Last 24h — {Object.entries(hb.last_24h_by_chain).map(([c, n]) => `${c}: ${Number(n).toLocaleString()}`).join(" · ")}
              </div>
            </>
          ) : (
            <p className="mt-4 text-sm text-muted">{row.heartbeatReason ?? "No live heartbeat for this exchange."}</p>
          )}
          {posted.heartbeat && (
            <div className="mt-3 text-xs text-dim">
              Posted on devnet with evidence hash <span className="num">{posted.heartbeat.evidence_sha256.slice(0, 12)}…</span> ·{" "}
              <TxLink sig={posted.heartbeat.tx} />
            </div>
          )}
        </section>

        {/* score */}
        <section className="rounded-2xl border border-line bg-surface p-6">
          <h2 className="mb-4 text-lg font-semibold tracking-tight">How the score adds up</h2>
          <div className="num text-sm">start 100</div>
          {sc?.deductions.map((d: any) => (
            <div key={d.rule} className="num mt-1 flex justify-between text-sm text-muted">
              <span>{d.rule.replace("heartbeat:", "heartbeat ").replaceAll("_", " ")}</span>
              <span className="text-amber">−{d.points}</span>
            </div>
          ))}
          <div className="num mt-2 flex justify-between border-t border-line pt-2 text-sm">
            <span>score</span><ScoreBadge value={sc?.score ?? null} />
          </div>
          {posted.score && (
            <div className="mt-3 text-xs text-dim">
              Evidence hash <span className="num">{posted.score.evidence_sha256.slice(0, 12)}…</span> posted · <TxLink sig={posted.score.tx} />
            </div>
          )}
          {pool && (
            <div className="mt-5 well p-3 text-xs text-muted">
              <div className="mb-1 font-medium text-text">Cover pool</div>
              <div>Cap {pool.capBps / 100}% of assets · base rate {pool.baseRateBps / 100}%/yr</div>
              <Link href="/cover" className="link mt-1 inline-flex items-center gap-1">Open the pool <ArrowSquareOut size={12} /></Link>
            </div>
          )}
        </section>

        {id === "binance" && <Inclusion />}
      </div>
    </div>
  );
}

function Inclusion() {
  const roots = binanceRoots();
  const tv = inclusionVectors();
  return (
    <section className="rounded-2xl border border-line bg-surface p-6 lg:col-span-3">
      <h2 className="mb-3 text-lg font-semibold tracking-tight">Check you are in Binance&apos;s liability tree</h2>
      <p className="max-w-3xl text-sm text-muted">
        A Binance user can download their record (account hash, balances, Merkle path). Our checker runs Binance&apos;s own
        open-source code (Poseidon over BN254, depth-28 tree) and also requires the record&apos;s root to be one Binance published.
      </p>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        {roots.map((r) => (
          <div key={r.root} className="well p-3">
            <div className="label">Published root · audit {r.auditDate}</div>
            <div className="num mt-1 break-all text-xs text-muted">{r.root}</div>
          </div>
        ))}
      </div>
      {tv && (
        <div className="mt-4 text-xs text-dim">
          Test vectors (built with Binance&apos;s tree code):{" "}
          {tv.vectors.map((v: any) => `${v.record.split("/").pop()} → ${v.included ? "included" : "rejected"}`).join(" · ")}.{" "}
          {tv.limit}
        </div>
      )}
    </section>
  );
}
