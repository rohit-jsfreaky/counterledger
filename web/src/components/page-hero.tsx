import { Reveal, Words } from "./reveal";

/** Same container as the nav and footer, so every page edge lines up. */
export const SHELL = "mx-auto w-full max-w-[1360px] px-5 lg:px-10";

/**
 * Inner-page header in the landing's language: mono pill, sans headline with a serif-italic second line, one paragraph,
 * and an optional aside (key numbers or actions). Static Klein light at the top right; the only motion is the load reveal.
 */
export function PageHero({
  kicker,
  title,
  accent,
  children,
  aside,
}: {
  kicker: string;
  title: string;
  accent?: string;
  children?: React.ReactNode;
  aside?: React.ReactNode;
}) {
  return (
    <section className="relative isolate overflow-hidden border-b border-line">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(55%_90%_at_88%_-10%,rgb(61_104_255/0.18),transparent_65%),radial-gradient(40%_60%_at_10%_120%,rgb(0_47_167/0.12),transparent_70%)]"
      />
      <div aria-hidden className="grain pointer-events-none absolute inset-0 -z-10 opacity-35" />
      <div className={`${SHELL} grid gap-10 pb-14 pt-14 lg:grid-cols-12 lg:items-end lg:pb-20 lg:pt-24`}>
        <div className={aside ? "lg:col-span-8" : "lg:col-span-10"}>
          <Reveal load>
            <span className="pill-label">{kicker}</span>
          </Reveal>
          <h1 className="mt-6 text-[40px] font-medium leading-[1.04] tracking-[-0.035em] sm:text-[52px] lg:text-[64px]">
            <Words load delay={0.1} text={title} />
            {accent && (
              <>
                <br />
                <span className="serif-i text-[44px] leading-[1.12] text-ice sm:text-[58px] lg:text-[74px]">
                  <Words load delay={0.35} text={accent} />
                </span>
              </>
            )}
          </h1>
          {children && (
            <Reveal load delay={0.45}>
              <p className="mt-6 max-w-[62ch] text-[17px] leading-relaxed text-muted">{children}</p>
            </Reveal>
          )}
        </div>
        {aside && (
          <Reveal load delay={0.55} className="lg:col-span-4">
            {aside}
          </Reveal>
        )}
      </div>
    </section>
  );
}

/** Small stat block for a hero aside: big mono number, one-line caption. */
export function HeroStats({ items }: { items: [string, string][] }) {
  return (
    <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-[14px] border border-line bg-line">
      {items.map(([v, l]) => (
        <div key={l} className="bg-surface/90 px-4 py-4 backdrop-blur sm:px-5">
          <dt className="font-mono text-[17px] font-medium tracking-tight sm:text-[22px]">{v}</dt>
          <dd className="mt-1 text-[13px] leading-snug text-dim">{l}</dd>
        </div>
      ))}
    </dl>
  );
}
