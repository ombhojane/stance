export function usd(n: number, opts: { cents?: boolean; sign?: boolean } = {}): string {
  const abs = Math.abs(n);
  const cents = opts.cents ?? abs < 100;
  const s = abs.toLocaleString("en-US", {
    minimumFractionDigits: cents ? 2 : 0,
    maximumFractionDigits: cents ? 2 : 0,
  });
  const sign = n < 0 ? "−" : opts.sign && n > 0 ? "+" : "";
  return `${sign}$${s}`;
}

export function price(n: number): string {
  return `$${n.toLocaleString("en-US", { maximumFractionDigits: n < 1000 ? 2 : 0 })}`;
}

export function pct(p: number): string {
  const v = p * 100;
  if (v > 0 && v < 1) return "<1%";
  if (v > 99 && v < 100) return ">99%";
  return `${Math.round(v)}%`;
}

export function oneIn(p: number): string {
  if (p <= 0) return "never";
  if (p >= 0.5) return `${Math.round(p * 10)} in 10`;
  return `1 in ${Math.max(2, Math.round(1 / p))}`;
}

export function shortHash(seed: string): string {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  const hex = (Math.abs(h) >>> 0).toString(16).padStart(8, "0");
  return `0x${hex}${(Math.abs(h * 7) >>> 0).toString(16).padStart(8, "0")}…${hex.slice(0, 4)}`;
}

export function countdown(ms: number): string {
  if (ms <= 0) return "expired";
  const d = Math.floor(ms / 86400000);
  const h = Math.floor((ms % 86400000) / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}
