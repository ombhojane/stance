"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { motion } from "motion/react";
import { ArrowLeft, BadgeCheck, FastForward, Link2 } from "lucide-react";
import { markValue, sellBackValue, useLiveSpot, useStore } from "@/lib/store";
import { ASSETS, NOW, chanceAbove, expiryLabel, expiryTime, unitPayout, yearsUntil } from "@/lib/market";
import { countdown, oneIn, pct, price, shortHash, usd } from "@/lib/format";
import { AssetDot, Button, OddsRing, SlideToConfirm, Tile } from "@/components/controls";
import { PayoffRamp } from "@/components/PayoffRamp";
import { RollingNumber } from "@/components/RollingNumber";
import { SentenceText } from "@/components/SentenceText";

export default function PositionPage() {
  const { id } = useParams<{ id: string }>();
  const { positions, hydrated, dispatch, toast } = useStore();
  const p = positions.find((x) => x.id === id);
  const spot = useLiveSpot(p?.asset ?? "ETH");

  if (!hydrated) return null;
  if (!p)
    return (
      <div className="pt-24 text-center text-mute">
        Position not found. <Link href="/positions" className="text-up underline">Back to positions</Link>
      </div>
    );

  const a = ASSETS[p.asset];
  const t = yearsUntil(p.expiry);
  const value = markValue(p, spot);
  const bid = sellBackValue(p, spot);
  const pnl = value - p.cost;
  const maxPayout = p.units * (p.K2 - p.K1);
  const chanceNow = p.side === "UP" ? chanceAbove(spot, p.K2, a.vol, t) : 1 - chanceAbove(spot, p.K1, a.vol, t);
  const collect = p.settlePrice !== undefined ? unitPayout(p.side, p.settlePrice, p.K1, p.K2) * p.units : 0;

  const sell = () => {
    dispatch({ type: "sell", id: p.id, proceeds: bid });
    toast({ title: "Sold back on 1inch Aqua", body: `${usd(bid)} returned to your wallet`, tone: "up" });
  };
  const fastForward = () => {
    // demo: draw a settlement price from the market's own distribution
    const sd = a.vol * Math.sqrt(t);
    const z = Math.sqrt(-2 * Math.log(Math.random() || 1e-9)) * Math.cos(2 * Math.PI * Math.random());
    const settle = Math.round(spot * Math.exp(-0.5 * sd * sd + sd * z) * 100) / 100;
    dispatch({ type: "settle", id: p.id, price: settle });
    toast({ title: `Chainlink settled ${p.asset} at ${price(settle)}`, body: "Uniswap TWAP agreed within 0.4%", tone: "odds" });
  };
  const redeem = () => {
    dispatch({ type: "redeem", id: p.id, proceeds: collect });
    toast({ title: collect > 0 ? `Collected ${usd(collect)}` : "Position closed", body: collect > 0 ? "USDC is back in your wallet" : "Better luck next call", tone: collect > 0 ? "up" : "down" });
  };

  return (
    <div className="mx-auto max-w-[860px] pt-2 sm:pt-6">
      <Link href="/positions" className="inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-sm text-mute hover:bg-tile hover:text-ink">
        <ArrowLeft size={15} /> Positions
      </Link>

      <div className="mt-4 flex items-center gap-2 text-sm font-semibold">
        <AssetDot asset={p.asset} size={26} /> {a.name}
        <span className={`rounded-full px-2 py-0.5 text-[11px] ${p.side === "UP" ? "bg-up-deep text-up" : "bg-down-deep text-down"}`}>{p.side}</span>
        <span className="ml-auto text-xs font-normal text-mute">{p.status === "open" ? `${countdown(expiryTime(p.expiry) - NOW)} left` : expiryLabel(p.expiry)}</span>
      </div>
      <h1 className="mt-3 text-2xl font-medium leading-snug tracking-tight sm:text-3xl">
        <SentenceText amount={p.amount} asset={p.asset} dir={p.dir} target={p.target} expiry={p.expiry} />
      </h1>

      {/* ── Value ── */}
      <div className="mt-6 grid gap-4 sm:grid-cols-[1.4fr_1fr]">
        <Tile className="p-6">
          <p className="text-sm text-mute">{p.status === "open" ? "Worth now" : p.status === "settled" ? "Ready to collect" : "Closed for"}</p>
          <p className="mt-2 text-5xl font-semibold tracking-tight">
            <RollingNumber value={p.status === "settled" ? collect : value} format="usd" />
          </p>
          <p className={`mt-2 text-sm ${(p.status === "settled" ? collect : value) - p.cost >= 0 ? "text-up" : "text-down"}`}>
            {usd((p.status === "settled" ? collect : value) - p.cost, { sign: true })} <span className="text-mute">on {usd(p.cost)} paid · max {usd(maxPayout, { cents: false })}</span>
          </p>
        </Tile>
        <Tile className="flex items-center gap-4 p-6">
          {p.status === "open" ? (
            <>
              <OddsRing p={chanceNow} size={84} stroke={9}>
                <span className="text-lg font-semibold">{pct(chanceNow)}</span>
              </OddsRing>
              <div>
                <p className="font-semibold text-odds">{oneIn(chanceNow)} now</p>
                <p className="text-xs text-mute">was {pct(p.chanceAtBuy)} when you bought</p>
              </div>
            </>
          ) : (
            <div>
              <p className="text-sm text-mute">Result</p>
              <p className={`mt-1 text-2xl font-semibold ${pnl >= 0 || collect > p.cost ? "text-up" : "text-down"}`}>
                {p.status === "settled" ? (collect >= maxPayout - 0.01 ? "Fully right" : collect > 0 ? "Partly right" : "Missed") : p.status === "sold" ? "Sold early" : "Collected"}
              </p>
            </div>
          )}
        </Tile>
      </div>

      {/* ── Chart ── */}
      <Tile className="mt-4 p-5 sm:p-7">
        <PayoffRamp
          key={`${p.status}-${p.settlePrice ?? "open"}`}
          asset={p.asset}
          side={p.side}
          K1={p.K1}
          K2={p.K2}
          units={p.units}
          cost={p.cost}
          spot={p.status === "settled" ? p.settlePrice! : spot}
          expiry={p.expiry}
          settlePrice={p.settlePrice}
          showOdds={p.status === "open"}
          initialScrub={p.settlePrice ?? spot}
        />
      </Tile>

      {/* ── Actions ── */}
      {p.status === "open" && (
        <div className="mt-6 space-y-3">
          <Tile className="p-5">
            <div className="mb-4 flex items-center justify-between text-sm">
              <span className="text-mute">Sell back to the house now</span>
              <span className="tnum font-semibold">
                <RollingNumber value={bid} format="usd" />
              </span>
            </div>
            <SlideToConfirm label={`Slide to sell for ${usd(bid)}`} onConfirm={sell} tone={bid >= p.cost ? "up" : "down"} />
          </Tile>
          <button onClick={fastForward} className="flex w-full items-center justify-center gap-2 rounded-full border border-dashed border-line py-3 text-sm text-mute transition hover:border-sun hover:text-sun">
            <FastForward size={15} /> Demo: fast-forward to {expiryLabel(p.expiry)} and settle
          </button>
        </div>
      )}

      {p.status === "settled" && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mt-6 space-y-3">
          <Tile className="p-5">
            <p className="flex items-center gap-2 text-sm font-semibold">
              <BadgeCheck size={17} className="text-sun" /> Settlement proof
            </p>
            <div className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
              <Proof k={`Chainlink ${p.asset}/USD`} v={price(p.settlePrice!)} />
              <Proof k="Uniswap TWAP check" v="Passed · 0.4% apart" />
              <Proof k="Settled at" v={`${expiryLabel(p.expiry)} 08:00 UTC`} />
            </div>
            <p className="mt-4 inline-flex items-center gap-1.5 font-mono text-xs text-faint">
              <Link2 size={12} /> {shortHash(p.id + "settle")}
            </p>
          </Tile>
          <Button size="lg" className="w-full" onClick={redeem}>
            {collect > 0 ? `Collect ${usd(collect)}` : "Close position"}
          </Button>
        </motion.div>
      )}

      {(p.status === "sold" || p.status === "redeemed") && (
        <Tile className="mt-6 p-5 text-sm text-mute">
          {p.status === "sold" ? "You sold this back before expiry" : "You collected this position"} for <b className="text-ink">{usd(p.proceeds ?? 0)}</b>. {usd((p.proceeds ?? 0) - p.cost, { sign: true })} overall.
        </Tile>
      )}
    </div>
  );
}

function Proof({ k, v }: { k: string; v: string }) {
  return (
    <div className="rounded-2xl bg-tile-2 p-3">
      <p className="text-xs text-mute">{k}</p>
      <p className="tnum mt-1 font-semibold">{v}</p>
    </div>
  );
}
