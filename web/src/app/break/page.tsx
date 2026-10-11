import { SectionTitle } from "@/components/ui";
import { devnet } from "@/lib/data";
import { BreakPanel } from "./break-panel";
import { ATTACKS } from "@/lib/attacks";

export const metadata = { title: "Try to break it — Counterledger" };


export default function Break() {
  const st = devnet();
  return (
    <div className="mx-auto max-w-[1100px] px-5 py-14 lg:px-8 lg:py-20">
      <SectionTitle kicker="Break it" title="Try to break it">
        Each attack is a real transaction against the deployed program, simulated on devnet with signature checks off, so we can act as
        anyone. Nothing is sent and nothing changes. The rejection comes from the program&apos;s own checks, and the logs are devnet&apos;s.
      </SectionTitle>
      <BreakPanel attacks={ATTACKS} programId={st.programId} />
      <div className="mt-6 card p-5 text-sm text-muted">
        <div className="label mb-2">What this doesn&apos;t cover</div>
        The observer is a single key in v1: whoever holds it can post a wrong heartbeat, and the challenge window (24 hours in the rules, 2 minutes on this devnet demo) plus{" "}
        <span className="num">uv run verify</span> (which recomputes every posted hash) are how you catch it. A Reclaim attestor is trusted
        as a signer; we pin its address on-chain.
      </div>
    </div>
  );
}
