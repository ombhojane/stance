"use client";

import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useReducer, useState } from "react";

// Read saved stances before the browser paints, so pages never flash empty.
const useBeforePaint = typeof window !== "undefined" ? useLayoutEffect : useEffect;
import { ASSETS, AssetId, Direction, NOW, Side, quote, expiryTime, fairUp, yearsUntil, unitPayout, BID_HAIRCUT } from "./market";

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
  /** Set when the stance was placed onchain (Base Sepolia). */
  live?: {
    series: string;
    outcome: string;
    unitsRaw: string; // 18dp, exact
    txHash: string;
  };
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

/** Test-mode money movements, newest first (prod activity comes from Basescan). */
export interface LedgerEntry {
  id: string;
  at: number;
  kind: "topup" | "stance" | "sold" | "collected" | "house_in" | "house_out";
  amount: number; // signed USD
  live: boolean; // mirrors an onchain action (shown from Basescan in prod instead)
  ref?: string; // position or vault id
}

interface State {
  balance: number;
  positions: Position[];
  vaults: Vault[];
  ledger: LedgerEntry[];
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
  | { type: "fund"; amount: number }
  | { type: "reset" };

const KEY = "stance.v2";

function seed(): Omit<State, "hydrated"> {
  // an open DOWN stance bought a few days ago, and a settled UP one to collect
  const q = quote({ amount: 300, asset: "ETH", dir: "below", target: 2300, expiry: "2026-12-25" });
  return {
    balance: 10000,
    positions: [
      {
        id: "p-seed-down",
        createdAt: NOW - 3 * 86400000,
        asset: "ETH",
        dir: "below",
        side: "DOWN",
        target: 2300,
        amount: 300,
        expiry: "2026-12-25",
        K1: q.K1,
        K2: q.K2,
        units: q.units,
        cost: Math.round(q.cost * 0.72),
        chanceAtBuy: Math.max(0.05, q.chanceFull - 0.06),
        status: "open",
      },
      {
        id: "p-seed-up",
        createdAt: NOW - 18 * 86400000,
        asset: "ETH",
        dir: "above",
        side: "UP",
        target: 2450,
        amount: 400,
        expiry: "2026-10-30",
        K1: 2200,
        K2: 2450,
        units: 2.52,
        cost: 230,
        chanceAtBuy: 0.31,
        status: "settled",
        settlePrice: 2521.4,
      },
    ],
    vaults: [],
    ledger: [],
  };
}

function baseReducer(s: State, a: Action): State {
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
    case "fund":
      return { ...s, balance: s.balance + a.amount };
    case "reset": {
      // test-money reset: never drop the records of real onchain stances
      const fresh = seed();
      return { ...fresh, positions: [...s.positions.filter((p) => p.live), ...fresh.positions], hydrated: true };
    }
  }
}

interface Ctx extends State {
  dispatch: React.Dispatch<Action>;
  toast: (t: Omit<Toast, "id">) => void;
  dismiss: (id: string) => void;
}

function ledgerFor(s: State, a: Action): LedgerEntry | null {
  const at = Date.now();
  const id = `l-${at.toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const pos = (pid: string) => s.positions.find((p) => p.id === pid);
  switch (a.type) {
    case "fund":
      return { id, at, kind: "topup", amount: a.amount, live: false };
    case "buy":
      return { id, at, kind: "stance", amount: -a.position.cost, live: !!a.position.live, ref: a.position.id };
    case "sell":
      return { id, at, kind: "sold", amount: a.proceeds, live: !!pos(a.id)?.live, ref: a.id };
    case "redeem":
      return { id, at, kind: "collected", amount: a.proceeds, live: !!pos(a.id)?.live, ref: a.id };
    case "deposit":
      return { id, at, kind: "house_in", amount: -a.vault.deposit, live: false, ref: a.vault.id };
    case "withdraw":
      return { id, at, kind: "house_out", amount: a.amount, live: false, ref: a.id };
    default:
      return null;
  }
}

function reducer(s: State, a: Action): State {
  const next = baseReducer(s, a);
  const ledger = next.ledger ?? []; // older saved states predate the ledger
  const e = ledgerFor(s, a);
  return { ...next, ledger: e ? [e, ...ledger].slice(0, 200) : ledger };
}

const StoreCtx = createContext<Ctx | null>(null);
const ToastCtx = createContext<Toast[]>([]);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, { ...seed(), hydrated: false });
  const [toasts, setToasts] = useState<Toast[]>([]);

  useBeforePaint(() => {
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

  const value = useMemo(() => ({ ...state, dispatch, toast, dismiss }), [state, toast, dismiss]);
  return (
    <StoreCtx.Provider value={value}>
      <ToastCtx.Provider value={toasts}>{children}</ToastCtx.Provider>
    </StoreCtx.Provider>
  );
}

export function useToasts() {
  return useContext(ToastCtx);
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
      if (document.hidden) return;
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
