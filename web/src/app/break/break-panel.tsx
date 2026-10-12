"use client";

import { useState } from "react";
import { CheckCircle, CircleNotch, Lightning, ShieldCheck, Terminal } from "@phosphor-icons/react";

type Attack = { id: string; title: string; tries: string; guard: string; expect: string };
type Result = { rejected: boolean; result: { code: string; number: number; message: string }; logs: string[]; unitsConsumed: number | null; slot: number };

export function BreakPanel({ attacks, programId }: { attacks: Attack[]; programId: string }) {
  const [results, setResults] = useState<Record<string, Result | { error: string } | "busy">>({});

  async function run(id: string) {
    setResults((r) => ({ ...r, [id]: "busy" }));
    try {
      const r = await fetch("/api/break", { method: "POST", body: JSON.stringify({ attack: id }) });
      const j = await r.json();
      setResults((s) => ({ ...s, [id]: r.ok ? j : { error: j.error ?? "failed" } }));
    } catch (e: any) {
      setResults((s) => ({ ...s, [id]: { error: String(e?.message ?? e) } }));
    }
  }

  async function runAll() {
    for (const a of attacks) await run(a.id);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <button onClick={runAll} className="btn btn-primary">
          <Lightning size={16} weight="bold" /> Run every attack
        </button>
        <span className="text-xs text-dim">
          Each run builds a real transaction against program <span className="num">{programId.slice(0, 8)}…</span> and asks devnet to simulate it.
        </span>
      </div>
      {attacks.map((a, i) => {
        const r = results[a.id];
        const done = r && r !== "busy" && !("error" in r) ? r : null;
        const ok = done && (a.id === "control" ? !done.rejected : done.rejected && a.expect.split(" / ").includes(done.result.code));
        return (
          <div key={a.id} className="card p-5">
            <div className="flex items-start justify-between gap-6">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2.5">
                  <span className="num text-[12px] text-dim">{String(i + 1).padStart(2, "0")}</span>
                  {a.id === "control" ? <CheckCircle size={18} className="text-ok" /> : <ShieldCheck size={18} className="text-blue" />}
                  <h3 className="text-[17px] font-medium tracking-[-0.01em]">{a.title}</h3>
                </div>
                <p className="mt-2 text-sm text-muted">{a.tries}</p>
                <p className="mt-1 text-xs text-dim">
                  Guard: {a.guard} · expected <span className="num text-text">{a.expect}</span>
                </p>
              </div>
              <button onClick={() => run(a.id)} disabled={r === "busy"} className="btn btn-ghost shrink-0 text-sm disabled:opacity-50">
                {r === "busy" ? <CircleNotch size={16} className="animate-spin" /> : <Terminal size={16} />} Simulate
              </button>
            </div>
            {r && r !== "busy" && "error" in r && <div className="mt-3 text-sm text-amber">Could not simulate: {r.error}</div>}
            {done && (
              <div className="mt-4 well p-4">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                  <span className={ok ? "text-ok" : "text-amber"}>
                    {done.rejected ? "Rejected" : "Accepted"} · <span className="num">{done.result.code}</span>
                    {done.result.number ? <span className="num text-dim"> ({done.result.number})</span> : null}
                  </span>
                  <span className="text-muted">{done.result.message}</span>
                  <span className="num ml-auto text-xs text-dim">slot {done.slot.toLocaleString()} · {done.unitsConsumed?.toLocaleString() ?? "—"} CU</span>
                </div>
                <details className="mt-2">
                  <summary className="cursor-pointer text-xs text-dim">program logs</summary>
                  <pre className="num mt-2 overflow-x-auto whitespace-pre-wrap break-all text-[11px] leading-5 text-muted">{done.logs.join("\n")}</pre>
                </details>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
