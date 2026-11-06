"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { DEPLOYED } from "./chain/deployment";

/**
 * prod: the live Base Sepolia deployment (wallet, Test USD faucet, real txs).
 * test: the in-browser simulation (10,000 play dollars, instant trades, every screen).
 * Server render is always prod so hydration matches; the saved choice applies after mount.
 * `?mode=test` in any URL switches too, so a demo link can be shared.
 */
export type Mode = "prod" | "test";

const KEY = "stance.mode";
const Ctx = createContext<{ mode: Mode; setMode: (m: Mode) => void }>({ mode: "prod", setMode: () => {} });

export function ModeProvider({ children }: { children: React.ReactNode }) {
  const [mode, set] = useState<Mode>("prod");

  useEffect(() => {
    let next: Mode | null = null;
    try {
      const q = new URLSearchParams(window.location.search).get("mode");
      if (q === "test" || q === "prod") next = q;
      else {
        const saved = localStorage.getItem(KEY);
        if (saved === "test" || saved === "prod") next = saved;
      }
      if (next) localStorage.setItem(KEY, next);
    } catch {}
    if (next) set(next);
  }, []);

  const setMode = useCallback((m: Mode) => {
    set(m);
    try {
      localStorage.setItem(KEY, m);
    } catch {}
  }, []);

  return <Ctx.Provider value={{ mode, setMode }}>{children}</Ctx.Provider>;
}

export const useMode = () => useContext(Ctx);

/** True when the app should talk to the chain: contracts deployed and the user is in prod. */
export function useLive() {
  const { mode } = useContext(Ctx);
  return DEPLOYED && mode === "prod";
}
