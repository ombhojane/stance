"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAccount, useBalance } from "wagmi";
import { baseSepolia } from "wagmi/chains";
import { ArrowDownLeft, ArrowUpRight, Copy, ExternalLink } from "lucide-react";
import { useStore, type LedgerEntry } from "@/lib/store";
import { useLive } from "@/lib/mode";
import { useUsd } from "@/lib/chain/live";
import { DEPLOYMENT, EXPLORER } from "@/lib/chain/deployment";
import { usd } from "@/lib/format";
import { RollingNumber } from "@/components/RollingNumber";
import { UpiSheet } from "@/components/UpiSheet";
import { WalletPill } from "@/components/WalletPill";

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

const CONTRACTS: [string, string, string][] = [
  ["StanceMarket", "registry of every live range", DEPLOYMENT.market as string],
  ["SpreadAquaApp", "1inch Aqua app: prices + fills stances", DEPLOYMENT.app as string],
  ["1inch Aqua", "shared-liquidity core the vaults ship into", DEPLOYMENT.aqua as string],
  ["Test USD", "testnet dollars (faucet)", DEPLOYMENT.usd as string],
  ["Chainlink ETH/USD", "price feed used for pricing + settlement", DEPLOYMENT.feed as string],
  ["Uniswap TWAP guard", "second-opinion price check at settlement", DEPLOYMENT.guard as string],
  ["SettlementReceiver", "Chainlink CRE workflow lands settlements here", DEPLOYMENT.receiver as string],
];

const LEDGER_LABEL: Record<LedgerEntry["kind"], string> = {
  topup: "Added money · UPI",
  stance: "Took a stance",
  sold: "Sold back",
  collected: "Collected",
  house_in: "House deposit",
  house_out: "House withdrawal",
};

interface Row {
  key: string;
  at: number;
  label: string;
  amount: number;
  href?: string;
  hash?: string;
}

