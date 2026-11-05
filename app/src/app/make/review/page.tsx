"use client";

import { Suspense, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "motion/react";
import { ArrowLeft, Check, ChevronDown } from "lucide-react";
import { ASSETS, draftFromQuery, draftToQuery, expiryLabel, quote, FEE } from "@/lib/market";
import { useStore } from "@/lib/store";
import { oneIn, pct, price, usd } from "@/lib/format";
import { OddsRing, SlideToConfirm, Tile } from "@/components/controls";
import { PayoffRamp } from "@/components/PayoffRamp";
import { SentenceText } from "@/components/SentenceText";

export default function ReviewPage() {
  return (
    <Suspense>
      <Review />
    </Suspense>
  );
}

function Review() {
  const params = useSearchParams();
  const router = useRouter();
  const { balance, dispatch, toast } = useStore();
  const draft = useMemo(() => draftFromQuery(params), [params]);
  const q = useMemo(() => quote(draft), [draft]);
  const a = ASSETS[draft.asset];
  const [ack, setAck] = useState(false);
  const [open, setOpen] = useState(false);
  const enough = balance >= q.cost;

  const confirm = () => {
    const id = `p-${Date.now().toString(36)}`;
    dispatch({
      type: "buy",
      position: {
        id,
        createdAt: Date.now(),
        asset: draft.asset,
        dir: draft.dir,
        side: q.side,
        target: draft.target,
        amount: draft.amount,
        expiry: draft.expiry,
        K1: q.K1,
        K2: q.K2,
        units: q.units,
        cost: q.cost,
        chanceAtBuy: q.chanceFull,
        status: "open",
      },
    });
    toast({ title: "Filled on 1inch Aqua", body: `${q.side} × ${q.units.toFixed(2)} for ${usd(q.cost)}`, tone: "up" });
    router.push(`/make/done?id=${id}`);
  };

  const sideWord = draft.dir === "above" ? "above" : "below";

  return (
    <div className="mx-auto max-w-[760px] pt-2 sm:pt-6">
      <Link href={`/make?${draftToQuery(draft)}`} className="inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-sm text-mute hover:bg-tile hover:text-ink">
        <ArrowLeft size={15} /> Edit sentence
      </Link>

      <h1 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">
        Your stance<span className="serif font-normal text-mute">.</span>
      </h1>
      <p className="mt-3 text-lg text-mute">
        <SentenceText {...draft} />
      </p>

      {/* ── Odds first ── */}
      <Tile className="mt-8 grid gap-6 p-6 sm:grid-cols-2 sm:p-7">
        <div className="flex items-center gap-5">
          <OddsRing p={q.chanceFull} size={112} stroke={11}>
            <span className="text-3xl font-semibold tracking-tight">{pct(q.chanceFull)}</span>
          </OddsRing>
          <div>
            <p className="text-xl font-semibold leading-tight text-odds">{oneIn(q.chanceFull)} chance</p>
            <p className="mt-1 text-sm text-mute">you collect the full {usd(q.maxPayout, { cents: false })}</p>
          </div>
        </div>
        <div className="flex items-center gap-5">
          <OddsRing p={q.chanceAny} size={112} stroke={11} tone="up">
            <span className="text-3xl font-semibold tracking-tight">{pct(q.chanceAny)}</span>
          </OddsRing>
          <div>
            <p className="text-xl font-semibold leading-tight text-up">{oneIn(q.chanceAny)} chance</p>
            <p className="mt-1 text-sm text-mute">you make any profit at all</p>
          </div>
        </div>
      </Tile>

      {/* ── Payoff ── */}
      <Tile className="mt-4 p-5 sm:p-7">
        <PayoffRamp asset={draft.asset} side={q.side} K1={q.K1} K2={q.K2} units={q.units} cost={q.cost} spot={a.spot} expiry={draft.expiry} />
      </Tile>

      {/* ── Three outcomes ── */}
      <div className="mt-4 grid gap-3">
        <Outcome tone="up" label={`${draft.asset} ends ${sideWord} ${price(draft.dir === "above" ? q.K2 : q.K1)}`} value={`You collect ${usd(q.maxPayout)}`} sub={`profit ${usd(q.profit, { sign: true })}`} />
        <Outcome
          tone="odds"
          label={`Ends between ${price(q.K1)} and ${price(q.K2)}`}
          value="You collect part of it"
          sub={`breakeven at ${price(Math.round(q.breakeven))}`}
        />
        <Outcome tone="down" label={`Ends ${draft.dir === "above" ? "at or below" : "at or above"} ${price(draft.dir === "above" ? q.K1 : q.K2)}`} value={`You lose ${usd(q.cost)}`} sub="never more than this" />
      </div>

      {/* ── Under the hood ── */}
      <button onClick={() => setOpen((o) => !o)} className="mt-4 flex w-full items-center justify-between rounded-2xl px-4 py-3 text-sm text-mute hover:bg-tile">
        Under the hood
        <ChevronDown size={16} className={`transition ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="overflow-hidden">
          <Tile className="grid gap-x-8 gap-y-3 p-5 text-sm sm:grid-cols-2">
            <Row k="Instrument" v={`${q.side} side of the ${price(q.K1)}–${price(q.K2)} ${draft.asset} set`} />
            <Row k="Units" v={q.units.toFixed(3)} />
            <Row k="Price per unit" v={`${usd(q.ask)} of ${usd(q.W)} max`} />
            <Row k="Spread fee" v={`${(FEE * 100).toFixed(0)}% (to the house)`} />
            <Row k="Collateral" v="Fully backed in USDC, complete set" />
            <Row k="Priced by" v="1inch Aqua · SpreadAquaApp" />
            <Row k="Settles" v={`${expiryLabel(draft.expiry)}, 08:00 UTC · Chainlink ${draft.asset}/USD`} />
            <Row k="Guard" v="Uniswap TWAP must agree within 1.5%" />
          </Tile>
        </motion.div>
      )}

      {/* ── Confirm ── */}
      <div className="mt-8 space-y-4">
        <label className="flex cursor-pointer items-start gap-3 rounded-2xl bg-tile p-4 text-sm">
          <span
            className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition ${ack ? "border-accent bg-accent text-on-accent" : "border-faint"}`}
          >
            {ack && <Check size={14} strokeWidth={3} />}
          </span>
          <input type="checkbox" className="sr-only" checked={ack} onChange={(e) => setAck(e.target.checked)} />
          <span>
            I understand I lose <b>{usd(q.cost)}</b> if {draft.asset} {draft.dir === "above" ? "stays at or below" : "stays at or above"} {price(draft.dir === "above" ? q.K1 : q.K2)} on {expiryLabel(draft.expiry)}.
          </span>
        </label>
        <SlideToConfirm key={String(ack && enough)} label={enough ? `Slide to pay ${usd(q.cost)}` : "Not enough demo USDC"} disabled={!ack || !enough || !q.ok} onConfirm={confirm} />
        <p className="text-center text-xs text-faint">Demo wallet · {usd(balance)} USDC available</p>
      </div>
    </div>
  );
}

function Outcome({ tone, label, value, sub }: { tone: "up" | "down" | "odds"; label: string; value: string; sub: string }) {
  const bar = { up: "bg-up", down: "bg-down", odds: "bg-odds" }[tone];
  return (
    <div className="flex items-center gap-4 rounded-2xl bg-tile p-4">
      <span className={`h-10 w-1.5 shrink-0 rounded-full ${bar}`} />
      <div className="flex-1">
        <p className="text-sm text-mute">{label}</p>
        <p className="font-semibold">{value}</p>
      </div>
      <p className="tnum text-right text-sm text-mute">{sub}</p>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-line/60 pb-2">
      <span className="text-mute">{k}</span>
      <span className="tnum text-right">{v}</span>
    </div>
  );
}
