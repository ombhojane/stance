"use client";

import { AssetId } from "@/lib/market";
import { useLiveSpot } from "@/lib/store";

export function useSpots(): Record<AssetId, number> {
  const ETH = useLiveSpot("ETH");
  return { ETH };
}
