"use client";

import { useEffect, useRef, useState } from "react";
import { useAccount, useConnect, useConnectors, useDisconnect } from "wagmi";
import { useLive } from "@/lib/mode";
import { useUsd } from "@/lib/chain/live";
import { useStanceTx } from "@/lib/chain/tx";
import { useStore } from "@/lib/store";
import { RollingNumber } from "./RollingNumber";
import { UpiSheet } from "./UpiSheet";
import { usePrivyBridge } from "@/lib/chain/privy";

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

/** Demo mode: the simulated wallet. Live mode: connect, test-USD balance, faucet. */
export function WalletPill() {
  const LIVE = useLive();
  if (!LIVE) return <DemoPill />;
  return <LivePill />;
}

function DemoPill() {
  const { balance, hydrated, dispatch } = useStore();
  const [open, setOpen] = useState(false);
  const [upi, setUpi] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (e: PointerEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, []);
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen((o) => !o)} className="tnum rounded-full bg-tile px-4 py-2 text-sm font-semibold ring-1 ring-line">
        {hydrated ? <RollingNumber value={balance} format="usd0" /> : "…"}
      </button>
      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-52 rounded-2xl bg-tile p-1.5 text-sm shadow-[0_20px_50px_-20px_rgba(0,0,0,.5)] ring-1 ring-line">
          <p className="px-3 py-2 text-xs text-mute">Test money. Nothing on chain.</p>
          <button
            onClick={() => {
              setUpi(true);
              setOpen(false);
            }}
            className="w-full rounded-xl px-3 py-2 text-left font-medium hover:bg-tile-2"
          >
            Add money · UPI
          </button>
          <button
            onClick={() => {
              dispatch({ type: "reset" });
              setOpen(false);
            }}
            className="w-full rounded-xl px-3 py-2 text-left font-medium hover:bg-tile-2"
          >
            Reset to $10,000
          </button>
        </div>
      )}
      <UpiSheet open={upi} onClose={() => setUpi(false)} />
    </div>
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
  const [upi, setUpi] = useState(false);
  const [copied, setCopied] = useState(false);
  const privy = usePrivyBridge();
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    const close = (e: PointerEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, []);

  if (!mounted || (privy && !privy.ready)) return <span className="h-9 w-24 rounded-full bg-tile ring-1 ring-line" />;

  // Privy: one button for Google, email, Apple, X or an existing wallet
  if (privy && !privy.authenticated) {
    return (
      <button onClick={privy.login} className="rounded-full bg-accent px-4 py-2 text-sm font-semibold text-on-accent transition active:scale-95">
        Sign in
      </button>
    );
  }
  if (privy && privy.authenticated && !isConnected) {
    return <span className="rounded-full bg-tile px-4 py-2 text-sm text-mute ring-1 ring-line">Setting up wallet…</span>;
  }

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
        <div className="absolute right-0 top-11 z-50 w-64 overflow-hidden rounded-2xl bg-tile p-1 shadow-xl ring-1 ring-line">
          <button
            onClick={() => {
              navigator.clipboard?.writeText(address!);
              setCopied(true);
              setTimeout(() => setCopied(false), 1200);
            }}
            className="block w-full rounded-xl px-3 py-2.5 text-left transition hover:bg-tile-2"
          >
            <span className="block truncate text-sm font-medium">{privy?.label ?? "Your wallet"}</span>
            <span className="font-mono text-[11px] text-mute">{copied ? "copied" : short(address!)}{privy?.embedded ? " · gas covered" : ""}</span>
          </button>
          <div className="my-1 h-px bg-line" />
          <MenuItem onClick={() => (setUpi(true), setOpen(false))}>Add money · UPI</MenuItem>
          <MenuItem onClick={() => (setOpen(false), (window.location.href = "/profile"))}>Wallet &amp; activity</MenuItem>
          <MenuItem
            disabled={!canDrip || tx.busy}
            onClick={async () => {
              if (await tx.faucet()) refetch();
            }}
          >
            {tx.busy ? "Sending test USD…" : canDrip ? "Get 10,000 test USD" : `Faucet again ${new Date(nextDripAt * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`}
          </MenuItem>
          <MenuItem
            onClick={async () => {
              setOpen(false);
              if (privy) await privy.logout();
              disconnect();
            }}
          >
            {privy ? "Sign out" : "Disconnect"}
          </MenuItem>
          {tx.error && <p className="px-3 py-2 text-xs text-down">{tx.error}</p>}
        </div>
      )}
      <UpiSheet open={upi} onClose={() => setUpi(false)} />
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
