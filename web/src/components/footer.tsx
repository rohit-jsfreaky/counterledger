import Link from "next/link";
import { devnet } from "@/lib/data";
import { Logo } from "./nav";

export function Footer() {
  const st = devnet();
  const col = (title: string, links: [string, string][]) => (
    <div>
      <div className="font-mono text-[13px] text-dim">{title}</div>
      <ul className="mt-4 space-y-2.5">
        {links.map(([h, l]) => (
          <li key={h}>
            {h.startsWith("http") ? (
              <a href={h} target="_blank" rel="noreferrer" className="text-[15px] font-medium text-text/90 hover:text-text">{l}</a>
            ) : (
              <Link href={h} className="text-[15px] font-medium text-text/90 hover:text-text">{l}</Link>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
  return (
    <footer className="bg-[#0b0b0c]">
      <div className="mx-auto max-w-[1360px] px-5 pb-10 pt-16 lg:px-10">
        <Link href="/" className="inline-flex items-center gap-2.5">
          <Logo size={26} />
          <span className="text-[19px] font-semibold tracking-[-0.02em]">Counterledger</span>
        </Link>
        <p className="mt-2 text-[15px] text-dim">The users&apos; side of every exchange&apos;s books</p>

        <div className="mt-12 grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          {col("Product", [["/board", "Board"], ["/prove", "Prove my balance"], ["/cover", "Cover"]])}
          {col("Evidence", [["/replay", "Replays"], ["/break", "Try to break it"], ["/judges", "For judges"]])}
          {col("Code", [["https://github.com/rohit-jsfreaky/counterledger", "GitHub"], [`https://explorer.solana.com/address/${st.programId}?cluster=devnet`, "Program on devnet"]])}
          <div>
            <div className="font-mono text-[13px] text-dim">Run it yourself</div>
            <p className="mt-4 text-[15px] font-medium">Recompute every number on this site</p>
            <code className="mt-3 block rounded-[10px] border border-line bg-black px-4 py-3 font-mono text-[13px] text-muted">uv run verify</code>
          </div>
        </div>

        <div className="mt-16 flex flex-wrap justify-between gap-3 border-t border-line pt-6 font-mono text-[12px] text-dim">
          <span>Solana devnet, test-USDC only. Cover is a protocol demo, not insurance. The watcher is a single signer today.</span>
          <span>Proven floors are a minimum, never the total.</span>
        </div>
      </div>
    </footer>
  );
}
