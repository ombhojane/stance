"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Everything a user can reach, including pages only reached by router.push
// (review, confirmation) that <Link> viewport-prefetching never sees.
const ROUTES = ["/make", "/make/review", "/make/done", "/positions", "/positions/p-seed-down", "/house", "/signals", "/profile", "/"];

const idle = (fn: () => void) => {
  if (typeof window.requestIdleCallback === "function") window.requestIdleCallback(fn, { timeout: 2000 });
  else setTimeout(fn, 300); // Safari
};

/**
 * After first paint, quietly load every route so later navigation is instant.
 * Production: router.prefetch pulls each route's payload + JS into the client cache.
 * Development: fetching each page once makes the dev server compile it now,
 * instead of when you click (dev compiles routes lazily on first visit).
 */
export function PrefetchRoutes() {
  const router = useRouter();
  useEffect(() => {
    let cancelled = false;
    idle(async () => {
      fetch("/api/desk").catch(() => {}); // warm the desk read so odds receipts are instant
      for (const r of ROUTES) {
        if (cancelled) return;
        if (process.env.NODE_ENV === "production") router.prefetch(r);
        else await fetch(r, { headers: { "x-warmup": "1" } }).catch(() => {});
      }
    });
    return () => {
      cancelled = true;
    };
  }, [router]);
  return null;
}
