"use client";

import { useMemo } from "react";
import { useAccount, useReadContract, useReadContracts } from "wagmi";
import type { Address, Hex } from "viem";
import { DEPLOYMENT, LIVE } from "./deployment";
import { aggregatorV3Abi, spreadAquaAppAbi, spreadSeriesAbi, stanceMarketAbi, testUsdAbi, writerVaultAbi } from "./abis";
import type { Direction } from "@/lib/market";

export interface Strategy {
  maker: Address;
  series: Address;
  isUp: boolean;
  feeBps: number;
  skewBps: number;
  depth: bigint;
  salt: Hex;
}

export interface LiveRange {
  id: number;
  series: Address;
  vault: Address;
  k1: number; // USD
  k2: number;
  expiry: number; // unix seconds
  expiryId: string; // YYYY-MM-DD, matches EXPIRIES in market.ts
  width: number; // USD per unit
  up?: Strategy;
  down?: Strategy;
  upToken?: Address;
  downToken?: Address;
  settled: boolean;
  upPayout: number; // USD per UP unit once settled
}

const USD6 = 1e6;
const PX8 = 1e8;

export const expiryIdOf = (unix: number) => new Date(unix * 1000).toISOString().slice(0, 10);

/** Every deployed range plus its live Aqua strategies, in one multicall. */
export function useRanges() {
  const market = DEPLOYMENT.market as Address;
  const all = useReadContract({
    address: market,
    abi: stanceMarketAbi,
    functionName: "allRanges",
    query: { enabled: LIVE, staleTime: 60_000 },
  });
  const base = all.data ?? [];

  const details = useReadContracts({
    allowFailure: true,
    contracts: base.flatMap((r) => [
      { address: r.vault, abi: writerVaultAbi, functionName: "strategies" } as const,
      { address: r.series, abi: spreadSeriesAbi, functionName: "up" } as const,
      { address: r.series, abi: spreadSeriesAbi, functionName: "down" } as const,
      { address: r.series, abi: spreadSeriesAbi, functionName: "settled" } as const,
      { address: r.series, abi: spreadSeriesAbi, functionName: "upPayoutPerUnit" } as const,
    ]),
    query: { enabled: LIVE && base.length > 0, staleTime: 30_000 },
  });

  const ranges = useMemo<LiveRange[]>(() => {
    const d = details.data;
    return base.map((r, i) => {
      const at = <T,>(k: number) => (d?.[i * 5 + k]?.status === "success" ? (d[i * 5 + k].result as T) : undefined);
      const strategies = at<readonly [Strategy, Strategy]>(0);
      return {
        id: i,
        series: r.series,
        vault: r.vault,
        k1: Number(r.k1) / PX8,
        k2: Number(r.k2) / PX8,
        expiry: Number(r.expiry),
        expiryId: expiryIdOf(Number(r.expiry)),
        width: Number(r.k2 - r.k1) / PX8,
        up: strategies?.[0],
        down: strategies?.[1],
        upToken: at<Address>(1),
        downToken: at<Address>(2),
        settled: at<boolean>(3) ?? false,
        upPayout: Number(at<bigint>(4) ?? 0n) / USD6,
      };
    });
  }, [base, details.data]);

  return { ranges, isLoading: all.isLoading || details.isLoading, refetch: () => (all.refetch(), details.refetch()) };
}

/** Chainlink ETH/USD from the same feed the contracts price and settle with. */
export function useChainlinkSpot() {
  const q = useReadContract({
    address: DEPLOYMENT.feed,
    abi: aggregatorV3Abi,
    functionName: "latestRoundData",
    query: { enabled: LIVE, refetchInterval: 20_000 },
  });
  return q.data ? Number(q.data[1]) / PX8 : undefined;
}

/** Snap a user's target to the closest deployed range for that date and direction. */
export function pickRange(ranges: LiveRange[], expiryId: string, dir: Direction, target: number, spot: number) {
  const sameDate = ranges.filter((r) => r.expiryId === expiryId && !r.settled);
  // "goes up" ranges start at the money; "goes down" ranges end there
  const pool = dir === "above" ? sameDate.filter((r) => r.k2 > spot) : sameDate.filter((r) => r.k1 < spot);
  if (pool.length === 0) return undefined;
  const key = (r: LiveRange) => (dir === "above" ? r.k2 : r.k1);
  return pool.reduce((best, r) => (Math.abs(key(r) - target) < Math.abs(key(best) - target) ? r : best));
}

/** The targets a user can actually pick for a date + direction (for chips and flag snapping). */
export function targetsFor(ranges: LiveRange[], expiryId: string, dir: Direction, spot: number) {
  const r = ranges.filter((x) => x.expiryId === expiryId && !x.settled);
  const t = dir === "above" ? r.filter((x) => x.k2 > spot).map((x) => x.k2) : r.filter((x) => x.k1 < spot).map((x) => x.k1);
  return [...new Set(t)].sort((a, b) => a - b);
}

/** Onchain ask/bid/fair for a strategy, in USD per unit. */
export function useStrategyPrices(strategy?: Strategy) {
  const q = useReadContract({
    address: DEPLOYMENT.app as Address,
    abi: spreadAquaAppAbi,
    functionName: "prices",
    args: strategy ? [strategy] : undefined,
    query: { enabled: LIVE && !!strategy, refetchInterval: 20_000 },
  });
  return q.data ? { ask: Number(q.data[0]) / USD6, bid: Number(q.data[1]) / USD6, fair: Number(q.data[2]) / USD6, raw: q.data } : undefined;
}

/** Test-USD balance and allowance to the Aqua app for the connected wallet. */
export function useUsd() {
  const { address } = useAccount();
  const usd = DEPLOYMENT.usd as Address;
  const q = useReadContracts({
    contracts: address
      ? ([
          { address: usd, abi: testUsdAbi, functionName: "balanceOf", args: [address] },
          { address: usd, abi: testUsdAbi, functionName: "allowance", args: [address, DEPLOYMENT.app as Address] },
          { address: usd, abi: testUsdAbi, functionName: "lastDrip", args: [address] },
        ] as const)
      : [],
    query: { enabled: LIVE && !!address, refetchInterval: 15_000 },
  });
  const [bal, allowance, lastDrip] = q.data ?? [];
  return {
    balance: bal?.status === "success" ? Number(bal.result) / USD6 : undefined,
    allowanceRaw: allowance?.status === "success" ? (allowance.result as bigint) : 0n,
    nextDripAt: lastDrip?.status === "success" && lastDrip.result > 0n ? Number(lastDrip.result) + 3600 : 0,
    refetch: q.refetch,
  };
}

export const toUsd6 = (usd: number) => BigInt(Math.round(usd * USD6));
export const fromUsd6 = (x: bigint) => Number(x) / USD6;
