import Link from "next/link";
import { devnet } from "@/lib/data";
import { Logo } from "./nav";

export function Footer() {
  const st = devnet();
  return (
    <footer className="border-t border-line bg-surface">
      <div className="mx-auto grid max-w-[1280px] gap-10 px-5 py-14 text-sm lg:grid-cols-12 lg:px-8">
        <div className="lg:col-span-5">
          <Link href="/" className="flex items-center gap-2.5">
            <Logo />
            <span className="text-[15px] font-semibold tracking-tight">Counterledger</span>
          </Link>
          <p className="mt-4 max-w-[42ch] text-dim">
            The users&apos; side of every exchange&apos;s books. A Solana devnet demo with test-USDC: the cover market is a protocol demo, not insurance, and the withdrawal watcher is a single signer today.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-8 sm:grid-cols-3 lg:col-span-7">
          <div className="space-y-2.5">
            <div className="font-medium">Product</div>
            {[["/board", "Board"], ["/prove", "Prove my balance"], ["/cover", "Cover"]].map(([h, l]) => (
              <Link key={h} href={h} className="block text-dim hover:text-text">{l}</Link>
            ))}
          </div>
          <div className="space-y-2.5">
            <div className="font-medium">Evidence</div>
            {[["/replay", "Replays"], ["/break", "Try to break it"], ["/judges", "For judges"]].map(([h, l]) => (
              <Link key={h} href={h} className="block text-dim hover:text-text">{l}</Link>
            ))}
          </div>
          <div className="space-y-2.5">
            <div className="font-medium">Code</div>
            <a href="https://github.com/rohit-jsfreaky/counterledger" className="block text-dim hover:text-text">Source</a>
            <a href={`https://explorer.solana.com/address/${st.programId}?cluster=devnet`} className="block text-dim hover:text-text">Program on devnet</a>
          </div>
        </div>
      </div>
      <div className="border-t border-line">
        <div className="mx-auto flex max-w-[1280px] flex-wrap justify-between gap-2 px-5 py-5 text-[13px] text-dim lg:px-8">
          <span>Every number comes from a published evidence file that <span className="font-mono">uv run verify</span> recomputes.</span>
          <span>Proven floors are a minimum, never the total.</span>
        </div>
      </div>
    </footer>
  );
}
