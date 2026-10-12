import Link from "next/link";
import { ArrowRight, CheckCircle, WarningDiamond } from "@phosphor-icons/react/dist/ssr";
import { TxLink } from "@/components/ui";
import { HeroStats, PageHero, SHELL } from "@/components/page-hero";
import { devnet, EXPLORER, proofs, replays, verifyResult } from "@/lib/data";

export const metadata = { title: "For judges — Counterledger" };

const PATH = [
  ["/board", "Board", "Seven exchanges: reserves from published wallets, the withdrawal heartbeat, the user-proven floor and the score, each with its source."],
  ["/x/coindcx", "CoinDCX", "A real balance proof checked by our Solana program: Reclaim's attestor signature recovered on-chain. The floor is a minimum, not the total."],
  ["/replay", "Replay", "The heartbeat rule, with parameters fixed before running, on FTX, WazirX and Bitget, plus the normal weeks it was tested on. A false alarm counts too."],
  ["/break", "Try to break it", "Forged proofs, double counting, fake reports and over-cap cover, each simulated against the deployed program."],
  ["/cover", "Cover", "Buy or provide cover with a devnet wallet. The price comes from the score; the payout comes from a confirmed halt, not a vote."],
] as const;

const STEPS: Record<string, string> = {
  add_exchange: "Replay exchange created",
  lp_deposit: "LP deposits test-USDC",
  post_heartbeat: "Observer posts a normal heartbeat (Nov 2022 data)",
  post_score: "Observer posts the pre-event score",
  buy_cover: "Buyer buys cover",
  post_halt: "Observer posts the confirmed halt, with the evidence hash",
  open_trigger: "Trigger opens; challenge window starts",
  finalize_trigger: "Window passes unchallenged; anyone finalizes",
  claim_cover: "Buyer is paid in full",
};

