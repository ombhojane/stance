// The desk: live market context → one TEE-verified inference → a vol surface
// the UI can price odds with, carrying its receipt (request id + provider).
//
// Latency design: module-level cache, stale-while-revalidate. Readers get the
// cached read instantly; a background refresh keeps it ≤5 minutes old. The
// first request after a cold start is the only one that ever waits.
import { EXPIRIES, yearsUntil, ASSETS } from "@/lib/market";
import { gatherContext, MarketContext } from "./context";
import { backends, complete } from "./llm";
import { verifyTee } from "./verify";
import { RECORDED_0G_READ } from "./replay";

export interface DeskRead {
  headline: string; // one plain sentence for the UI
  read: string; // 2–3 sentence rationale
  bias: "up" | "down" | "neutral";
  confidence: number; // 0..1
  vols: Record<string, number>; // expiry id → annualized vol
  // receipt
  source: "0g" | "openai" | "static";
  model: string;
  requestId: string | null;
  provider: string | null;
  teeVerified: boolean | null;
  chatId: string | null;
  latencyMs: number;
  at: number;
  context: MarketContext | null;
  replay?: boolean; // a recorded read served without a new inference call
}

const TTL = 5 * 60_000;
const HISTORY_MAX = 12;

let cache: DeskRead | null = null;
let inflight: Promise<DeskRead> | null = null;
const history: { at: number; spot: number | null; vol1w: number | null }[] = [];

const SYSTEM = `You are the pricing desk of Stance, an ETH options venue. Your single job: estimate the annualized implied volatility to quote for each expiry, from the live context. Anchor on realized vol; widen for event risk, elevated funding, or fast recent moves; term structure should be smooth (short expiries react more). Keep every vol within [0.25, 1.60]. Lean only on the data given.
Write for a normal person, not a trader: never use jargon like "backwardation", "skew", "term structure", "realized", "implied", "IV", "basis". Say what it means instead ("ETH has been swinging about 2% a day", "next week looks a bit jumpier than spring").
Reply with STRICT JSON, no prose outside JSON:
{"headline": "<=80 chars, one plain sentence about how jumpy ETH looks, no hype",
 "read": "2 short plain sentences: what ETH has been doing, and what that means for the odds; use one or two concrete numbers",
 "bias": "up"|"down"|"neutral",
 "confidence": 0.0-1.0,
 "vols": ${JSON.stringify(Object.fromEntries(EXPIRIES.map((e) => [e.id, 0.5])))}}
In "vols" keep exactly those keys and replace each 0.5 with your annualized vol as a decimal (0.55 means 55%).`;

function userPrompt(ctx: MarketContext): string {
  const exp = EXPIRIES.map((e) => `${e.id} (${e.sub}, T=${yearsUntil(e.id, Date.now()).toFixed(3)}y)`).join(", ");
  const recent = history
    .slice(-4)
    .map((h) => `at=${new Date(h.at).toISOString().slice(0, 16)} vol1w=${h.vol1w?.toFixed(2) ?? "?"} spot=${h.spot?.toFixed(0) ?? "?"}`)
    .join("; ");
  return JSON.stringify({
    now: new Date(ctx.at).toISOString(),
    eth_spot_chainlink: ctx.spot,
    realized_vol_7d_annualized: ctx.realizedVol7d,
    realized_vol_30d_annualized: ctx.realizedVol30d,
    move_24h_pct: ctx.move24hPct,
    move_7d_pct: ctx.move7dPct,
    perp_funding_8h_pct: ctx.fundingRatePct,
    expiries: exp,
    your_recent_reads: recent || "none yet",
    long_run_default_vol: ASSETS.ETH.vol,
  });
}

function toVol(x: unknown): number {
  const n = typeof x === "string" ? parseFloat(x.replace("%", "")) : Number(x);
  if (!Number.isFinite(n)) return NaN;
  return n > 3 ? n / 100 : n; // "55" or "55%" means 0.55
}

