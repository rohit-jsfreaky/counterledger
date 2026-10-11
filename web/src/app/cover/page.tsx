import { Wallets } from "@/components/wallet";
import { SectionTitle } from "@/components/ui";
import { boardRow, devnet, EXCHANGES } from "@/lib/data";
import { CoverMarket } from "./cover-market";

export const metadata = { title: "Cover — Counterledger" };

export default function Cover() {
  const st = devnet();
  const pools = EXCHANGES.filter((id) => st.pools?.[id]).map((id) => ({ id, name: boardRow(id).name }));
  return (
    <div className="mx-auto max-w-[1280px] px-5 py-14 lg:px-8 lg:py-20">
      <SectionTitle kicker="Cover" title="Cover against a withdrawal halt">
        One pool per exchange, in test-USDC on devnet. The price comes from the exchange&apos;s score and the pool&apos;s usage. The payout
        comes from a confirmed halt on the heartbeat, after a challenge window, and never from a vote. This is a protocol demo, not
        insurance.
      </SectionTitle>
      <Wallets>
        <CoverMarket pools={pools} mint={st.usdcMint} />
      </Wallets>
      <div className="mt-16 grid gap-10 border-t border-line pt-10 md:grid-cols-3">
        {[
          ["Priced by evidence", "The rate rises as an exchange's score falls and as its pool fills up. The score is a published formula anyone can recompute."],
          ["Paid by proof, not a vote", "A confirmed halt on the heartbeat opens a challenge window. If nobody challenges it, every live cover on that exchange pays in full."],
          ["One pool per exchange", "Each pool can cover at most half its assets, so one failure cannot drain the others. Nexus Mutual sold $220M of custody cover, paid about $6M in claims, then moved to retire it because liabilities were unknown."],
        ].map(([t, b]) => (
          <div key={t}>
            <h3 className="font-semibold">{t}</h3>
            <p className="mt-2 text-[15px] leading-relaxed text-muted">{b}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
