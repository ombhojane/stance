"use client";

import Link from "next/link";
import Image from "next/image";
import flag from "../../../public/art/flag.png";
import { useState } from "react";
import * as m from "motion/react-m";
import { ArrowRight, Plus } from "lucide-react";
import { Position, markValue, useStore } from "@/lib/store";
import { ASSETS, NOW, chanceAbove, expiryLabel, expiryTime, unitPayout, yearsUntil } from "@/lib/market";
import { countdown, pct, price, usd } from "@/lib/format";
import { AssetDot, Button, Segmented, Tile } from "@/components/controls";
import { PayoffRampClassic as PayoffRamp } from "@/components/PayoffRampClassic";
import { RollingNumber } from "@/components/RollingNumber";
import { SentenceTextClassic as SentenceText } from "@/components/SentenceTextClassic";
import { useSpots } from "@/components/useSpots";

export default function PositionsPage() {
  const { positions, hydrated } = useStore();
  const spots = useSpots();
  const [tab, setTab] = useState<"live" | "done">("live");

  if (!hydrated) return null;

  const live = positions.filter((p) => p.status === "open" || p.status === "settled");
  const done = positions.filter((p) => p.status === "sold" || p.status === "redeemed");
  const open = positions.filter((p) => p.status === "open");
  const inPlay = open.reduce((s, p) => s + p.cost, 0);
  const worth = open.reduce((s, p) => s + markValue(p, spots[p.asset]), 0);
  const pnl = worth - inPlay;
  const list = tab === "live" ? live : done;

  return (
    <div className="pt-4 sm:pt-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-4xl font-semibold tracking-tight">
          Your stances<span className="serif font-normal text-mute">.</span>
        </h1>
        <Link href="/make">
          <Button>
            <Plus size={16} /> New stance
          </Button>
        </Link>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <Summary k="In play" v={<RollingNumber value={inPlay} format="usd" />} />
        <Summary k="Worth now" v={<RollingNumber value={worth} format="usd" />} />
        <Summary k="Open P/L" v={<span className={pnl >= 0 ? "text-up" : "text-down"}><RollingNumber value={pnl} format="usdSigned" /></span>} />
      </div>

      <div className="mt-8">
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: "live", label: `Live · ${live.length}` },
            { value: "done", label: `Closed · ${done.length}` },
          ]}
        />
      </div>

      {list.length === 0 ? (
        <Tile className="mt-4 flex flex-col items-center gap-4 p-10 text-center">
            <Image src={flag} alt="" sizes="256px" className="art h-40 w-64 object-cover" />
          <p className="text-mute">{tab === "live" ? "No stances yet." : "Nothing closed yet."}</p>
          <Link href="/make">
            <Button>
              Take a stance <ArrowRight size={16} />
            </Button>
          </Link>
        </Tile>
      ) : (
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {list.map((p, i) => (
            <m.div key={p.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
              <PositionCard p={p} spot={spots[p.asset]} />
            </m.div>
          ))}
        </div>
      )}
    </div>
  );
}

function Summary({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <Tile className="p-5">
      <p className="text-sm text-mute">{k}</p>
      <p className="mt-2 text-3xl font-semibold tracking-tight">{v}</p>
    </Tile>
  );
}

function PositionCard({ p, spot }: { p: Position; spot: number }) {
  const value = markValue(p, spot);
  const pnl = value - p.cost;
  const a = ASSETS[p.asset];
  const settled = p.status === "settled";
  const closed = p.status === "sold" || p.status === "redeemed";
  const chanceNow = p.side === "UP" ? chanceAbove(spot, p.K2, a.vol, yearsUntil(p.expiry)) : 1 - chanceAbove(spot, p.K1, a.vol, yearsUntil(p.expiry));
  const collect = settled ? unitPayout(p.side, p.settlePrice!, p.K1, p.K2) * p.units : 0;

  return (
    <Link href={`/positions/${p.id}`} className="block">
      <Tile className="group p-5 transition hover:-translate-y-0.5 hover:border-tile-3">
        <div className="flex items-center justify-between">
          <span className="inline-flex items-center gap-2 text-sm font-semibold">
            <AssetDot asset={p.asset} /> {p.asset}
            <span className={`rounded-full px-2 py-0.5 text-[11px] ${p.side === "UP" ? "bg-up-deep text-up" : "bg-down-deep text-down"}`}>{p.side}</span>
          </span>
          <StatusPill p={p} />
        </div>
        <p className="mt-3 text-[15px] leading-snug">
          <SentenceText amount={p.amount} asset={p.asset} dir={p.dir} target={p.target} expiry={p.expiry} />
        </p>
        <div className="mt-3 -mx-1">
          <PayoffRamp asset={p.asset} side={p.side} K1={p.K1} K2={p.K2} units={p.units} cost={p.cost} spot={settled ? p.settlePrice! : spot} expiry={p.expiry} settlePrice={p.settlePrice} compact scrub={false} showOdds={!settled && !closed} />
        </div>
        <div className="mt-3 flex items-end justify-between">
          <div>
            <p className="text-xs text-mute">{settled ? "Ready to collect" : closed ? "Closed for" : "Worth now"}</p>
            <p className="text-2xl font-semibold tracking-tight">
              <RollingNumber value={settled ? collect : value} format="usd" />
            </p>
          </div>
          <div className="text-right text-sm">
            <p className={pnl >= 0 ? "text-up" : "text-down"}>{usd((settled ? collect : value) - p.cost, { sign: true })}</p>
            <p className="text-xs text-mute">{settled ? `settled ${price(p.settlePrice!)}` : closed ? `paid ${usd(p.cost)}` : `${pct(chanceNow)} chance now`}</p>
          </div>
        </div>
      </Tile>
    </Link>
  );
}

function StatusPill({ p }: { p: Position }) {
  if (p.status === "settled") return <span className="rounded-full bg-sun px-2.5 py-1 text-[11px] font-semibold text-on-accent">Collect</span>;
  if (p.status === "sold") return <span className="rounded-full bg-tile-3 px-2.5 py-1 text-[11px] text-mute">Sold back</span>;
  if (p.status === "redeemed") return <span className="rounded-full bg-tile-3 px-2.5 py-1 text-[11px] text-mute">Collected</span>;
  const left = expiryTime(p.expiry) - NOW;
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-tile-2 px-2.5 py-1 text-[11px] text-mute">
      <span className="live-dot !h-1.5 !w-1.5" /> {countdown(left)} · {expiryLabel(p.expiry)}
    </span>
  );
}
