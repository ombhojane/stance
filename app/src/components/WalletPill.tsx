"use client";

import { useEffect, useRef, useState } from "react";
import { useAccount, useConnect, useConnectors, useDisconnect } from "wagmi";
import { LIVE } from "@/lib/chain/deployment";
import { useUsd } from "@/lib/chain/live";
import { useStanceTx } from "@/lib/chain/tx";
import { useStore } from "@/lib/store";
import { RollingNumber } from "./RollingNumber";

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

/** Demo mode: the simulated wallet. Live mode: connect, test-USD balance, faucet. */
export function WalletPill() {
  if (!LIVE) return <DemoPill />;
  return <LivePill />;
}

function DemoPill() {
  const { balance, hydrated } = useStore();
  return (
    <span className="tnum rounded-full bg-tile px-4 py-2 text-sm font-semibold ring-1 ring-line">
      {hydrated ? <RollingNumber value={balance} format="usd0" /> : "…"}
    </span>
  );
}

function LivePill() {
  const { address, isConnected } = useAccount();
  const connectors = useConnectors();
  const { mutate: connect, isPending } = useConnect();
  const { mutate: disconnect } = useDisconnect();
  const { balance, nextDripAt, refetch } = useUsd();
  const tx = useStanceTx();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    const close = (e: PointerEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, []);

  if (!mounted) return <span className="h-9 w-24 rounded-full bg-tile ring-1 ring-line" />;

  if (!isConnected) {
    const pick = (id: string) => {
      const c = connectors.find((x) => x.id === id || x.type === id);
      if (c) connect({ connector: c });
      setOpen(false);
    };
    const hasWc = connectors.some((c) => c.type === "walletConnect");
    return (
      <div ref={ref} className="relative">
        <button
          onClick={() => (hasWc ? setOpen((o) => !o) : pick("injected"))}
          disabled={isPending}
          className="rounded-full bg-accent px-4 py-2 text-sm font-semibold text-on-accent transition active:scale-95 disabled:opacity-50"
        >
          {isPending ? "Connecting…" : "Connect"}
        </button>
        {open && (
          <div className="absolute right-0 top-11 z-50 w-56 overflow-hidden rounded-2xl bg-tile p-1 shadow-xl ring-1 ring-line">
            <MenuItem onClick={() => pick("injected")}>Browser wallet</MenuItem>
            <MenuItem onClick={() => pick("walletConnect")}>Phone wallet (WalletConnect)</MenuItem>
          </div>
        )}
      </div>
    );
  }

  const canDrip = !nextDripAt || Date.now() / 1000 >= nextDripAt;
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen((o) => !o)} className="tnum flex items-center gap-2 rounded-full bg-tile px-4 py-2 text-sm font-semibold ring-1 ring-line">
        {balance === undefined ? "…" : <RollingNumber value={balance} format="usd0" />}
        <span className="font-mono text-[11px] font-normal text-mute">{short(address!)}</span>
      </button>
      {open && (
        <div className="absolute right-0 top-11 z-50 w-60 overflow-hidden rounded-2xl bg-tile p-1 shadow-xl ring-1 ring-line">
          <MenuItem
            disabled={!canDrip || tx.busy}
            onClick={async () => {
              if (await tx.faucet()) refetch();
            }}
          >
            {tx.busy ? "Sending test USD…" : canDrip ? "Get 10,000 test USD" : `Faucet again ${new Date(nextDripAt * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`}
          </MenuItem>
          <MenuItem onClick={() => (disconnect(), setOpen(false))}>Disconnect</MenuItem>
          {tx.error && <p className="px-3 py-2 text-xs text-down">{tx.error}</p>}
        </div>
      )}
    </div>
  );
}

function MenuItem({ children, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button className="block w-full rounded-xl px-3 py-2.5 text-left text-sm transition hover:bg-tile-2 disabled:opacity-40" {...rest}>
      {children}
    </button>
  );
}