function clampVols(raw: unknown): Record<string, number> | null {
  if (typeof raw !== "object" || raw === null) return null;
  const arr = Array.isArray(raw) ? raw : null;
  const obj = raw as Record<string, unknown>;
  const out: Record<string, number> = {};
  let prev: number | null = null;
  for (const [i, e] of EXPIRIES.entries()) {
    const v = toVol(arr ? arr[i] : obj[e.id] ?? obj[e.label] ?? obj[e.sub]);
    if (!Number.isFinite(v)) return null;
    let c = Math.min(1.6, Math.max(0.25, v));
    // smooth curve: neighbouring expiries may differ by at most 6 vol points
    if (prev !== null) c = Math.min(prev + 0.06, Math.max(prev - 0.06, c));
    out[e.id] = Math.round(c * 1000) / 1000;
    prev = c;
  }
  return out;
}

function staticRead(ctx: MarketContext | null): DeskRead {
  const vols = Object.fromEntries(EXPIRIES.map((e) => [e.id, ASSETS.ETH.vol]));
  return {
    headline: "Quoting long-run volatility — the desk is offline.",
    read: "No live inference available; odds use the historical constant.",
    bias: "neutral",
    confidence: 0,
    vols,
    source: "static",
    model: "none",
    requestId: null,
    provider: null,
    teeVerified: null,
    chatId: null,
    latencyMs: 0,
    at: Date.now(),
    context: ctx,
  };
}

async function compute(): Promise<DeskRead> {
  const ctx = await gatherContext();
  for (const b of backends()) {
    try {
      const r = await Promise.race([
        complete(SYSTEM, userPrompt(ctx), b),
        new Promise<never>((_, rej) => setTimeout(() => rej(new Error("deadline")), 30_000)),
      ]);
      const parsed = JSON.parse(r.text);
      const vols = clampVols(parsed.vols);
      if (!vols) throw new Error(`bad vols: ${JSON.stringify(parsed.vols)?.slice(0, 160)}`);
      const read: DeskRead = {
        headline: String(parsed.headline ?? "").slice(0, 120) || "Desk read",
        read: String(parsed.read ?? "").slice(0, 400),
        bias: parsed.bias === "up" || parsed.bias === "down" ? parsed.bias : "neutral",
        confidence: Math.min(1, Math.max(0, Number(parsed.confidence) || 0)),
        vols,
        source: r.source,
        model: r.model,
        requestId: r.requestId,
        provider: r.provider,
        teeVerified: r.teeVerified,
        chatId: r.chatId,
        latencyMs: r.latencyMs,
        at: Date.now(),
        context: ctx,
      };
      if (read.source === "0g" && read.provider && read.chatId && read.teeVerified === null) {
        verifyTee(read.provider, read.chatId).then((ok) => {
          if (ok !== null) read.teeVerified = ok;
        });
      }
      history.push({ at: read.at, spot: ctx.spot, vol1w: vols[EXPIRIES[0].id] ?? null });
      if (history.length > HISTORY_MAX) history.shift();
      return read;
    } catch (e) {
      console.warn(`desk: ${b} failed:`, e instanceof Error ? e.message : e);
    }
  }
  return staticRead(ctx);
}

/** Cached read; kicks off a background refresh when stale. */
export async function getDeskRead(force = false): Promise<DeskRead> {
  // replay: serve a real recorded 0G read, no inference, no cost (see replay.ts)
  if (process.env.DESK_BACKEND === "replay") return RECORDED_0G_READ;
  const fresh = cache && Date.now() - cache.at < TTL;
  if (cache && fresh && !force) return cache;
  if (!inflight) {
    inflight = compute()
      .then((r) => (cache = r))
      .finally(() => (inflight = null));
  }
  // stale-while-revalidate: serve the old read rather than block
  if (cache && !force) return cache;
  return inflight;
}
