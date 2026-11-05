"use client";

import { AssetId } from "@/lib/market";
import { useLiveSpot } from "@/lib/store";
import { LIVE } from "@/lib/chain/deployment";
import { useChainlinkSpot } from "@/lib/chain/live";

/** ETH spot for valuing stances: Chainlink when live, simulated in demo mode. */
export function useSpots(): Record<AssetId, number> {
  const demo = useLiveSpot("ETH");
  const chain = useChainlinkSpot();
  return { ETH: LIVE && chain ? chain : demo };
}
