import Link from "next/link";
import { List } from "@phosphor-icons/react/dist/ssr";

const LINKS = [
  ["/board", "Board"],
  ["/replay", "Replays"],
  ["/cover", "Cover"],
  ["/judges", "Judges"],
] as const;

export function Nav() {
  return (
    <header className="fixed inset-x-0 top-0 z-50 h-[72px] bg-ink/70 backdrop-blur-xl">
      <div className="mx-auto flex h-full max-w-[1360px] items-center justify-between gap-6 px-5 lg:px-10">
        <Link href="/" className="flex items-center gap-2.5" aria-label="Counterledger home">
          <Logo size={24} />
          <span className="text-[17px] font-semibold tracking-[-0.02em]">Counterledger</span>
        </Link>
        <div className="flex items-center gap-2">
          <nav className="mr-4 hidden items-center gap-7 md:flex">
            {LINKS.map(([href, label]) => (
              <Link key={href} href={href} className="text-[15px] font-medium text-text/85 transition-colors hover:text-text">
                {label}
              </Link>
            ))}
          </nav>
          <Link href="/break" className="btn btn-ghost hidden h-10 px-4 text-[14px] lg:inline-flex">
            Try to break it
          </Link>
          <Link href="/prove" className="btn btn-primary hidden h-10 px-4 text-[14px] sm:inline-flex">
            Prove my balance
          </Link>
          <details className="group relative md:hidden">
            <summary aria-label="Menu" className="flex h-10 w-10 cursor-pointer list-none items-center justify-center rounded-[10px] border border-line-strong text-muted">
              <List size={18} />
            </summary>
            <div className="absolute right-0 top-12 w-56 rounded-[14px] border border-line bg-surface p-2 shadow-[0_20px_60px_rgb(0_0_0/0.6)]">
              {[["/prove", "Prove my balance"], ...LINKS, ["/break", "Try to break it"]].map(([href, label]) => (
                <Link key={href} href={href} className="block rounded-[10px] px-3 py-2.5 text-sm text-muted hover:bg-panel hover:text-text">
                  {label}
                </Link>
              ))}
            </div>
          </details>
        </div>
      </div>
    </header>
  );
}

export function Logo({ size = 22 }: { size?: number }) {
  // two ledger columns: the exchange's side and the users' side
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <defs>
        <linearGradient id="cl-logo-blue" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3d68ff" />
          <stop offset="1" stopColor="#0b3bd6" />
        </linearGradient>
      </defs>
      <rect x="3" y="2.8" width="7.6" height="18.4" rx="1.8" fill="none" stroke="#f3f4f6" strokeWidth="1.6" />
      <rect x="13.4" y="2" width="8.4" height="20" rx="1.8" fill="url(#cl-logo-blue)" />
      <path d="M5.4 7.6h2.8M5.4 12h2.8M5.4 16.4h2.8" stroke="#f3f4f6" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M16.2 7.6h2.8M16.2 12h2.8M16.2 16.4h2.8" stroke="#000" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
