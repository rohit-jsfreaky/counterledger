"use client";

import { useEffect, useState } from "react";
import { useAnchorWallet, useConnection } from "@solana/wallet-adapter-react";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import { ReclaimProofRequest } from "@reclaimprotocol/js-sdk";
import { ArrowUpRight, Check, CheckCircle, CircleNotch, Drop, Fingerprint, WarningDiamond } from "@phosphor-icons/react";
import { WalletButton } from "@/components/wallet";
import { exchangePda, program, recordProofIxs, signAndSend } from "@/lib/chain";

type Provider = { exchange: string; name: string; providerId: string; recordable: boolean; note: string };
type Step = "idle" | "session" | "proving" | "recording" | "done" | "error";
const BUCKETS = ["< 1", "1 to 10", "10 to 100", "100 to 1k", "1k to 10k", "10k or more"];
const NEED_SOL = 0.03;

export function ProveFlow({ providers }: { providers: readonly Provider[] }) {
  const { connection } = useConnection();
  const wallet = useAnchorWallet();
  const [exchange, setExchange] = useState(providers.find((p) => p.recordable)?.exchange ?? "coindcx");
  const [step, setStep] = useState<Step>("idle");
  const [msg, setMsg] = useState("");
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [result, setResult] = useState<any>(null);
  const [sol, setSol] = useState<number | null>(null);
  const [faucet, setFaucet] = useState<{ busy: boolean; text: string; ok?: boolean }>({ busy: false, text: "" });
  const chosen = providers.find((p) => p.exchange === exchange)!;

  useEffect(() => {
    if (!wallet) return setSol(null);
    let live = true;
    const load = () => connection.getBalance(wallet.publicKey).then((l) => live && setSol(l / LAMPORTS_PER_SOL)).catch(() => {});
    load();
    const id = setInterval(load, 10_000);
    return () => {
      live = false;
      clearInterval(id);
    };
  }, [wallet, connection]);

  async function getFunds() {
    if (!wallet) return;
    setFaucet({ busy: true, text: "Sending devnet SOL and test-USDC…" });
    const r = await fetch("/api/faucet", { method: "POST", body: JSON.stringify({ wallet: wallet.publicKey.toBase58() }) });
    const j = await r.json().catch(() => ({}));
    setFaucet(r.ok ? { busy: false, ok: true, text: "Sent. Your balance updates in a few seconds." } : { busy: false, text: j.error ?? "Faucet failed." });
    connection.getBalance(wallet.publicKey).then((l) => setSol(l / LAMPORTS_PER_SOL)).catch(() => {});
  }

  async function start() {
    if (!wallet) return;
    try {
      setResult(null);
      setStep("session");
      setMsg("Preparing a Reclaim session bound to your wallet…");
      const r = await fetch("/api/reclaim/session", { method: "POST", body: JSON.stringify({ wallet: wallet.publicKey.toBase58(), exchange }) });
      const s = await r.json();
      if (!r.ok) throw new Error(s.error);
      const req = await ReclaimProofRequest.fromJsonString(s.config);
      setStep("proving");
      setMsg(`A Reclaim window opens. Log in to ${chosen.name} there; it reads your balance and comes back here.`);
      const proofs: any[] = await new Promise((resolve, reject) => {
        req.startSession({ onSuccess: (p: any) => resolve(Array.isArray(p) ? p : [p]), onError: (e: any) => reject(e) });
        req.triggerReclaimFlow().catch(reject);
      });
      if (!proofs.length) throw new Error("No proof came back.");
      setStep("recording");
      setMsg("Checking the proof on Solana. Your wallet signs the upload and one record_proof transaction.");
      const prog = program(connection, wallet);
      const built = await recordProofIxs(prog, wallet.publicKey, exchange, proofs);
      setProgress({ done: 0, total: built.groups.length });
      const sigs = await signAndSend(connection, wallet, built.groups, (done, total) => setProgress({ done, total }));
      const rec: any = await prog.account.proofRecord.fetch(built.proofRecord);
      const ex: any = await prog.account.exchange.fetch(exchangePda(exchange));
      const floor = ex.floors.find((f: any) => Buffer.from(f.asset).toString("utf8").replace(/\0+$/, "") === built.asset);
      setResult({ sig: sigs[sigs.length - 1], bucket: rec.bucket, asset: built.asset, provers: floor?.provers, nullifier: built.nullifier });
      setStep("done");
    } catch (e: any) {
      const text = String(e?.message ?? e);
      setMsg(text.includes("already in use") ? "This account already has a proof recorded this month: one account counts once." : text);
      setStep("error");
    }
  }

  const busy = step === "session" || step === "proving" || step === "recording";
  const funded = sol != null && sol >= NEED_SOL;
  const s1 = wallet && funded ? "done" : "active";
  const s2 = wallet && funded ? "done" : "todo";
  const s3 = step === "done" ? "done" : wallet && funded ? "active" : "todo";

  return (
    <div className="grid gap-8 lg:grid-cols-12 lg:gap-12">
      <ol className="lg:col-span-7">
        <StepRow n={1} state={s1} title="Connect a devnet wallet" last={false}>
          <p className="text-muted">Phantom, Solflare or Backpack set to devnet, or a demo wallet that lives in this browser.</p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <WalletButton />
            {wallet && !funded && (
              <button onClick={getFunds} disabled={faucet.busy} className="btn btn-ghost disabled:opacity-60">
                {faucet.busy ? <CircleNotch size={16} className="animate-spin" /> : <Drop size={16} />} Get free devnet SOL
              </button>
            )}
          </div>
          {wallet && (
            <p className="mt-3 text-[13px] text-dim">
              Balance <span className="font-mono text-text">{sol == null ? "…" : sol.toFixed(3)} SOL</span>
              {!funded && `. About ${NEED_SOL} SOL covers the rent for one proof.`}
            </p>
          )}
          {faucet.text && <p className={`mt-2 text-[13px] ${faucet.ok ? "text-ok" : "text-amber"}`}>{faucet.text}</p>}
        </StepRow>

        <StepRow n={2} state={s2} title="Pick your exchange" last={false}>
          <div className="mt-1 grid gap-3 sm:grid-cols-2">
            {providers.map((p) => (
              <button
                key={p.exchange}
                disabled={!p.recordable}
                onClick={() => setExchange(p.exchange)}
                className={`rounded-xl border p-4 text-left transition ${exchange === p.exchange ? "border-blue-2 bg-klein/[0.04] ring-1 ring-blue-2" : "border-line bg-surface hover:border-line-strong"} ${p.recordable ? "" : "cursor-not-allowed opacity-55"}`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold">{p.name}</span>
                  {p.recordable ? <span className="text-[12px] text-ok">Live on devnet</span> : <span className="text-[12px] text-dim">Coming soon</span>}
                </div>
                <div className="mt-1.5 text-[13px] leading-snug text-dim">{p.note}</div>
              </button>
            ))}
          </div>
        </StepRow>

        <StepRow n={3} state={s3} title="Prove your balance" last>
          <p className="text-muted">Reclaim opens a secure window where you log in. Your password goes to the exchange, never to us. Email or phone with OTP works best.</p>
          <button onClick={start} disabled={!wallet || !funded || busy || !chosen.recordable} className="btn btn-primary mt-4 px-5 py-3 text-[15px] disabled:opacity-50">
            {busy ? <CircleNotch size={17} className="animate-spin" /> : <Fingerprint size={17} />}
            Prove my {chosen.name} balance
          </button>
          {!wallet && <p className="mt-2 text-[13px] text-dim">Connect a wallet first.</p>}
          {wallet && !funded && <p className="mt-2 text-[13px] text-dim">Add a little devnet SOL first (step 1).</p>}
        </StepRow>
      </ol>

      <aside className="lg:col-span-5">
        <div className="sticky top-24 rounded-2xl border border-line bg-surface p-6 shadow-[0_20px_60px_-30px_rgb(11_13_18/0.25)]">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Your proof</span>
            {step === "done" ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-ok/10 px-2.5 py-1 text-[12px] font-medium text-ok"><CheckCircle size={14} weight="fill" /> Verified on Solana</span>
            ) : busy ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-klein/10 px-2.5 py-1 text-[12px] font-medium text-blue"><CircleNotch size={13} className="animate-spin" /> In progress</span>
            ) : (
              <span className="rounded-full bg-panel px-2.5 py-1 text-[12px] text-dim">Not started</span>
            )}
          </div>
          <dl className="mt-6 space-y-3.5 text-[14px]">
            <Row k="Exchange" v={chosen.name} />
            <Row k="Balance" v={result ? `${BUCKETS[result.bucket]} ${result.asset}` : "-"} mono />
            <Row k="Account fingerprint" v={result ? `${result.nullifier.slice(0, 14)}…` : "-"} mono blue={!!result} />
            <Row k="Wallet" v={wallet ? `${wallet.publicKey.toBase58().slice(0, 4)}…${wallet.publicKey.toBase58().slice(-4)}` : "-"} mono />
          </dl>

          {busy && (
            <div className="mt-6 border-t border-line pt-5 text-[14px] text-muted">
              <p>{msg}</p>
              {step !== "recording" && (
                <button onClick={() => { setStep("idle"); setMsg(""); }} className="mt-3 text-[13px] text-dim underline underline-offset-2 hover:text-text">
                  Cancel
                </button>
              )}
              {step === "recording" && progress.total > 0 && (
                <div className="mt-4">
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-panel">
                    <div className="h-full rounded-full bg-klein transition-[width] duration-500" style={{ width: `${(progress.done / progress.total) * 100}%` }} />
                  </div>
                  <div className="mt-2 font-mono text-[12px] text-dim">{progress.done} of {progress.total} transactions confirmed</div>
                </div>
              )}
            </div>
          )}
          {step === "done" && result && (
            <div className="mt-6 border-t border-line pt-5 text-[14px]">
              <p className="text-muted">{chosen.name} {result.asset} floor is now proven by {result.provers} account{result.provers === 1 ? "" : "s"}: a minimum, not the total.</p>
              <a className="mt-3 inline-flex items-center gap-1 text-blue hover:underline" href={`https://explorer.solana.com/tx/${result.sig}?cluster=devnet`} target="_blank" rel="noreferrer">
                View record_proof on Explorer <ArrowUpRight size={13} />
              </a>
            </div>
          )}
          {step === "error" && (
            <div className="mt-6 flex items-start gap-2 border-t border-line pt-5 text-[14px] text-amber">
              <WarningDiamond size={17} weight="bold" className="mt-0.5 shrink-0" /> <span className="break-words">{msg}</span>
            </div>
          )}
          {step === "idle" && <p className="mt-6 border-t border-line pt-5 text-[13px] text-dim">We store the balance range and a one-way fingerprint, never your account ID.</p>}
        </div>
      </aside>
    </div>
  );
}

function StepRow({ n, state, title, last, children }: { n: number; state: string; title: string; last: boolean; children: React.ReactNode }) {
  return (
    <li className="relative flex gap-5 pb-10">
      {!last && <span aria-hidden className={`absolute bottom-0 left-[15px] top-9 w-px ${state === "done" ? "bg-klein" : "bg-line"}`} />}
      <span
        className={`relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full font-mono text-[13px] font-semibold ${
          state === "done" ? "bg-klein text-white" : state === "active" ? "bg-surface text-blue ring-2 ring-blue-2" : "bg-panel text-dim ring-1 ring-line"
        }`}
      >
        {state === "done" ? <Check size={15} weight="bold" /> : n}
      </span>
      <div className="min-w-0 flex-1 pt-0.5">
        <h3 className={`text-lg font-semibold tracking-tight ${state === "todo" ? "text-dim" : ""}`}>{title}</h3>
        <div className="mt-2">{children}</div>
      </div>
    </li>
  );
}

function Row({ k, v, mono, blue }: { k: string; v: string; mono?: boolean; blue?: boolean }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-dim">{k}</dt>
      <dd className={`${mono ? "font-mono" : "font-medium"} ${blue ? "text-blue" : ""}`}>{v}</dd>
    </div>
  );
}
