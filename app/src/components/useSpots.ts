"use client";

import { AssetId } from "@/lib/market";
import { useLiveSpot } from "@/lib/store";

export function useSpots(): Record<AssetId, number> {
  const ETH = useLiveSpot("ETH");
  const BTC = useLiveSpot("BTC");
  const SOL = useLiveSpot("SOL");
  return { ETH, BTC, SOL };
}
