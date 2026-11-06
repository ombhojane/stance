"use client";

import { useMemo } from "react";
import { ASSETS, Draft, Quote, chanceAbove, quote as demoQuote, yearsUntil } from "@/lib/market";
import { useLive } from "../mode";
import { LiveRange, Strategy, pickRange, targetsFor, toUsd6, useChainlinkSpot, useRanges, useStrategyPrices } from "./live";

export interface StanceQuote extends Quote {
  live: boolean;
  spot: number;
  range?: LiveRange;
  strategy?: Strategy;
  outcome?: `0x${string}`;
  usdcIn?: bigint; // exact amount to pay, 6dp
  minUnits?: bigint; // slippage floor, 18dp
  targets: number[]; // targets a user can pick for this date + direction (live only)
  loading: boolean;
}

/**
 * One quote for the hero and the review page.
 * Live: snaps to a deployed range, prices with the onchain ask, odds from Chainlink spot.
 * Demo: the static model in market.ts.
 */
export function useStanceQuote(draft: Draft, demoSpot?: number): StanceQuote {
  const LIVE = useLive();
  const { ranges, isLoading } = useRanges();
  const chainSpot = useChainlinkSpot();
  const spot = LIVE && chainSpot ? chainSpot : demoSpot ?? ASSETS[draft.asset].spot;
  const range = LIVE && chainSpot ? pickRange(ranges, draft.expiry, draft.dir, draft.target, spot) : undefined;
  const strategy = range ? (draft.dir === "above" ? range.up : range.down) : undefined;
  const prices = useStrategyPrices(strategy);
  const targets = useMemo(() => (LIVE && chainSpot ? targetsFor(ranges, draft.expiry, draft.dir, spot) : []), [ranges, draft.expiry, draft.dir, spot, chainSpot]);

  return useMemo<StanceQuote>(() => {
    if (!LIVE) return { ...demoQuote(draft, spot), live: false, spot, targets: [], loading: false };
    const base = demoQuote(draft, spot);
    if (!range || !strategy || !prices) {
      return { ...base, ok: false, live: true, spot, range, strategy, targets, loading: isLoading || !prices, nudge: range ? undefined : { tone: "warn", text: "No range for that date yet." } };
    }
    const K1 = range.k1;
    const K2 = range.k2;
    const W = range.width;
    const ask = prices.ask;
    const edge = W - ask;
    const units = edge > 0 ? draft.amount / edge : 0;
    const cost = units * ask;
    const side = draft.dir === "above" ? "UP" : "DOWN";
    const t = yearsUntil(draft.expiry);
    const vol = ASSETS[draft.asset].vol;
    const breakeven = side === "UP" ? K1 + ask : K2 - ask;
    const chanceFull = side === "UP" ? chanceAbove(spot, K2, vol, t) : 1 - chanceAbove(spot, K1, vol, t);
    const chanceAny = side === "UP" ? chanceAbove(spot, breakeven, vol, t) : 1 - chanceAbove(spot, breakeven, vol, t);
    const usdcIn = toUsd6(cost);
    // accept up to 1% fewer units than quoted, in case the price moves before the block lands
    const minUnits = (BigInt(Math.floor(units * 0.99 * 1e9)) * 10n ** 9n);
    return {
      ok: edge > W * 0.02 && units > 0,
      side,
      K1,
      K2,
      W,
      fair: prices.fair,
      ask,
      units,
      cost,
      maxPayout: units * W,
      profit: units * W - cost,
      breakeven,
      chanceFull,
      chanceAny,
      multiple: (units * W) / cost,
      nudge: draft.target !== (side === "UP" ? K2 : K1) ? { tone: "info", text: `Closest live range: $${(side === "UP" ? K2 : K1).toLocaleString("en-US")}.` } : undefined,
      live: true,
      spot,
      range,
      strategy,
      outcome: side === "UP" ? range.upToken : range.downToken,
      usdcIn,
      minUnits,
      targets,
      loading: false,
    };
  }, [draft, spot, range, strategy, prices, targets, isLoading, LIVE]);
}

/** Snap a target to the nearest pickable one (live), or return it unchanged (demo). */
export function snapTarget(target: number, targets: number[]) {
  if (!targets.length) return target;
  return targets.reduce((b, x) => (Math.abs(x - target) < Math.abs(b - target) ? x : b));
}
