export function Logo({ size = 20 }: { size?: number }) {
  return (
    <span className="flex select-none items-center gap-2" style={{ fontSize: size }}>
      <svg width={size * 1.4} height={size * 1.4} viewBox="0 0 28 28" aria-hidden>
        <rect width="28" height="28" rx="9" fill="var(--accent)" />
        {/* a planted flag on the payoff ramp */}
        <path d="M5 20.5h5l7-9h6" stroke="var(--on-accent)" strokeWidth="2.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M17 11.5V5.5l4.5 1.6L17 8.7" fill="var(--on-accent)" stroke="var(--on-accent)" strokeWidth="1.4" strokeLinejoin="round" />
      </svg>
      <span className="font-semibold tracking-[-0.03em]">stance</span>
    </span>
  );
}
