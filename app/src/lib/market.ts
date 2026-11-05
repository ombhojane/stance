// Static market model for the UI prototype.
// Mirrors docs/02-product-spec.md §4. Everything here is simulated in the browser.

export type AssetId = "ETH" | "BTC" | "SOL";
export type Direction = "above" | "below";
export type Side = "UP" | "DOWN";

export interface Asset {
  id: AssetId;
  name: string;
  spot: number;
  vol: number; // annualised
  grid: number; // strike grid step
  hue: string;
}

export const ASSETS: Record<AssetId, Asset> = {
  ETH: { id: "ETH", name: "Ether", spot: 2575, vol: 0.62, grid: 100, hue: "#9AA8FF" },
  BTC: { id: "BTC", name: "Bitcoin", spot: 68400, vol: 0.48, grid: 1000, hue: "#FFB45C" },
  SOL: { id: "SOL", name: "Solana", spot: 142, vol: 0.8, grid: 5, hue: "#7CF0C8" },
};

export const ASSET_LIST: Asset[] = [ASSETS.ETH, ASSETS.BTC, ASSETS.SOL];

/** Demo clock: fixed so every number in the prototype is reproducible. */
export const NOW = new Date("2026-11-06T12:00:00Z").getTime();

export interface Expiry {
  id: string; // YYYY-MM-DD
  label: string;
  sub: string;
}

export const EXPIRIES: Expiry[] = [
  { id: "2026-11-13", label: "Nov 13", sub: "1 week" },
  { id: "2026-11-27", label: "Nov 27", sub: "3 weeks" },
  { id: "2026-12-25", label: "Dec 25", sub: "7 weeks" },
  { id: "2027-03-26", label: "Mar 26", sub: "20 weeks" },
];

export const FEE = 0.03; // taker spread on the ask
export const BID_HAIRCUT = 0.03; // sell-back spread

export function expiryTime(id: string): number {
  return new Date(`${id}T08:00:00Z`).getTime();
}

