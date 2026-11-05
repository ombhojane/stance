"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { markValue, sellBackValue, useLiveSpot, useStore } from "@/lib/store";
import { ASSETS, NOW, chanceAbove, expiryLabel, expiryTime, unitPayout, yearsUntil } from "@/lib/market";
import { countdown, pct, price, usd } from "@/lib/format";
import { Button, SlideToConfirm } from "@/components/controls";
import { PayoffRamp } from "@/components/PayoffRamp";
import { RollingNumber } from "@/components/RollingNumber";
import { SentenceText } from "@/components/SentenceText";

export function PositionView() {
  const { id } = useParams<{ id: string }>();
  const { positions, hydrated, dispatch, toast } = useStore();
  const p = positions.find((x) => x.id === id);
  const spot = useLiveSpot(p?.asset ?? "ETH");

  if (!hydrated) return null;
  if (!p)
    return (
      <p className="pt-24 text-center text-mute">
        Not found. <Link href="/positions" className="text-ink underline">Your stances</Link>
      </p>
    );

  const a = ASSETS[p.asset];
  const t = yearsUntil(p.expiry);
  const open = p.status === "open";
  const settled = p.status === "settled";
  const collect = settled ? unitPayout(p.side, p.settlePrice!, p.K1, p.K2) * p.units : 0;
  const value = settled ? collect : open ? markValue(p, spot) : p.proceeds ?? 0;
  const bid = sellBackValue(p, spot);
  const chanceNow = p.side === "UP" ? chanceAbove(spot, p.K2, a.vol, t) : 1 - chanceAbove(spot, p.K1, a.vol, t);

  const sell = () => {
    dispatch({ type: "sell", id: p.id, proceeds: bid });
    toast({ title: `Sold back for ${usd(bid)}`, tone: "up" });
  };
  const settleNow = () => {
    const sd = a.vol * Math.sqrt(t);
    const z = Math.sqrt(-2 * Math.log(Math.random() || 1e-9)) * Math.cos(2 * Math.PI * Math.random());
    const s = Math.round(spot * Math.exp(-0.5 * sd * sd + sd * z) * 100) / 100;
    dispatch({ type: "settle", id: p.id, price: s });
    toast({ title: `${p.asset} settled at ${price(s)}`, tone: "odds" });
  };
  const redeem = () => {
    dispatch({ type: "redeem", id: p.id, proceeds: collect });
    toast({ title: collect > 0 ? `Collected ${usd(collect)}` : "Closed", tone: collect > 0 ? "up" : "down" });
  };

  return (
    <div className="mx-auto max-w-[720px] pt-2 sm:pt-8">
      <Link href="/positions" className="inline-flex items-center gap-1.5 text-sm text-mute hover:text-ink">
        <ArrowLeft size={15} /> Your stances
      </Link>

      <h1 className="mt-6 text-[clamp(1.6rem,3.6vw,2.3rem)] font-medium leading-tight tracking-[-0.03em] text-mute">
        <SentenceText amount={p.amount} asset={p.asset} dir={p.dir} target={p.target} expiry={p.expiry} />
      </h1>

      <dl className="mt-8 grid grid-cols-2 gap-6 border-y border-line py-6 sm:grid-cols-4">
        <div>
          <dt className="text-xs text-mute">{settled ? "To collect" : open ? "Worth now" : "Closed for"}</dt>
          <dd className="mt-1 text-2xl font-semibold">
            <RollingNumber value={value} format="usd" />
          </dd>
        </div>
        <Fact k="Paid" v={usd(p.cost)} sub={<span className={value - p.cost >= 0 ? "text-up" : "text-down"}>{usd(value - p.cost, { sign: true })}</span>} />
        {open ? <Fact k="Chance now" v={pct(chanceNow)} sub={`was ${pct(p.chanceAtBuy)}`} /> : <Fact k="Settled at" v={p.settlePrice ? price(p.settlePrice) : "—"} />}
        <Fact k={open ? "Settles in" : "Settled"} v={open ? countdown(expiryTime(p.expiry) - NOW) : expiryLabel(p.expiry)} />
      </dl>

      <div className="mt-10">
        <PayoffRamp
          key={`${p.status}-${p.settlePrice ?? "open"}`}
          asset={p.asset}
          side={p.side}
          K1={p.K1}
          K2={p.K2}
          units={p.units}
          cost={p.cost}
          spot={settled ? p.settlePrice! : spot}
          settlePrice={p.settlePrice}
          initialScrub={p.settlePrice ?? spot}
        />
      </div>

      {open && (
        <div className="mt-10 space-y-4">
          <SlideToConfirm label={`Slide to sell back for ${usd(bid)}`} onConfirm={sell} />
          <button onClick={settleNow} className="w-full text-center font-mono text-xs text-faint transition hover:text-ink">
            demo: jump to {expiryLabel(p.expiry)} and settle
          </button>
        </div>
      )}

      {settled && (
        <div className="mt-10 space-y-6">
          <dl className="space-y-1.5 font-mono text-xs text-mute">
            <div className="flex justify-between">
              <dt>chainlink {p.asset.toLowerCase()}/usd</dt>
              <dd className="text-ink">{price(p.settlePrice!)}</dd>
            </div>
            <div className="flex justify-between">
              <dt>uniswap twap check</dt>
              <dd className="text-ink">ok, 0.4% apart</dd>
            </div>
            <div className="flex justify-between">
              <dt>settled</dt>
              <dd className="text-ink">{expiryLabel(p.expiry)} 08:00 utc</dd>
            </div>
          </dl>
          <Button size="lg" className="w-full" onClick={redeem}>
            {collect > 0 ? `Collect ${usd(collect)}` : "Close"}
          </Button>
        </div>
      )}

      {!open && !settled && (
        <p className="mt-10 text-mute">
          {p.status === "sold" ? "Sold back early" : "Collected"} for <span className="text-ink">{usd(p.proceeds ?? 0)}</span>, {usd((p.proceeds ?? 0) - p.cost, { sign: true })} overall.
        </p>
      )}
    </div>
  );
}

function Fact({ k, v, sub }: { k: string; v: string; sub?: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-mute">{k}</dt>
      <dd className="tnum mt-1 text-lg font-semibold">{v}</dd>
      {sub && <dd className="tnum text-xs text-mute">{sub}</dd>}
    </div>
  );
}
