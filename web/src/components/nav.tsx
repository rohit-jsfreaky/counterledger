import Link from "next/link";
import { List } from "@phosphor-icons/react/dist/ssr";

const LINKS = [
  ["/board", "Board"],
  ["/replay", "Replay"],
  ["/cover", "Cover"],
  ["/break", "Break it"],
  ["/judges", "Judges"],
] as const;

export function Nav() {
  return (
    <header className="fixed inset-x-0 top-0 z-50 h-16 border-b border-line bg-ink/85 backdrop-blur-md">
      <div className="mx-auto flex h-full max-w-[1280px] items-center justify-between gap-6 px-5 lg:px-8">
        <Link href="/" className="flex items-center gap-2.5">
          <Logo />
          <span className="text-[15px] font-semibold tracking-tight">Counterledger</span>
        </Link>
        <nav className="hidden items-center gap-7 md:flex">
          {LINKS.map(([href, label]) => (
            <Link key={href} href={href} className="text-[14px] text-muted transition-colors hover:text-text">
              {label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <Link
            href="/prove"
            className="hidden h-9 items-center rounded-full bg-klein px-4 text-[13px] font-medium text-white transition hover:bg-klein-hover active:scale-[0.98] sm:inline-flex"
          >
            Prove my balance
          </Link>
          <details className="group relative md:hidden">
            <summary aria-label="Menu" className="flex h-9 w-9 cursor-pointer list-none items-center justify-center rounded-full border border-line text-muted">
              <List size={18} />
            </summary>
            <div className="absolute right-0 top-11 w-52 rounded-xl border border-line bg-surface p-2 shadow-[0_12px_40px_rgb(11_13_18/0.12)]">
              {[["/prove", "Prove my balance"], ...LINKS].map(([href, label]) => (
                <Link key={href} href={href} className="block rounded-lg px-3 py-2.5 text-sm text-muted hover:bg-panel hover:text-text">
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
      <rect x="2.5" y="3" width="8" height="18" rx="1.5" fill="none" stroke="#0b0d12" strokeWidth="1.5" />
      <rect x="13.5" y="3" width="8" height="18" rx="1.5" fill="#002fa7" stroke="#002fa7" strokeWidth="1.5" />
      <path d="M5 8h3M5 12h3M5 16h3" stroke="#0b0d12" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M16 8h3M16 12h3M16 16h3" stroke="#dfe6ff" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