export function expiryLabel(id: string): string {
  return EXPIRIES.find((e) => e.id === id)?.label ?? new Date(`${id}T08:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function yearsUntil(id: string, from = NOW): number {
  return Math.max((expiryTime(id) - from) / (365 * 24 * 3600 * 1000), 1 / (365 * 24));
}

// ── Normal CDF (Abramowitz & Stegun 7.1.26) ─────────────────────────────
export function normCdf(x: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989423 * Math.exp((-x * x) / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return x > 0 ? 1 - p : p;
}

function d2(S: number, K: number, vol: number, t: number) {
  return (Math.log(S / K) - (vol * vol * t) / 2) / (vol * Math.sqrt(t));
}

/** Black–Scholes call, r = 0. */
export function callPrice(S: number, K: number, vol: number, t: number): number {
  const sd = vol * Math.sqrt(t);
  const d1 = (Math.log(S / K) + (sd * sd) / 2) / sd;
  return S * normCdf(d1) - K * normCdf(d1 - sd);
}

/** P(S_T > X) under lognormal, r = 0. */
export function chanceAbove(S: number, X: number, vol: number, t: number): number {
  if (X <= 0) return 1;
  return normCdf(d2(S, X, vol, t));
}

/** Fair value of one UP unit of the K1–K2 spread. Bounded in [0, W]. */
export function fairUp(S: number, K1: number, K2: number, vol: number, t: number): number {
  const W = K2 - K1;
  const v = callPrice(S, K1, vol, t) - callPrice(S, K2, vol, t);
  return Math.min(Math.max(v, 0), W);
}

export function unitPayout(side: Side, S: number, K1: number, K2: number): number {
  const W = K2 - K1;
  const up = Math.min(Math.max(S - K1, 0), W);
  return side === "UP" ? up : W - up;
}

export function roundTo(x: number, step: number) {
  return Math.round(x / step) * step;
}

// ── Sentence → position ────────────────────────────────────────────────
export interface Draft {
  amount: number; // profit the user wants
  asset: AssetId;
  dir: Direction;
  target: number;
  expiry: string;
}

export interface Quote {
  ok: boolean;
  side: Side;
  K1: number;
  K2: number;
  W: number;
  fair: number; // per unit
  ask: number; // per unit
  units: number;
  cost: number; // = most you can lose
  maxPayout: number;
  profit: number;
  breakeven: number;
  chanceFull: number;
  chanceAny: number;
  multiple: number; // payout / cost
  nudge?: { tone: "info" | "warn"; text: string };
}

export function defaultDraft(asset: AssetId = "ETH"): Draft {
  const a = ASSETS[asset];
  return { amount: 500, asset, dir: "above", target: roundTo(a.spot * 1.16, a.grid), expiry: "2026-11-27" };
}

export function quote(d: Draft, spot?: number): Quote {
  const a = ASSETS[d.asset];
  const S = spot ?? a.spot;
  const t = yearsUntil(d.expiry);
  const atm = roundTo(S, a.grid);
  const side: Side = d.dir === "above" ? "UP" : "DOWN";

  let K1: number, K2: number;
  if (d.dir === "above") {
    K2 = d.target;
    K1 = Math.min(atm, d.target - a.grid);
  } else {
    K1 = d.target;
    K2 = Math.max(atm, d.target + a.grid);
  }
  const W = K2 - K1;
  const fu = fairUp(S, K1, K2, a.vol, t);
  const fairRaw = side === "UP" ? fu : W - fu;
  const fair = Math.max(fairRaw, W * 0.004);
  const ask = Math.min(fair * (1 + FEE), W * 0.985);
  const edge = W - ask;
  const units = d.amount / edge;
  const cost = units * ask;
  const maxPayout = units * W;
  const breakeven = side === "UP" ? K1 + ask : K2 - ask;
  const chanceFull = side === "UP" ? chanceAbove(S, K2, a.vol, t) : 1 - chanceAbove(S, K1, a.vol, t);
  const chanceAny = side === "UP" ? chanceAbove(S, breakeven, a.vol, t) : 1 - chanceAbove(S, breakeven, a.vol, t);

  let nudge: Quote["nudge"];
  let ok = true;
  const already = d.dir === "above" ? d.target <= S : d.target >= S;
  if (ask / W > 0.9) {
    ok = false;
    nudge = { tone: "warn", text: `${a.id} is already ${d.dir} that today, so you'd pay almost the full payout. Try a target further away.` };
  } else if (already) {
    nudge = { tone: "info", text: `${a.id} is already ${d.dir} $${fmtPlain(d.target)} today. Likely, so it's pricey for what it pays.` };
  } else if (chanceFull < 0.08) {
    nudge = { tone: "info", text: "Long shot. Cheap to try, but the market gives it under 1 in 12." };
  }

  return {
    ok,
    side,
    K1,
    K2,
    W,
    fair,
    ask,
    units,
    cost,
    maxPayout,
    profit: maxPayout - cost,
    breakeven,
    chanceFull,
    chanceAny,
    multiple: maxPayout / cost,
    nudge,
  };
}

function fmtPlain(n: number) {
  return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

// ── Draft <-> URL ──────────────────────────────────────────────────────
export function draftToQuery(d: Draft): string {
  const p = new URLSearchParams({
    amount: String(d.amount),
    asset: d.asset,
    dir: d.dir,
    target: String(d.target),
    date: d.expiry,
  });
  return p.toString();
}

export function draftFromQuery(q: URLSearchParams | null): Draft {
  const asset = (q?.get("asset")?.toUpperCase() as AssetId) || "ETH";
  const base = defaultDraft(ASSETS[asset] ? asset : "ETH");
  const amount = Number(q?.get("amount"));
  const target = Number(q?.get("target"));
  const dir = q?.get("dir") === "below" ? "below" : q?.get("dir") === "above" ? "above" : base.dir;
  const date = q?.get("date");
  return {
    asset: base.asset,
    amount: amount > 0 ? amount : base.amount,
    dir,
    target: target > 0 ? target : dir === "below" ? roundTo(ASSETS[base.asset].spot * 0.88, ASSETS[base.asset].grid) : base.target,
    expiry: date && EXPIRIES.some((e) => e.id === date) ? date : base.expiry,
  };
}
