"use client";

import { useCallback, useEffect, useState } from "react";
import { useAnchorWallet, useConnection } from "@solana/wallet-adapter-react";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { PublicKey } from "@solana/web3.js";
import { ArrowUpRight, CheckCircle, CircleNotch, Drop, ShieldCheck, WarningDiamond } from "@phosphor-icons/react";
import { WalletButton } from "@/components/wallet";
import { BN, exchangePda, pda, poolPda, program, seed, signAndSend, vaultPda } from "@/lib/chain";

type PoolView = {
  id: string;
  name: string;
  assets: number;
  exposure: number;
  capBps: number;
  baseRateBps: number;
  coversSold: number;
  score: number | null;
  heartbeat: number;
  triggered: boolean;
  pending: boolean;
};

const USDC = 1_000_000;
const HB = [
  { t: "No heartbeat", c: "bg-line-strong" },
  { t: "Usual pattern", c: "bg-ok" },
  { t: "Below usual", c: "bg-amber" },
  { t: "Too quiet", c: "bg-line-strong" },
  { t: "Halt confirmed", c: "bg-amber" },
];
const DAYS = [7, 30, 90];

/** Same formula as program/…/cover.rs `quote`: annual bps = base + (100 − score)·30 + utilisation_bps / 5. */
function quote(p: PoolView, notional: number, days: number) {
  const n = notional * USDC;
  const newExp = p.exposure * USDC + n;
  const assets = p.assets * USDC;
  if (!assets || newExp * 10_000 > assets * p.capBps) return { ok: false as const, reason: "More than this pool can cover right now (50% cap)." };
  const util = Math.floor((newExp * 10_000) / assets);
  const rate = p.baseRateBps + (100 - Math.min(p.score ?? 100, 100)) * 30 + Math.floor(util / 5);
  const premium = Math.max(1, Math.ceil((n * rate * days) / (365 * 10_000)));
  return { ok: true as const, premium: premium / USDC, rate };
}