export default function Judges() {
  const st = devnet();
  const v = verifyResult();
  const proof = proofs("coindcx")[0];
  const replay = replays()[0];
  const ids: [string, React.ReactNode][] = [
    ["Program", <a key="p" className="link num text-[12px]" href={EXPLORER("address", st.programId)} target="_blank" rel="noreferrer">{st.programId.slice(0, 6)}…{st.programId.slice(-6)}</a>],
    ["Config (trusted attestor, observer)", <a key="c" className="link num text-[12px]" href={EXPLORER("address", st.config)} target="_blank" rel="noreferrer">{st.config.slice(0, 6)}…{st.config.slice(-6)}</a>],
    ["Test-USDC mint", <a key="m" className="link num text-[12px]" href={EXPLORER("address", st.usdcMint)} target="_blank" rel="noreferrer">{st.usdcMint.slice(0, 6)}…{st.usdcMint.slice(-6)}</a>],
    ...(proof ? [[`Real CoinDCX proof (${proof.bucketLabel})`, <TxLink key="r" sig={proof.txs.recordProof} />] as [string, React.ReactNode]] : []),
  ];
  return (
    <>
      <PageHero
        kicker="For judges"
        title="Judge it"
        accent="in sixty seconds."
        aside={
          <HeroStats
            items={[
              [v ? `${v.passed}/${v.total}` : "—", "uv run verify checks pass"],
              ["0", "keys needed to recompute"],
              [proof ? "1" : "0", "real balance proof on devnet"],
              [replay ? String(Object.keys(replay.txs).length) : "0", "devnet txs in the FTX replay"],
            ]}
          />
        }
      >
        Everything here runs on Solana devnet with test-USDC. Every number on the site comes from a file that{" "}
        <span className="num text-text">uv run verify</span> recomputes, and every score and trigger has its evidence hash posted on-chain.
      </PageHero>

      <div className={`${SHELL} py-14 lg:py-20`}>
        <div className="eyebrow">The path</div>
        <ol className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {PATH.map(([href, name, what], i) => (
            <li key={href}>
              <Link href={href} className="card group flex h-full flex-col p-5 transition-colors hover:border-line-strong hover:bg-panel">
                <div className="flex items-center justify-between">
                  <span className="num text-[13px] text-dim">{String(i + 1).padStart(2, "0")}</span>
                  <ArrowRight size={16} className="text-dim transition-transform group-hover:translate-x-0.5 group-hover:text-text" />
                </div>
                <div className="mt-8 text-[19px] font-medium tracking-[-0.01em]">{name}</div>
                <p className="mt-2 text-[14px] leading-relaxed text-muted">{what}</p>
              </Link>
            </li>
          ))}
        </ol>

        <div className="mt-16 grid items-start gap-6 lg:grid-cols-12">
          <section className="card min-w-0 p-6 lg:col-span-5">
            <div className="eyebrow">On devnet</div>
            <dl className="mt-4 divide-y divide-line">
              {ids.map(([k, val]) => (
                <div key={k} className="flex items-center justify-between gap-4 py-3 text-[14px]">
                  <dt className="text-muted">{k}</dt>
                  <dd>{val}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-4 text-[13px] leading-relaxed text-dim">The observer is a single signer in v1. The cover market is a protocol demo, not insurance.</p>
          </section>

          {replay && (
            <section className="card min-w-0 p-6 lg:col-span-7">
              <div className="eyebrow">FTX halt, replayed end to end on devnet</div>
              <ol className="mt-4 divide-y divide-line">
                {Object.entries(replay.txs as Record<string, string>).map(([k, sig], j) => (
                  <li key={k} className="flex items-center gap-4 py-2.5 text-[14px]">
                    <span className="num w-6 text-[12px] text-dim">{String(j + 1).padStart(2, "0")}</span>
                    <span className="flex-1 text-muted">{STEPS[k] ?? k}</span>
                    <TxLink sig={sig} />
                  </li>
                ))}
              </ol>
              <p className="mt-4 text-[13px] leading-relaxed text-dim">
                Paid {replay.paid_test_usdc} test-USDC on a {replay.notional_test_usdc} cover after a {replay.challenge_window_secs}s
                challenge window (24 hours in the rules; shortened for the demo). The halt time comes from the pre-registered rule on
                Nov 2022 data: {replay.historical?.halt_confirmed?.replace("T", " ").replace(":00Z", " UTC")}.
              </p>
            </section>
          )}
        </div>

        <div className="mt-16 grid gap-6 lg:grid-cols-12">
          <section className="min-w-0 lg:col-span-4">
            <span className="pill-label">Run it yourself</span>
            <h2 className="mt-5 text-[32px] font-medium leading-[1.08] tracking-[-0.03em]">
              Recompute every number, <span className="serif-i text-ice">offline.</span>
            </h2>
            <p className="mt-4 text-[15px] leading-relaxed text-muted">
              <span className="num text-text">verify</span> replays the recorded cache: no keys and no network. It needs uv and Go.
            </p>
            <pre className="num mt-6 overflow-x-auto rounded-[12px] border border-line bg-black p-4 text-[12.5px] leading-6 text-muted">{`git clone https://github.com/rohit-jsfreaky/counterledger
cd counterledger/engine
uv run verify
uv run pytest

cd ../program
anchor build && cargo test   # 12 LiteSVM tests

cd ../web
npm install && npm run dev`}</pre>
          </section>

          <section className="min-w-0 overflow-hidden rounded-[14px] border border-line bg-black lg:col-span-8">
            <div className="flex items-center justify-between border-b border-line bg-surface px-5 py-3">
              <div className="flex items-center gap-3">
                <span className="flex gap-1.5" aria-hidden>
                  <i className="h-2.5 w-2.5 rounded-full bg-white/10" />
                  <i className="h-2.5 w-2.5 rounded-full bg-white/10" />
                  <i className="h-2.5 w-2.5 rounded-full bg-white/10" />
                </span>
                <span className="num text-[13px] text-muted">$ uv run verify</span>
              </div>
              {v ? <span className="num rounded-md bg-ok/10 px-2 py-0.5 text-[12px] text-ok">{v.passed}/{v.total} PASS</span> : <span className="text-[13px] text-dim">— not run</span>}
            </div>
            {v && (
              <ul className="max-h-[560px] space-y-2 overflow-y-auto p-5">
                {v.lines.map((l, i) => (
                  <li key={i} className="flex items-start gap-2.5 font-mono text-[12px] leading-[1.55]">
                    {l.ok ? <CheckCircle size={14} className="mt-[3px] shrink-0 text-ok" /> : <WarningDiamond size={14} className="mt-[3px] shrink-0 text-amber" />}
                    <span className={l.ok ? "text-muted" : "text-amber"}>
                      <span className={l.ok ? "text-ok" : ""}>{l.ok ? "PASS" : "FAIL"}</span> {l.msg}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </>
  );
}
