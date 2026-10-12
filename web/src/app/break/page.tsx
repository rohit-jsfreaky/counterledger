import { devnet } from "@/lib/data";
import { PageHero, SHELL } from "@/components/page-hero";
import { BreakPanel } from "./break-panel";
import { ATTACKS } from "@/lib/attacks";

export const metadata = { title: "Try to break it — Counterledger" };

const HOW: [string, string][] = [
  ["Build", "Each attack is a real transaction against the deployed program, signed as whoever the attacker pretends to be."],
  ["Simulate", "Devnet runs it with signature checks off. Nothing is sent and no account changes."],
  ["Read the refusal", "The error code comes from the program's own checks, and the logs are devnet's, shown as returned."],
];

export default function Break() {
  const st = devnet();
  return (
    <>
      <PageHero kicker="Break it" title="Try to break it." accent="Watch the program refuse.">
        Seven attacks on the deployed program, from forged proofs to over-cap cover, plus one honest control that should pass, so you
        know the simulator isn&apos;t just rejecting everything.
      </PageHero>
      <div className={`${SHELL} grid gap-12 py-14 lg:grid-cols-12 lg:py-20`}>
        <aside className="lg:col-span-4">
          <div className="lg:sticky lg:top-28">
            <div className="eyebrow">How it works</div>
            <ol className="mt-5 space-y-6">
              {HOW.map(([t, b], i) => (
                <li key={t} className="flex gap-4">
                  <span className="num flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-line-strong text-[12px] text-muted">{i + 1}</span>
                  <div>
                    <div className="font-medium">{t}</div>
                    <p className="mt-1 text-[14px] leading-relaxed text-muted">{b}</p>
                  </div>
                </li>
              ))}
            </ol>
            <div className="mt-10 border-t border-line pt-6">
              <div className="eyebrow">What this doesn&apos;t cover</div>
              <p className="mt-3 text-[14px] leading-relaxed text-muted">
                The observer is a single key in v1: whoever holds it can post a wrong heartbeat. The challenge window (24 hours in the
                rules, 2 minutes on this devnet demo) and <span className="num text-text">uv run verify</span>, which recomputes every
                posted hash, are how you catch it. A Reclaim attestor is trusted as a signer; we pin its address on-chain.
              </p>
            </div>
          </div>
        </aside>
        <div className="lg:col-span-8">
          <BreakPanel attacks={ATTACKS} programId={st.programId} />
        </div>
      </div>
    </>
  );
}
