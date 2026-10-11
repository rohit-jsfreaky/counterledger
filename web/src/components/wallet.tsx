"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ConnectionProvider, WalletProvider, useConnection, useWallet } from "@solana/wallet-adapter-react";
import { WalletReadyState } from "@solana/wallet-adapter-base";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import { ArrowSquareOut, CaretDown, Copy, SignOut, Wallet as WalletIcon, X } from "@phosphor-icons/react";
import { DemoWalletAdapter, DemoWalletName } from "@/lib/demo-wallet";

/** Devnet only. Wallet Standard wallets (Phantom, Solflare, Backpack…) are detected automatically; the demo wallet always works. */
export function Wallets({ children }: { children: React.ReactNode }) {
  const endpoint = useMemo(() => (typeof window === "undefined" ? "https://api.devnet.solana.com" : `${window.location.origin}/api/rpc`), []);
  const wallets = useMemo(() => [new DemoWalletAdapter()], []);
  return (
    <ConnectionProvider endpoint={endpoint} config={{ commitment: "confirmed", wsEndpoint: "wss://api.devnet.solana.com" }}>
      <WalletProvider wallets={wallets} autoConnect>
        {children}
      </WalletProvider>
    </ConnectionProvider>
  );
}

const short = (s: string) => `${s.slice(0, 4)}…${s.slice(-4)}`;

/** Connect button + our own wallet picker (no third-party modal). */
export function WalletButton({ className = "" }: { className?: string }) {
  const { wallets, select, publicKey, disconnect, wallet, connecting } = useWallet();
  const { connection } = useConnection();
  const [open, setOpen] = useState(false);
  const [menu, setMenu] = useState(false);
  const [sol, setSol] = useState<number | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!publicKey) return setSol(null);
    let live = true;
    const load = () => connection.getBalance(publicKey).then((l) => live && setSol(l / LAMPORTS_PER_SOL)).catch(() => {});
    load();
    const id = setInterval(load, 15_000);
    return () => {
      live = false;
      clearInterval(id);
    };
  }, [publicKey, connection]);

  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent) => menuRef.current && !menuRef.current.contains(e.target as Node) && setMenu(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [menu]);

  const installed = wallets.filter((w) => w.readyState === WalletReadyState.Installed && w.adapter.name !== DemoWalletName);
  const demo = wallets.find((w) => w.adapter.name === DemoWalletName);

  if (publicKey) {
    return (
      <div ref={menuRef} className={`relative inline-block ${className}`}>
        <button onClick={() => setMenu((m) => !m)} className="btn btn-ghost">
          {wallet?.adapter.icon && <img src={wallet.adapter.icon} alt="" className="h-4 w-4 rounded" />}
          <span className="font-mono text-[13px]">{short(publicKey.toBase58())}</span>
          {sol != null && <span className="font-mono text-[12px] text-dim">{sol.toFixed(3)} SOL</span>}
          <CaretDown size={13} className="text-dim" />
        </button>
        {menu && (
          <div className="absolute left-0 top-12 z-40 w-64 rounded-xl border border-line bg-surface p-1.5 shadow-[0_16px_48px_rgb(11_13_18/0.14)]">
            <div className="px-3 py-2 text-[12px] text-dim">{wallet?.adapter.name} · devnet</div>
            <button onClick={() => { navigator.clipboard?.writeText(publicKey.toBase58()); setMenu(false); }} className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm hover:bg-panel">
              <Copy size={16} /> Copy address
            </button>
            <a href={`https://explorer.solana.com/address/${publicKey.toBase58()}?cluster=devnet`} target="_blank" rel="noreferrer" className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm hover:bg-panel">
              <ArrowSquareOut size={16} /> View on Explorer
            </a>
            <button onClick={() => { disconnect(); setMenu(false); }} className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm hover:bg-panel">
              <SignOut size={16} /> Disconnect
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <>
      <button onClick={() => setOpen(true)} disabled={connecting} className={`btn btn-primary ${className}`}>
        <WalletIcon size={16} weight="bold" /> {connecting ? "Connecting…" : "Connect wallet"}
      </button>
      {open && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[rgb(11_13_18/0.35)] p-4 backdrop-blur-[2px]" onClick={() => setOpen(false)}>
          <div role="dialog" aria-modal="true" aria-label="Connect a wallet" className="w-full max-w-[420px] rounded-2xl border border-line bg-surface p-6 shadow-[0_30px_80px_rgb(11_13_18/0.25)]" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-xl font-semibold tracking-tight">Connect a wallet</h2>
                <p className="mt-1 text-sm text-dim">Solana devnet. Nothing here touches real money.</p>
              </div>
              <button onClick={() => setOpen(false)} aria-label="Close" className="rounded-full p-1.5 text-dim hover:bg-panel hover:text-text">
                <X size={18} />
              </button>
            </div>

            <div className="mt-6 space-y-2">
              {installed.map((w) => (
                <button key={w.adapter.name} onClick={() => { select(w.adapter.name); setOpen(false); }} className="flex w-full items-center gap-3 rounded-xl border border-line px-4 py-3 text-left transition hover:border-line-strong hover:bg-panel">
                  <img src={w.adapter.icon} alt="" className="h-7 w-7 rounded-md" />
                  <span className="font-medium">{w.adapter.name}</span>
                  <span className="ml-auto text-[12px] text-ok">Detected</span>
                </button>
              ))}
              {demo && (
                <button onClick={() => { select(demo.adapter.name); setOpen(false); }} className="flex w-full items-center gap-3 rounded-xl border border-blue-2/30 bg-klein/[0.04] px-4 py-3 text-left transition hover:bg-klein/[0.08]">
                  <img src={demo.adapter.icon} alt="" className="h-7 w-7 rounded-md" />
                  <span>
                    <span className="block font-medium">Use a demo wallet</span>
                    <span className="block text-[12px] text-dim">A devnet key kept in this browser. No install.</span>
                  </span>
                </button>
              )}
            </div>

            {installed.length === 0 && (
              <p className="mt-5 text-[13px] text-dim">
                No Solana wallet found in this browser. You can install{" "}
                <a href="https://phantom.com/download" target="_blank" rel="noreferrer" className="link">Phantom</a> or{" "}
                <a href="https://solflare.com/download" target="_blank" rel="noreferrer" className="link">Solflare</a> (set it to devnet), or use the demo wallet.
              </p>
            )}
          </div>
        </div>
      )}
    </>
  );
}
