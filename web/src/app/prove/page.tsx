import { Wallets } from "@/components/wallet";
import { SectionTitle } from "@/components/ui";
import { PROVIDERS } from "@/lib/providers";
import { ProveFlow } from "./prove-flow";

export const metadata = { title: "Prove my balance — Counterledger" };

export default function Prove() {
  return (
    <div className="mx-auto max-w-[1280px] px-5 py-14 lg:px-8 lg:py-20">
      <SectionTitle kicker="Prove" title="Prove the balance your exchange shows you">
        One login, one signed fact: your coin and balance, plus a hashed account ID so one account counts once. Our Solana program checks it and adds you to the exchange&apos;s proven floor.
      </SectionTitle>
      <Wallets>
        <ProveFlow providers={PROVIDERS} />
      </Wallets>
      <div className="mt-16 grid gap-10 border-t border-line pt-10 md:grid-cols-3">
        {[
          ["What goes on-chain", "A balance range, the coin, a 30-day period and a one-way fingerprint of your hashed account ID. The claim itself sits in the upload transactions, which are public on devnet."],
          ["What the program checks", "The claim ID recomputes, a trusted Reclaim attestor signed it, it came from the accepted provider, it is bound to your wallet, it is under 7 days old, and this account has not proven this period."],
          ["Devnet only", "Nothing here touches real money. Rent is paid in free devnet SOL, and the faucet in step 1 sends you some."],
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
