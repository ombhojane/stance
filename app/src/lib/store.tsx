"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useState } from "react";
import { ASSETS, AssetId, Direction, NOW, Side, expiryTime, fairUp, yearsUntil, unitPayout, BID_HAIRCUT } from "./market";

export type PositionStatus = "open" | "sold" | "settled" | "redeemed";

export interface Position {
  id: string;
  createdAt: number;
  asset: AssetId;
  dir: Direction;
  side: Side;
  target: number;
  amount: number;
  expiry: string;
  K1: number;
  K2: number;
  units: number;
  cost: number;
  chanceAtBuy: number;
  status: PositionStatus;
  settlePrice?: number;
  proceeds?: number;
}

export interface Vault {
  id: string;
  asset: AssetId;
  K1: number;
  K2: number;
  expiry: string;
  deposit: number;
  createdAt: number;
}

export interface Toast {
  id: string;
  title: string;
  body?: string;
  tone?: "up" | "down" | "odds";
}

interface State {
  balance: number;
  positions: Position[];
  vaults: Vault[];
  hydrated: boolean;
}

type Action =
  | { type: "hydrate"; state: Omit<State, "hydrated"> }
  | { type: "buy"; position: Position }
  | { type: "sell"; id: string; proceeds: number }
  | { type: "settle"; id: string; price: number }
  | { type: "redeem"; id: string; proceeds: number }
  | { type: "deposit"; vault: Vault }
  | { type: "withdraw"; id: string; amount: number }
  | { type: "reset" };

const KEY = "stance.v1";

function seed(): Omit<State, "hydrated"> {
  return {
    balance: 10000,
    positions: [
      {
        id: "p-seed-sol",
        createdAt: NOW - 3 * 86400000,
        asset: "SOL",
        dir: "below",
        side: "DOWN",
        target: 130,
        amount: 300,
        expiry: "2026-12-25",
        K1: 130,
        K2: 140,
        units: 41.2,
        cost: 112,
        chanceAtBuy: 0.36,
        status: "open",
      },
      {
        id: "p-seed-btc",
        createdAt: NOW - 18 * 86400000,
        asset: "BTC",
        dir: "above",
        side: "UP",
        target: 66000,
        amount: 400,
        expiry: "2026-10-30",
        K1: 63000,
        K2: 66000,
        units: 0.21,
        cost: 230,
        chanceAtBuy: 0.31,
        status: "settled",
        settlePrice: 67180,
      },
    ],
    vaults: [],
  };
}

function reducer(s: State, a: Action): State {
  switch (a.type) {
    case "hydrate":
      return { ...a.state, hydrated: true };
    case "buy":
      return { ...s, balance: s.balance - a.position.cost, positions: [a.position, ...s.positions] };
    case "sell":
      return {
        ...s,
        balance: s.balance + a.proceeds,
        positions: s.positions.map((p) => (p.id === a.id ? { ...p, status: "sold", proceeds: a.proceeds } : p)),
      };
    case "settle":
      return {
        ...s,
        positions: s.positions.map((p) => (p.id === a.id ? { ...p, status: "settled", settlePrice: a.price } : p)),
      };
    case "redeem":
      return {
        ...s,
        balance: s.balance + a.proceeds,
        positions: s.positions.map((p) => (p.id === a.id ? { ...p, status: "redeemed", proceeds: a.proceeds } : p)),
      };
    case "deposit":
      return { ...s, balance: s.balance - a.vault.deposit, vaults: [a.vault, ...s.vaults] };
    case "withdraw":
      return { ...s, balance: s.balance + a.amount, vaults: s.vaults.filter((v) => v.id !== a.id) };
    case "reset":
      return { ...seed(), hydrated: true };
  }
}

interface Ctx extends State {
  dispatch: React.Dispatch<Action>;
  toasts: Toast[];
  toast: (t: Omit<Toast, "id">) => void;
  dismiss: (id: string) => void;
}

const StoreCtx = createContext<Ctx | null>(null);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, { ...seed(), hydrated: false });
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      dispatch({ type: "hydrate", state: raw ? JSON.parse(raw) : seed() });
    } catch {
      dispatch({ type: "hydrate", state: seed() });
    }
  }, []);

  useEffect(() => {
    if (!state.hydrated) return;
    try {
      const { hydrated: _h, ...rest } = state;
      localStorage.setItem(KEY, JSON.stringify(rest));
    } catch {
      /* storage unavailable: fine for a demo */
    }
  }, [state]);

  const dismiss = useCallback((id: string) => setToasts((ts) => ts.filter((t) => t.id !== id)), []);
  const toast = useCallback(
    (t: Omit<Toast, "id">) => {
      const id = Math.random().toString(36).slice(2);
      setToasts((ts) => [...ts.slice(-2), { ...t, id }]);
      setTimeout(() => dismiss(id), 4200);
    },
    [dismiss],
  );

  const value = useMemo(() => ({ ...state, dispatch, toasts, toast, dismiss }), [state, toasts, toast, dismiss]);
  return <StoreCtx.Provider value={value}>{children}</StoreCtx.Provider>;
}

export function useStore() {
  const c = useContext(StoreCtx);
  if (!c) throw new Error("useStore outside provider");
  return c;
}

// ── Live (simulated) spot ──────────────────────────────────────────────
// A gentle seeded random walk so the UI feels alive while staying static.
export function useLiveSpot(asset: AssetId, intervalMs = 2200): number {
  const base = ASSETS[asset].spot;
  const [spot, setSpot] = useState(base);
  useEffect(() => {
    setSpot(base);
    let x = base;
    const id = setInterval(() => {
      const drift = (base - x) * 0.08;
      const shock = (Math.random() - 0.5) * base * 0.0016;
      x = x + drift + shock;
      setSpot(x);
    }, intervalMs);
    return () => clearInterval(id);
  }, [asset, base, intervalMs]);
  return spot;
}

// ── Position valuation ─────────────────────────────────────────────────
export function markValue(p: Position, spot: number): number {
  if (p.status === "settled") return unitPayout(p.side, p.settlePrice ?? spot, p.K1, p.K2) * p.units;
  if (p.status === "sold" || p.status === "redeemed") return p.proceeds ?? 0;
  const a = ASSETS[p.asset];
  const t = yearsUntil(p.expiry);
  const fu = fairUp(spot, p.K1, p.K2, a.vol, t);
  const fair = p.side === "UP" ? fu : p.K2 - p.K1 - fu;
  return fair * p.units;
}

export function sellBackValue(p: Position, spot: number): number {
  return markValue(p, spot) * (1 - BID_HAIRCUT);
}

export function isExpired(p: Position): boolean {
  return expiryTime(p.expiry) <= NOW;
}
