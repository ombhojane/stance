"use client";

import { AssetId } from "@/lib/market";
import { useLiveSpot } from "@/lib/store";
import { useLive } from "@/lib/mode";
import { useChainlinkSpot } from "@/lib/chain/live";

/** ETH spot for valuing stances: Chainlink when live, simulated in demo mode. */
export function useSpots(): Record<AssetId, number> {
  const LIVE = useLive();
  const demo = useLiveSpot("ETH");
  const chain = useChainlinkSpot();
  return { ETH: LIVE && chain ? chain : demo };
}
