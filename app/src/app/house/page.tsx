"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Layers, Scale, Wallet } from "lucide-react";
import { useStore } from "@/lib/store";
import { ASSETS, ASSET_LIST, AssetId, EXPIRIES, FEE, expiryLabel, fairUp, roundTo, yearsUntil } from "@/lib/market";
import { pct, price, usd } from "@/lib/format";
import { AssetDot, Button, Chip, Segmented, SlideToConfirm, Stepper, Tile } from "@/components/controls";
import { RollingNumber } from "@/components/RollingNumber";

interface Series {
  K1: number;
  K2: number;
  demand: number; // simulated weekly volume as share of TVL
}

function seriesFor(asset: AssetId): Series[] {
  const a = ASSETS[asset];
  const atm = roundTo(a.spot, a.grid);
  return [
    { K1: atm, K2: roundTo(a.spot * 1.08, a.grid), demand: 0.62 },
    { K1: atm, K2: roundTo(a.spot * 1.16, a.grid), demand: 0.48 },
    { K1: roundTo(a.spot * 0.88, a.grid), K2: atm, demand: 0.35 },
    { K1: roundTo(a.spot * 0.8, a.grid), K2: roundTo(a.spot * 1.25, a.grid), demand: 0.22 },
  ];
}

export default function HousePage() {
  const { balance, vaults, dispatch, toast, hydrated } = useStore();
  const [asset, setAsset] = useState<AssetId>("ETH");
  const [expiry, setExpiry] = useState("2026-11-27");
  const [si, setSi] = useState(1);
  const [deposit, setDeposit] = useState(2000);
  const [flow, setFlow] = useState(35); // % of UP inventory bought by takers (simulation)

  const a = ASSETS[asset];
  const list = seriesFor(asset);
  const s = list[Math.min(si, list.length - 1)];
  const W = s.K2 - s.K1;
  const t = yearsUntil(expiry);
  const fu = fairUp(a.spot, s.K1, s.K2, a.vol, t);
  const pUp = fu / W;
  const weeks = Math.max(1, t * 52);
  const sets = deposit / W;
  const fees = deposit * s.demand * weeks * FEE * 0.5;
  const worstUp = deposit - sets * fu * (1 + FEE); // every UP sold, ends above K2
  const worstDown = deposit - sets * (W - fu) * (1 + FEE); // every DOWN sold, ends below K1
  const worst = Math.max(worstUp, worstDown);
  const worstSide = worstUp >= worstDown ? "UP" : "DOWN";

  // inventory-aware pricing (what the custom SwapVM instruction does)
  const k = 0.3;
  const invUp = 1 - flow / 100;
  const askUp = fu * (1 + FEE) * (1 + k * (1 - invUp));
  const askDown = (W - fu) * (1 + FEE) * (1 - k * 0.5 * (1 - invUp));

  const canDeposit = hydrated && deposit <= balance && deposit > 0;
  const confirm = () => {
    dispatch({ type: "deposit", vault: { id: `v-${Date.now().toString(36)}`, asset, K1: s.K1, K2: s.K2, expiry, deposit, createdAt: Date.now() } });
    toast({ title: "Shipped to 1inch Aqua", body: `${sets.toFixed(2)} sets backing UP and DOWN`, tone: "up" });
  };

  return (
    <div className="pt-4 sm:pt-8">
      <div className="flex items-end justify-between gap-6">
        <div>
          <h1 className="text-5xl font-semibold tracking-tight">
            Be the house<span className="serif font-normal text-mute">.</span>
          </h1>
          <p className="mt-2 text-mute">Back both sides. Earn the spread.</p>
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/art/scale.png" alt="" className="art -mb-4 hidden h-36 w-56 object-cover sm:block" />
      </div>

      <div className="mt-8 grid gap-4 lg:grid-cols-[1.15fr_1fr]">
        {/* ── Configure ── */}
        <Tile className="space-y-7 p-6">
          <div>
            <Label n="1" t="Pick a market" />
            <div className="flex flex-wrap gap-2">
              {ASSET_LIST.map((x) => (
                <Chip key={x.id} active={asset === x.id} onClick={() => setAsset(x.id)} className="inline-flex items-center gap-2">
                  <AssetDot asset={x.id} size={18} /> {x.id}
                </Chip>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {EXPIRIES.map((e) => (
                <Chip key={e.id} active={expiry === e.id} onClick={() => setExpiry(e.id)}>
                  {e.label}
                </Chip>
              ))}
            </div>
          </div>

          <div>
            <Label n="2" t="Pick a range to back" />
            <div className="grid gap-2 sm:grid-cols-2">
              {list.map((x, i) => (
                <button
                  key={`${x.K1}-${x.K2}`}
                  onClick={() => setSi(i)}
                  className={`rounded-2xl p-4 text-left transition active:scale-[0.98] ${si === i ? "bg-tile-3 ring-2 ring-up" : "bg-tile-2 hover:bg-tile-3"}`}
                >
                  <p className="tnum font-semibold">
                    {price(x.K1)} → {price(x.K2)}
                  </p>
                  <div className="mt-2 flex items-center gap-2 text-xs text-mute">
                    <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-tile">
                      <span className="block h-full rounded-full bg-odds" style={{ width: `${x.demand * 100}%` }} />
                    </span>
                    {x.demand > 0.5 ? "busy" : x.demand > 0.3 ? "steady" : "quiet"}
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div>
            <Label n="3" t="How much to deposit?" />
            <Stepper value={deposit} onChange={setDeposit} step={250} min={250} max={50000} />
            <p className="mt-2 text-xs text-mute">
              = {sets.toFixed(2)} sets of {usd(W, { cents: false })} each · available {usd(balance)}
            </p>
          </div>
        </Tile>

        {/* ── Outcomes ── */}
        <div className="space-y-4">
          <Tile className="p-6">
            <p className="text-sm text-mute">Estimated fees by {expiryLabel(expiry)}</p>
            <p className="mt-1 text-5xl font-semibold tracking-tight text-up">
              <RollingNumber value={fees} format="usdSigned" />
            </p>
            <p className="mt-1 text-xs text-mute">at this range's recent demand · not guaranteed</p>

            <div className="mt-6 space-y-2.5">
              <Row tone="up" k="Balanced flow (likely)" v={`keep fees, ${usd(fees, { sign: true })}`} />
              <Row tone="odds" k="One-sided flow" v="you hold the other side to expiry" />
              <Row tone="down" k={`Worst: every ${worstSide} sells and it pays in full`} v={usd(-worst)} />
            </div>
            <p className="mt-4 rounded-2xl bg-down-deep/60 px-4 py-3 text-sm text-down">
              Worst case <b>{usd(-worst)}</b>. Never more: every set is fully backed.
            </p>
          </Tile>

          <AnimatePresence>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <SlideToConfirm key={`${canDeposit}-${vaults.length}`} label={canDeposit ? `Slide to deposit ${usd(deposit, { cents: false })}` : "Not enough demo USDC"} disabled={!canDeposit} onConfirm={confirm} />
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {/* ── Inventory-aware pricing playground ── */}
      <Tile className="mt-4 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="flex items-center gap-2 font-semibold">
            <Scale size={18} className="text-odds" /> Self-balancing prices
          </p>
          <span className="font-mono text-xs text-mute">swapvm · fair value + inventory skew</span>
        </div>
        <div className="mt-5 grid items-center gap-6 md:grid-cols-[1fr_auto_1fr]">
          <Inventory label="UP left" pct={invUp} tone="up" ask={askUp} fair={fu} />
          <div className="flex flex-col items-center gap-2">
            <input type="range" min={0} max={90} value={flow} onChange={(e) => setFlow(Number(e.target.value))} className="w-48" aria-label="Simulated UP demand" />
            <span className="text-xs text-mute">{flow}% of UP bought</span>
          </div>
          <Inventory label="DOWN left" pct={1} tone="down" ask={askDown} fair={W - fu} />
        </div>
        <p className="mt-4 text-xs text-faint">
          Fair UP today {usd(fu)} of {usd(W)} ({pct(pUp)} of the range) · Black–Scholes, r = 0, σ {Math.round(a.vol * 100)}%
        </p>
      </Tile>

      {/* ── Your vaults ── */}
      <div className="mt-10">
        <h2 className="flex items-center gap-2 text-xl font-semibold">
          <Layers size={18} className="text-mute" /> Your vaults
        </h2>
        {vaults.length === 0 ? (
          <Tile className="mt-3 flex items-center gap-3 p-6 text-sm text-mute">
            <Wallet size={18} /> No vaults yet. Deposit above to start earning the spread.
          </Tile>
        ) : (
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            {vaults.map((v) => {
              const acc = v.deposit * 0.011;
              return (
                <Tile key={v.id} className="flex items-center justify-between gap-4 p-5">
                  <div>
                    <p className="flex items-center gap-2 font-semibold">
                      <AssetDot asset={v.asset} size={20} /> {price(v.K1)} → {price(v.K2)}
                    </p>
                    <p className="mt-1 text-xs text-mute">
                      {usd(v.deposit, { cents: false })} · until {expiryLabel(v.expiry)} · fees so far <span className="text-up">{usd(acc, { sign: true })}</span>
                    </p>
                  </div>
                  <Button
                    variant="soft"
                    onClick={() => {
                      dispatch({ type: "withdraw", id: v.id, amount: v.deposit + acc });
                      toast({ title: "Docked from Aqua", body: `${usd(v.deposit + acc)} back in your wallet`, tone: "odds" });
                    }}
                  >
                    Withdraw
                  </Button>
                </Tile>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function Label({ n, t }: { n: string; t: string }) {
  return (
    <p className="mb-3 flex items-center gap-2 text-sm font-semibold">
      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-tile-3 text-xs">{n}</span>
      {t}
    </p>
  );
}

function Row({ tone, k, v }: { tone: "up" | "down" | "odds"; k: string; v: string }) {
  const bar = { up: "bg-up", down: "bg-down", odds: "bg-odds" }[tone];
  return (
    <div className="flex items-center gap-3 text-sm">
      <span className={`h-6 w-1 rounded-full ${bar}`} />
      <span className="flex-1 text-mute">{k}</span>
      <span className="tnum font-medium">{v}</span>
    </div>
  );
}

function Inventory({ label, pct: p, tone, ask, fair }: { label: string; pct: number; tone: "up" | "down"; ask: number; fair: number }) {
  return (
    <div className="rounded-2xl bg-tile-2 p-4">
      <div className="flex items-baseline justify-between text-sm">
        <span className="text-mute">{label}</span>
        <span className="tnum font-semibold">{Math.round(p * 100)}%</span>
      </div>
      <div className="mt-2 h-3 overflow-hidden rounded-full bg-tile">
        <motion.div className={`h-full rounded-full ${tone === "up" ? "bg-up" : "bg-down"}`} animate={{ width: `${p * 100}%` }} transition={{ type: "spring", stiffness: 200, damping: 24 }} />
      </div>
      <p className="mt-3 text-xs text-mute">
        next ask <span className="tnum text-base font-semibold text-ink">{usd(ask)}</span> <span className="text-faint">(fair {usd(fair)})</span>
      </p>
    </div>
  );
}