function ago(at: number) {
  const s = Math.max(1, Math.round((Date.now() - at) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return new Date(at).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function ProfilePage() {
  const live = useLive();
  const { balance, ledger, hydrated } = useStore();
  const { address, isConnected } = useAccount();
  const usdc = useUsd();
  const eth = useBalance({ address, chainId: baseSepolia.id, query: { enabled: live && !!address, refetchInterval: 15_000 } });
  const [upi, setUpi] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const activity = useQuery<{ rows: { hash: string; at: number; label: string; amount: number }[]; note?: string }>({
    queryKey: ["activity", address],
    queryFn: async () => (await fetch(`/api/activity?address=${address}`)).json(),
    enabled: live && !!address,
    refetchInterval: 20_000,
  });

  const copy = (v: string) => {
    navigator.clipboard?.writeText(v);
    setCopied(v);
    setTimeout(() => setCopied(null), 1200);
  };

  const rows: Row[] = live
    ? (activity.data?.rows ?? []).map((r) => ({ key: r.hash + r.label + r.amount, at: r.at, label: r.label, amount: r.amount, hash: r.hash, href: `${EXPLORER}/tx/${r.hash}` }))
    : (ledger ?? []).filter((e) => !e.live).map((e) => ({ key: e.id, at: e.at, label: LEDGER_LABEL[e.kind], amount: e.amount }));
  const inSum = rows.filter((r) => r.amount > 0).reduce((a, r) => a + r.amount, 0);
  const outSum = rows.filter((r) => r.amount < 0).reduce((a, r) => a - r.amount, 0);

  return (
    <div className="mx-auto max-w-[880px] pt-4 sm:pt-8">
      <h1 className="text-5xl font-semibold tracking-tight">
        Wallet<span className="serif font-normal text-mute">.</span>
      </h1>
      <p className="mt-2 text-mute">{live ? "Your real balances on Base Sepolia, and every movement with its transaction." : "Test money in this browser. Nothing on chain."}</p>

      {/* balances */}
      <div className="mt-8 rounded-[28px] bg-tile p-6 ring-1 ring-line sm:p-8">
        {live && !isConnected ? (
          <div className="flex flex-wrap items-center justify-between gap-4">
            <p className="text-mute">Connect a wallet to see your balances and activity.</p>
            <WalletPill />
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-start justify-between gap-6">
              <div>
                <p className="text-xs font-medium text-mute">{live ? "Test USD" : "Test balance"}</p>
                <p className="mt-1 text-5xl font-semibold tracking-tight">
                  {live ? usdc.balance === undefined ? "…" : <RollingNumber value={usdc.balance} format="usd" /> : hydrated ? <RollingNumber value={balance} format="usd" /> : "…"}
                </p>
                {live && (
                  <p className="tnum mt-2 font-mono text-sm text-mute">
                    {eth.data ? `${(Number(eth.data.value) / 1e18).toFixed(4)} ETH` : "… ETH"} <span className="text-faint">· for gas</span>
                  </p>
                )}
              </div>
              <button onClick={() => setUpi(true)} className="rounded-full bg-accent px-6 py-3 font-semibold text-on-accent active:scale-[0.98]">
                Add money · UPI
              </button>
            </div>
            {live && address && (
              <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-line pt-5 font-mono text-xs">
                <span className="text-faint">address</span>
                <button onClick={() => copy(address)} className="inline-flex items-center gap-1.5 rounded-full bg-tile-2 px-3 py-1.5 text-ink hover:bg-tile-3">
                  {copied === address ? "copied" : short(address)} <Copy size={12} />
                </button>
                <a href={`${EXPLORER}/address/${address}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-full bg-tile-2 px-3 py-1.5 text-ink hover:bg-tile-3">
                  basescan <ExternalLink size={12} />
                </a>
              </div>
            )}
          </>
        )}
      </div>

      {/* activity */}
      <section className="mt-10">
        <div className="flex items-end justify-between">
          <h2 className="text-2xl font-semibold tracking-tight">Activity</h2>
          {rows.length > 0 && (
            <p className="tnum font-mono text-xs text-mute">
              {inSum > 0 && <span className="text-up">+{usd(inSum)} in</span>}
              {inSum > 0 && outSum > 0 && " · "}
              {outSum > 0 && <span className="text-down">−{usd(outSum)} out</span>}
            </p>
          )}
        </div>
        <div className="mt-4 overflow-hidden rounded-[24px] bg-tile ring-1 ring-line">
          {live && activity.isLoading ? (
            <p className="p-6 text-sm text-mute">Reading Basescan…</p>
          ) : rows.length === 0 ? (
            <p className="p-6 text-sm text-mute">{live && !isConnected ? "Connect to see activity." : "Nothing yet. Add money or take a stance."}</p>
          ) : (
            rows.map((r, i) => (
              <div key={r.key} className={`flex items-center gap-4 px-5 py-4 ${i ? "border-t border-line" : ""}`}>
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${r.amount >= 0 ? "bg-up-deep text-up" : "bg-tile-2 text-mute"}`}>
                  {r.amount >= 0 ? <ArrowDownLeft size={16} /> : <ArrowUpRight size={16} />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{r.label}</p>
                  <p className="tnum font-mono text-[11px] text-faint">
                    {ago(r.at)}
                    {r.hash && (
                      <>
                        {" · "}
                        <a href={r.href} target="_blank" rel="noreferrer" className="text-mute underline-offset-2 hover:text-ink hover:underline">
                          {short(r.hash)} ↗
                        </a>
                      </>
                    )}
                  </p>
                </div>
                <p className={`tnum shrink-0 font-semibold ${r.amount >= 0 ? "text-up" : ""}`}>{usd(r.amount, { sign: true })}</p>
              </div>
            ))
          )}
        </div>
      </section>

      {/* contracts */}
      <section className="mt-10 pb-10">
        <h2 className="text-2xl font-semibold tracking-tight">Contracts</h2>
        <p className="mt-1 text-sm text-mute">Verified on Base Sepolia. Tap to open on Basescan.</p>
        <div className="mt-4 overflow-hidden rounded-[24px] bg-tile ring-1 ring-line">
          {CONTRACTS.map(([name, what, addr], i) => (
            <div key={name} className={`flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-4 ${i ? "border-t border-line" : ""}`}>
              <div className="min-w-[220px] flex-1">
                <p className="font-medium">{name}</p>
                <p className="text-xs text-mute">{what}</p>
              </div>
              <div className="flex items-center gap-2 font-mono text-xs">
                <button onClick={() => copy(addr)} className="inline-flex items-center gap-1.5 rounded-full bg-tile-2 px-3 py-1.5 hover:bg-tile-3">
                  {copied === addr ? "copied" : short(addr)} <Copy size={12} />
                </button>
                <a href={`${EXPLORER}/address/${addr}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-full bg-tile-2 px-3 py-1.5 hover:bg-tile-3">
                  <ExternalLink size={12} />
                </a>
              </div>
            </div>
          ))}
        </div>
      </section>

      <UpiSheet open={upi} onClose={() => setUpi(false)} />
    </div>
  );
}
