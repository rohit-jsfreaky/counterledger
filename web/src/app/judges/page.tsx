import Link from "next/link";
import { ArrowRight, CheckCircle, WarningDiamond } from "@phosphor-icons/react/dist/ssr";
import { SectionTitle, TxLink } from "@/components/ui";
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
  return (
    <div className="mx-auto max-w-[1100px] px-5 py-14 lg:px-8 lg:py-20">
      <SectionTitle kicker="For judges" title="The 60-second path">
        Everything here runs on Solana devnet with test-USDC. Every number on the site comes from a file that{" "}
        <span className="num">uv run verify</span> recomputes, and every score and trigger has its evidence hash posted on-chain.
      </SectionTitle>

      <ol className="grid gap-3">
        {PATH.map(([href, name, what], i) => (
          <li key={href}>
            <Link href={href} className="card flex items-start gap-4 p-4 hover:border-blue-2">
              <span className="num mt-0.5 text-dim">{i + 1}</span>
              <div className="flex-1">
                <div className="font-medium">{name}</div>
                <div className="mt-1 text-sm text-muted">{what}</div>
              </div>
              <ArrowRight size={18} className="mt-1 text-dim" />
            </Link>
          </li>
        ))}
      </ol>

      <div className="mt-10 grid gap-6 lg:grid-cols-2">
        <div className="card p-6">
          <div className="label mb-3">On devnet</div>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between gap-4"><dt className="text-muted">Program</dt><dd><a className="link num text-xs" href={EXPLORER("address", st.programId)} target="_blank" rel="noreferrer">{st.programId}</a></dd></div>
            <div className="flex justify-between gap-4"><dt className="text-muted">Config (trusted attestor, observer)</dt><dd><a className="link num text-xs" href={EXPLORER("address", st.config)} target="_blank" rel="noreferrer">{st.config.slice(0, 10)}…</a></dd></div>
            <div className="flex justify-between gap-4"><dt className="text-muted">Test-USDC mint</dt><dd><a className="link num text-xs" href={EXPLORER("address", st.usdcMint)} target="_blank" rel="noreferrer">{st.usdcMint.slice(0, 10)}…</a></dd></div>
            {proof && (
              <div className="flex justify-between gap-4"><dt className="text-muted">Real CoinDCX proof ({proof.bucketLabel})</dt><dd><TxLink sig={proof.txs.recordProof} /></dd></div>
            )}
          </dl>
          <p className="mt-4 text-xs text-dim">
            The observer is a single signer in v1. The cover market is a protocol demo, not insurance.
          </p>
        </div>

        {replay && (
          <div className="card p-6">
            <div className="label mb-3">FTX halt, replayed end to end on devnet</div>
            <ol className="space-y-1.5 text-sm">
              {Object.entries(replay.txs as Record<string, string>).map(([k, sig]) => (
                <li key={k} className="flex justify-between gap-4">
                  <span className="text-muted">{STEPS[k] ?? k}</span>
                  <TxLink sig={sig} />
                </li>
              ))}
            </ol>
            <p className="mt-4 text-xs text-dim">
              Paid {replay.paid_test_usdc} test-USDC on a {replay.notional_test_usdc} cover after a {replay.challenge_window_secs}s
              challenge window (24 hours in the rules; shortened for the demo). The halt time comes from the pre-registered rule on
              Nov 2022 data: {replay.historical?.halt_confirmed?.replace("T", " ").replace(":00Z", " UTC")}.
            </p>
          </div>
        )}
      </div>

      <div className="mt-10 card p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div className="label">uv run verify</div>
          {v ? <div className="num text-sm">{v.passed}/{v.total} PASS</div> : <div className="text-sm text-dim">— not run</div>}
        </div>
        {v && (
          <ul className="mt-4 space-y-1.5">
            {v.lines.map((l, i) => (
              <li key={i} className="flex items-start gap-2 text-[13px]">
                {l.ok ? <CheckCircle size={16} className="mt-0.5 shrink-0 text-ok" /> : <WarningDiamond size={16} className="mt-0.5 shrink-0 text-amber" />}
                <span className={l.ok ? "text-muted" : "text-amber"}>
                  <span className="num">{l.ok ? "PASS" : "FAIL"}</span> {l.msg}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-10 card p-6">
        <div className="label mb-3">Run it yourself</div>
        <pre className="well num overflow-x-auto p-4 text-[13px] leading-6 text-muted">{`git clone https://github.com/rohit-jsfreaky/counterledger
cd counterledger/engine
uv run verify          # no keys, no network: replays the recorded cache (needs uv + Go)
uv run pytest

cd ../program
anchor build && cargo test   # 12 LiteSVM tests: claim checks, floors, reports, cover, payouts

cd ../web
npm install && npm run dev`}</pre>
      </div>
    </div>
  );
}
