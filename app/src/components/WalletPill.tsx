"use client";

import { useEffect, useRef, useState } from "react";
import { useAccount, useChainId, useConnect, useConnectors, useDisconnect, useSwitchChain } from "wagmi";
import { baseSepolia } from "wagmi/chains";
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
  const [hint, setHint] = useState<string | null>(null);
  const [waiting, setWaiting] = useState(false); // MetaMask has our request open (error -32002)
  const privy = usePrivyBridge();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();
  useEffect(() => setMounted(true), []);

  // once connected: clear any hint, and put the wallet on Base Sepolia straight away
  useEffect(() => {
    if (!isConnected) return;
    setHint(null);
    setWaiting(false);
    if (chainId !== baseSepolia.id) switchChain({ chainId: baseSepolia.id });
  }, [isConnected, chainId, switchChain]);

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
      setOpen(false);
      if (isPending || waiting) return; // a request is already open in the wallet; don't stack another
      // prefer MetaMask's own EIP-6963 connector: window.ethereum may belong to another extension
      const c =
        id === "injected"
          ? connectors.find((x) => x.id === "io.metamask") ?? connectors.find((x) => x.id === "injected")
          : connectors.find((x) => x.id === id || x.type === id);
      if (!c) {
        setHint("No browser wallet found. Install MetaMask, then reload.");
        return;
      }
      setHint(null);
      connect(
        { connector: c, chainId: baseSepolia.id },
        {
          onError: (e) => {
            const code = (e as { code?: number; cause?: { code?: number } }).code ?? (e as { cause?: { code?: number } }).cause?.code;
            const msg = e.message ?? "";
            if (code === -32002 || /already pending/i.test(msg)) {
              setWaiting(true);
              setHint("MetaMask already has a request open. Click the MetaMask icon in your browser toolbar to approve it.");
            } else if (code === 4001 || /reject|denied/i.test(msg)) setHint("You cancelled in MetaMask.");
            else if (/provider not found/i.test(msg)) setHint("No browser wallet found. Install MetaMask, then reload.");
            else setHint(msg.split("\n")[0].slice(0, 140));
          },
        },
      );
    };
    const hasWc = connectors.some((c) => c.type === "walletConnect");
    return (
      <div ref={ref} className="relative">
        <button
          onClick={() => (hasWc ? setOpen((o) => !o) : pick("injected"))}
          disabled={isPending}
          className="rounded-full bg-accent px-4 py-2 text-sm font-semibold text-on-accent transition active:scale-95 disabled:opacity-50"
        >
          {isPending ? "Check MetaMask…" : waiting ? "Approve in MetaMask" : "Connect"}
        </button>
        {open && (
          <div className="absolute right-0 top-11 z-50 w-56 overflow-hidden rounded-2xl bg-tile p-1 shadow-xl ring-1 ring-line">
            <MenuItem onClick={() => pick("injected")}>Browser wallet</MenuItem>
            <MenuItem onClick={() => pick("walletConnect")}>Phone wallet (WalletConnect)</MenuItem>
          </div>
        )}
        {hint && (
          <div className="absolute right-0 top-11 z-50 w-72 rounded-2xl bg-tile p-3.5 text-sm shadow-xl ring-1 ring-line">
            <p className="leading-snug">{hint}</p>
            <button
              onClick={() => {
                setHint(null);
                setWaiting(false);
              }}
              className="mt-2 text-xs font-medium text-mute hover:text-ink"
            >
              Dismiss
            </button>
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