export function CoverMarket({ pools, mint }: { pools: { id: string; name: string }[]; mint: string }) {
  const { connection } = useConnection();
  const wallet = useAnchorWallet();
  const [views, setViews] = useState<PoolView[] | null>(null);
  const [sel, setSel] = useState("coindcx");
  const [tab, setTab] = useState<"buy" | "lp">("buy");
  const [notional, setNotional] = useState(50);
  const [days, setDays] = useState(30);
  const [deposit, setDeposit] = useState(25);
  const [status, setStatus] = useState<{ kind: "busy" | "ok" | "err"; text: string; sig?: string } | null>(null);
  const [balance, setBalance] = useState<number | null>(null);

  const load = useCallback(async () => {
    const reader = program(connection, (wallet ?? { publicKey: PublicKey.default, signTransaction: async (t: any) => t, signAllTransactions: async (t: any) => t }) as any);
    const exKeys = pools.map((p) => exchangePda(p.id));
    const [exs, pls]: any[][] = await Promise.all([
      reader.account.exchange.fetchMultiple(exKeys),
      reader.account.pool.fetchMultiple(exKeys.map((k) => poolPda(k))),
    ]).catch(() => [[], []]);
    const out: PoolView[] = [];
    pools.forEach((p, i) => {
      const ex = exs[i];
      const pool = pls[i];
      if (!ex || !pool) return;
      out.push({
        id: p.id,
        name: p.name,
        assets: pool.assets.toNumber() / USDC,
        exposure: pool.exposure.toNumber() / USDC,
        capBps: pool.capBps,
        baseRateBps: pool.baseRateBps,
        coversSold: pool.coversSold.toNumber(),
        score: ex.score.asOf.toNumber() > 0 ? ex.score.value : null,
        heartbeat: ex.heartbeat.value,
        triggered: pool.triggeredAt.toNumber() > 0,
        pending: pool.triggerOpenedAt.toNumber() > 0,
      });
    });
    setViews(out);
    if (wallet) {
      try {
        const ata = getAssociatedTokenAddressSync(new PublicKey(mint), wallet.publicKey);
        setBalance(Number((await connection.getTokenAccountBalance(ata)).value.uiAmount ?? 0));
      } catch {
        setBalance(0);
      }
    } else setBalance(null);
  }, [connection, wallet, pools, mint]);

  useEffect(() => {
    load();
  }, [load]);

  const p = views?.find((v) => v.id === sel);
  const q = p ? quote(p, notional, days) : null;
  const blocked = p && (p.heartbeat === 2 || p.heartbeat === 4 || p.pending || p.triggered);

  async function run(label: string, fn: () => Promise<string[]>) {
    try {
      setStatus({ kind: "busy", text: `${label}…` });
      const sigs = await fn();
      setStatus({ kind: "ok", text: `${label}: confirmed on devnet.`, sig: sigs[sigs.length - 1] });
      await load();
    } catch (e: any) {
      const t = String(e?.message ?? e);
      setStatus({ kind: "err", text: /insufficient|custom program error: 0x1\b/.test(t) ? "Not enough test-USDC or SOL. Use the faucet first." : t.slice(0, 220) });
    }
  }

  async function buy() {
    if (!wallet || !p) return;
    await run("Buying cover", async () => {
      const prog = program(connection, wallet);
      const exchange = exchangePda(p.id);
      const pool = poolPda(exchange);
      const poolAcc: any = await prog.account.pool.fetch(pool);
      const index = poolAcc.coversSold as BN;
      const cover = pda([seed("cover"), pool.toBuffer(), index.toArrayLike(Buffer, "le", 8)]);
      const ownerToken = getAssociatedTokenAddressSync(new PublicKey(mint), wallet.publicKey);
      const ix = await prog.methods
        .buyCover(new BN(notional * USDC), days, index)
        .accounts({ owner: wallet.publicKey, exchange, pool, vault: vaultPda(pool), ownerToken, cover })
        .instruction();
      return signAndSend(connection, wallet, [[ix]]);
    });
  }

  async function lp() {
    if (!wallet || !p) return;
    await run("Depositing", async () => {
      const prog = program(connection, wallet);
      const pool = poolPda(exchangePda(p.id));
      const ownerToken = getAssociatedTokenAddressSync(new PublicKey(mint), wallet.publicKey);
      const ix = await prog.methods.lpDeposit(new BN(deposit * USDC)).accounts({ owner: wallet.publicKey, pool, vault: vaultPda(pool), ownerToken }).instruction();
      return signAndSend(connection, wallet, [[ix]]);
    });
  }

  async function faucet() {
    if (!wallet) return;
    setStatus({ kind: "busy", text: "Sending 100 test-USDC and a little devnet SOL…" });
    const r = await fetch("/api/faucet", { method: "POST", body: JSON.stringify({ wallet: wallet.publicKey.toBase58() }) });
    const j = await r.json().catch(() => ({}));
    setStatus(r.ok ? { kind: "ok", text: "100 test-USDC sent.", sig: j.txs?.usdc } : { kind: "err", text: j.error ?? "Faucet failed." });
    await load();
  }

  return (
    <div className="grid gap-6 lg:grid-cols-12">
      <div className="lg:col-span-7">
        <div className="overflow-hidden rounded-2xl border border-line bg-surface">
          <div className="grid grid-cols-[1.4fr_1fr_1fr_0.8fr] gap-3 border-b border-line bg-panel px-5 py-3 text-[13px] font-medium text-dim">
            <span>Exchange</span>
            <span>Pool</span>
            <span>Withdrawals</span>
            <span className="text-right">Rate / yr</span>
          </div>
          {views == null &&
            Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="grid grid-cols-[1.4fr_1fr_1fr_0.8fr] gap-3 border-b border-line px-5 py-5 last:border-0">
                {[60, 50, 45, 30].map((w, j) => <span key={j} className="h-4 animate-pulse rounded bg-panel" style={{ width: `${w}%` }} />)}
              </div>
            ))}
          {views?.length === 0 && <div className="px-5 py-6 text-sm text-dim">Could not read the pools from devnet. Refresh to try again.</div>}
          {views?.map((v) => {
            const qq = quote(v, 50, 30);
            const used = v.assets ? (v.exposure / v.assets) * 100 : 0;
            return (
              <button
                key={v.id}
                onClick={() => setSel(v.id)}
                className={`relative grid w-full grid-cols-[1.4fr_1fr_1fr_0.8fr] items-center gap-3 border-b border-line px-5 py-4 text-left transition-colors last:border-0 ${sel === v.id ? "bg-klein/[0.05]" : "hover:bg-panel/60"}`}
              >
                {sel === v.id && <span className="absolute inset-y-0 left-0 w-[3px] bg-klein" />}
                <span>
                  <span className="block font-semibold">{v.name}</span>
                  <span className="mt-0.5 block text-[12px] text-dim">Score {v.score ?? "-"}</span>
                </span>
                <span>
                  <span className="block font-mono text-[14px]">{v.assets.toLocaleString("en-US")}</span>
                  <span className="mt-0.5 block text-[12px] text-dim">{used.toFixed(1)}% used of {v.capBps / 100}%</span>
                </span>
                <span className="flex items-center gap-1.5 text-[13px] text-muted">
                  <span className={`h-1.5 w-1.5 rounded-full ${HB[v.heartbeat]?.c ?? "bg-line-strong"}`} /> {HB[v.heartbeat]?.t ?? "-"}
                </span>
                <span className="text-right font-mono text-[14px]">{qq.ok ? `${(qq.rate / 100).toFixed(1)}%` : "-"}</span>
              </button>
            );
          })}
        </div>
        <p className="mt-3 text-[13px] text-dim">Pools hold test-USDC on Solana devnet. Rate = pool base + (100 minus score) × 0.30% + usage ÷ 5, the same formula the program uses.</p>
      </div>

      <div className="lg:col-span-5">
        <div className="sticky top-24 rounded-2xl border border-line bg-surface p-6 shadow-[0_20px_60px_-30px_rgb(11_13_18/0.25)]">
          <div className="flex rounded-full bg-panel p-1 text-sm font-medium">
            {(["buy", "lp"] as const).map((t) => (
              <button key={t} onClick={() => setTab(t)} className={`flex-1 rounded-full py-2 transition ${tab === t ? "bg-surface shadow-sm" : "text-dim hover:text-text"}`}>
                {t === "buy" ? "Buy cover" : "Provide cover"}
              </button>
            ))}
          </div>

          <div className="mt-6 flex items-baseline justify-between">
            <h2 className="text-xl font-semibold tracking-tight">{p?.name ?? "Pick a pool"}</h2>
            {balance != null && <span className="font-mono text-[12px] text-dim">{balance.toLocaleString("en-US")} test-USDC</span>}
          </div>

          {tab === "buy" ? (
            <>
              <label className="mt-5 block text-[13px] font-medium text-dim" htmlFor="notional">Cover amount</label>
              <div className="mt-1.5 flex items-center rounded-xl border border-line bg-ink px-4 focus-within:border-blue-2">
                <input id="notional" type="number" min={1} value={notional} onChange={(e) => setNotional(Math.max(1, Number(e.target.value) || 1))} className="w-full bg-transparent py-3 font-mono text-lg outline-none" />
                <span className="whitespace-nowrap text-sm text-dim">test-USDC</span>
              </div>
              <div className="mt-4 text-[13px] font-medium text-dim">Length</div>
              <div className="mt-1.5 grid grid-cols-3 gap-2">
                {DAYS.map((d) => (
                  <button key={d} onClick={() => setDays(d)} className={`rounded-xl border py-2.5 text-sm font-medium transition ${days === d ? "border-blue-2 bg-klein/[0.05] text-blue" : "border-line hover:border-line-strong"}`}>
                    {d} days
                  </button>
                ))}
              </div>
              <div className="mt-5 rounded-xl bg-panel p-4 text-[14px]">
                {blocked ? (
                  <p className="flex items-start gap-2 text-amber"><WarningDiamond size={17} weight="bold" className="mt-0.5 shrink-0" /> Cover is paused for this exchange while its withdrawals are below their usual pattern.</p>
                ) : q?.ok ? (
                  <>
                    <div className="flex justify-between"><span className="text-muted">You pay</span><span className="font-mono font-medium">{q.premium.toFixed(4)} test-USDC</span></div>
                    <div className="mt-2 flex justify-between"><span className="text-muted">Pays out</span><span className="font-mono">{notional.toLocaleString("en-US")} test-USDC</span></div>
                    <div className="mt-2 flex justify-between"><span className="text-muted">Annual rate</span><span className="font-mono">{(q.rate / 100).toFixed(2)}%</span></div>
                    <p className="mt-3 border-t border-line pt-3 text-[13px] text-dim">Paid in full if a halt is confirmed while your cover is live and nobody challenges it in time.</p>
                  </>
                ) : (
                  <p className="text-amber">{q?.reason ?? "Loading the pool…"}</p>
                )}
              </div>
            </>
          ) : (
            <>
              <p className="mt-4 text-[14px] text-muted">Deposit test-USDC into the {p?.name ?? ""} pool. You earn the premiums and pay out if a halt is confirmed. Withdrawals pause while a trigger is pending.</p>
              <label className="mt-5 block text-[13px] font-medium text-dim" htmlFor="deposit">Deposit</label>
              <div className="mt-1.5 flex items-center rounded-xl border border-line bg-ink px-4 focus-within:border-blue-2">
                <input id="deposit" type="number" min={1} value={deposit} onChange={(e) => setDeposit(Math.max(1, Number(e.target.value) || 1))} className="w-full bg-transparent py-3 font-mono text-lg outline-none" />
                <span className="whitespace-nowrap text-sm text-dim">test-USDC</span>
              </div>
            </>
          )}

          <div className="mt-6 space-y-2.5">
            {!wallet ? (
              <WalletButton className="w-full justify-center py-3" />
            ) : (
              <>
                {tab === "buy" ? (
                  <button onClick={buy} disabled={!q?.ok || !!blocked || status?.kind === "busy"} className="btn btn-primary w-full justify-center py-3 text-[15px] disabled:opacity-50">
                    <ShieldCheck size={17} /> Buy cover
                  </button>
                ) : (
                  <button onClick={lp} disabled={status?.kind === "busy"} className="btn btn-primary w-full justify-center py-3 text-[15px] disabled:opacity-50">
                    Deposit
                  </button>
                )}
                {(balance ?? 0) < (tab === "buy" ? (q?.ok ? q.premium : 1) : deposit) && (
                  <button onClick={faucet} disabled={status?.kind === "busy"} className="btn btn-ghost w-full justify-center disabled:opacity-50">
                    <Drop size={16} /> Get 100 free test-USDC
                  </button>
                )}
                <div className="flex justify-center pt-1"><WalletButton /></div>
              </>
            )}
          </div>

          {status && (
            <div className={`mt-4 flex items-start gap-2 rounded-xl p-3 text-[13px] ${status.kind === "err" ? "bg-amber/10 text-amber" : status.kind === "ok" ? "bg-ok/10 text-ok" : "bg-panel text-muted"}`}>
              {status.kind === "busy" ? <CircleNotch size={16} className="mt-0.5 shrink-0 animate-spin" /> : status.kind === "ok" ? <CheckCircle size={16} weight="fill" className="mt-0.5 shrink-0" /> : <WarningDiamond size={16} weight="bold" className="mt-0.5 shrink-0" />}
              <span className="min-w-0 break-words">
                {status.text}
                {status.sig && (
                  <a className="ml-1.5 inline-flex items-center underline" href={`https://explorer.solana.com/tx/${status.sig}?cluster=devnet`} target="_blank" rel="noreferrer">
                    View tx <ArrowUpRight size={12} />
                  </a>
                )}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
