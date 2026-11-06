// Server-only: live market context for the desk. Every source has a hard
// timeout and the bundle degrades gracefully — a missing source becomes a
// null the prompt knows how to ignore.
import { createPublicClient, http } from "viem";
import { baseSepolia } from "viem/chains";
import { DEPLOYMENT } from "@/lib/chain/deployment";
import { aggregatorV3Abi } from "@/lib/chain/abis";

export interface MarketContext {
  spot: number | null; // Chainlink ETH/USD
  realizedVol7d: number | null; // annualized, from hourly closes
  realizedVol30d: number | null; // annualized, from daily closes
  move24hPct: number | null;
  move7dPct: number | null;
  fundingRatePct: number | null; // 8h funding, percent
  at: number;
}

const rpc = createPublicClient({
  chain: baseSepolia,
  transport: http(process.env.NEXT_PUBLIC_RPC_URL || "https://sepolia.base.org", { timeout: 4_000 }),
});

async function timed<T>(p: Promise<T>, ms: number): Promise<T | null> {
  try {
    return await Promise.race([p, new Promise<never>((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))]);
  } catch {
    return null;
  }
}

async function chainlinkSpot(): Promise<number> {
  const [, answer] = await rpc.readContract({ address: DEPLOYMENT.feed, abi: aggregatorV3Abi, functionName: "latestRoundData" });
  return Number(answer) / 1e8;
}

/** Annualized vol from log returns; `perYear` = observations per year. */
function realized(closes: number[], perYear: number): number | null {
  if (closes.length < 20) return null;
  const rets: number[] = [];
  for (let i = 1; i < closes.length; i++) rets.push(Math.log(closes[i] / closes[i - 1]));
  const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
  const varr = rets.reduce((a, b) => a + (b - mean) ** 2, 0) / (rets.length - 1);
  return Math.sqrt(varr * perYear);
}

async function binanceKlines(interval: string, limit: number): Promise<number[]> {
  const r = await fetch(`https://api.binance.com/api/v3/klines?symbol=ETHUSDT&interval=${interval}&limit=${limit}`, { cache: "no-store" });
  if (!r.ok) throw new Error(`klines ${r.status}`);
  const rows = (await r.json()) as unknown[][];
  return rows.map((k) => Number(k[4])); // close
}

async function binanceFunding(): Promise<number> {
  const r = await fetch("https://fapi.binance.com/fapi/v1/premiumIndex?symbol=ETHUSDT", { cache: "no-store" });
  if (!r.ok) throw new Error(`funding ${r.status}`);
  const j = (await r.json()) as { lastFundingRate: string };
  return Number(j.lastFundingRate) * 100;
}

export async function gatherContext(): Promise<MarketContext> {
  const [spot, hourly, daily, funding] = await Promise.all([
    timed(chainlinkSpot(), 4_000),
    timed(binanceKlines("1h", 169), 3_500),
    timed(binanceKlines("1d", 31), 3_500),
    timed(binanceFunding(), 3_000),
  ]);
  const move = (closes: number[] | null, n: number) =>
    closes && closes.length > n ? ((closes[closes.length - 1] - closes[closes.length - 1 - n]) / closes[closes.length - 1 - n]) * 100 : null;
  return {
    spot,
    realizedVol7d: hourly ? realized(hourly.slice(-169), 24 * 365) : null,
    realizedVol30d: daily ? realized(daily, 365) : null,
    move24hPct: move(hourly, 24),
    move7dPct: move(hourly, 168),
    fundingRatePct: funding,
    at: Date.now(),
  };
}
