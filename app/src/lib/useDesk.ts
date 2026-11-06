"use client";

import { useQuery } from "@tanstack/react-query";
import { chanceAbove, Draft, yearsUntil } from "@/lib/market";
import type { DeskRead } from "@/lib/desk/desk";

export type DeskClientRead = Omit<DeskRead, "context"> & { spot: number | null };

/** The desk read, shared app-wide; refreshes quietly in the background. */
export function useDesk() {
  const q = useQuery<DeskClientRead>({
    queryKey: ["desk"],
    queryFn: async () => {
      const r = await fetch("/api/desk");
      if (!r.ok) throw new Error(`desk ${r.status}`);
      return r.json();
    },
    staleTime: 60_000,
    refetchInterval: 120_000,
    retry: 1,
  });
  return q.data;
}

/** Chance of the full payout under the desk's vol instead of the constant. */
export function deskChance(desk: DeskClientRead | undefined, draft: Draft, spot: number, K1: number, K2: number): number | null {
  const vol = desk?.vols?.[draft.expiry];
  if (!vol || desk?.source === "static" || !spot) return null;
  const t = yearsUntil(draft.expiry);
  return draft.dir === "above" ? chanceAbove(spot, K2, vol, t) : 1 - chanceAbove(spot, K1, vol, t);
}
