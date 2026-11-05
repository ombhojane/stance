/**
 * The Stance mark: a 7×5 dot matrix (the same grid language as the ASCII price
 * cone) with the payoff ramp lit: flat, rise, flat. The last dot is the flag.
 */
export const MARK_COLS = 7;
export const MARK_ROWS = 5;
// lit dot per column (row index from top): low, low, rise, rise, rise, high, high
const RAMP_ROWS = [4, 4, 3, 2, 1, 0, 0];

export function markDots() {
  const dots: { c: number; r: number; lit: boolean; flag: boolean }[] = [];
  for (let c = 0; c < MARK_COLS; c++) {
    for (let r = 0; r < MARK_ROWS; r++) {
      const lit = RAMP_ROWS[c] === r;
      dots.push({ c, r, lit, flag: lit && c === MARK_COLS - 1 });
    }
  }
  return dots;
}

export function Mark({ size = 22, ink = "currentColor", flag = "var(--accent)" }: { size?: number; ink?: string; flag?: string }) {
  const pitch = 10;
  const w = MARK_COLS * pitch;
  const h = MARK_ROWS * pitch;
  return (
    <svg width={(size * w) / h} height={size} viewBox={`0 0 ${w} ${h}`} aria-hidden>
      {markDots().map(({ c, r, lit, flag: isFlag }) => (
        <circle
          key={`${c}-${r}`}
          cx={c * pitch + pitch / 2}
          cy={r * pitch + pitch / 2}
          r={lit ? 3.6 : 1.4}
          fill={isFlag ? flag : ink}
          opacity={lit ? 1 : 0.28}
        />
      ))}
    </svg>
  );
}

export function Logo({ size = 20 }: { size?: number }) {
  return (
    <span className="flex select-none items-center gap-2.5 text-ink" style={{ fontSize: size }}>
      <Mark size={size * 0.95} />
      <span className="font-semibold tracking-[-0.04em]">stance</span>
    </span>
  );
}
