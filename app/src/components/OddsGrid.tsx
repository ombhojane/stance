/**
 * 100 cells = 100 ways the price could end. Lit = you get it all, half-lit =
 * you get some back, empty = you lose what you paid. Icon arrays are how risk
 * is best explained to non-experts; no ring charts needed.
 */
export function OddsGrid({ full, any, cols = 25 }: { full: number; any: number; cols?: number }) {
  const nFull = Math.round(full * 100);
  const nAny = Math.max(nFull, Math.round(any * 100));
  return (
    <div>
      <div className="grid gap-[3px]" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }} aria-hidden>
        {Array.from({ length: 100 }).map((_, i) => (
          <span
            key={i}
            className="aspect-square rounded-[3px]"
            style={{
              background: i < nFull ? "var(--up)" : i < nAny ? "color-mix(in oklab, var(--up) 35%, transparent)" : "var(--tile-3)",
            }}
          />
        ))}
      </div>
      <p className="mt-3 text-sm text-mute">
        Out of 100 ways this could end: <b className="font-semibold text-ink">{nFull}</b> pay you in full, <b className="font-semibold text-ink">{nAny - nFull}</b> pay part,{" "}
        <b className="font-semibold text-ink">{100 - nAny}</b> lose what you paid.
      </p>
    </div>
  );
}
