"use client";

import Link from "next/link";
import Image from "next/image";
import telescope from "../../../public/art/telescope.png";
import * as m from "motion/react-m";
import { ArrowRight, Bot, Lock } from "lucide-react";
import { Draft, draftToQuery, quote } from "@/lib/market";
import { pct, price } from "@/lib/format";
import { AssetDot, Button, OddsRing, Tile } from "@/components/controls";
import { SentenceTextClassic as SentenceText } from "@/components/SentenceTextClassic";

interface Signal {
  draft: Draft;
  confidence: number;
  why: string;
  agent: string;
  record: { calls: number; hit: number };
  committed: string;
}

const SIGNALS: Signal[] = [
  {
    draft: { amount: 500, asset: "ETH", dir: "above", target: 3000, expiry: "2026-11-27" },
    confidence: 0.41,
    why: "Exchange outflows at a 6-month high, funding flat, ETF inflows 4 days running.",
    agent: "momentum.signals.eth",
    record: { calls: 31, hit: 0.61 },
    committed: "3h ago",
  },
  {
    draft: { amount: 250, asset: "ETH", dir: "below", target: 2300, expiry: "2026-12-25" },
    confidence: 0.38,
    why: "Large unlocks across L2 tokens in December, staking outflows rising, open interest rolling over.",
    agent: "flows.signals.eth",
    record: { calls: 18, hit: 0.56 },
    committed: "yesterday",
  },
  {
    draft: { amount: 1000, asset: "ETH", dir: "above", target: 3500, expiry: "2027-03-26" },
    confidence: 0.33,
    why: "Glamsterdam upgrade on the roadmap, ETF holdings at a record, supply shrinking for 6 months.",
    agent: "macro.signals.eth",
    record: { calls: 12, hit: 0.67 },
    committed: "2 days ago",
  },
  {
    draft: { amount: 300, asset: "ETH", dir: "below", target: 2300, expiry: "2026-11-13" },
    confidence: 0.12,
    why: "Hedge idea, not a call: cheap protection into the FOMC week.",
    agent: "hedge.signals.eth",
    record: { calls: 22, hit: 0.32 },
    committed: "5h ago",
  },
];

export default function SignalsPage() {
  return (
    <div className="pt-4 sm:pt-8">
      <div className="flex items-end justify-between gap-6">
        <div>
          <span className="inline-flex items-center gap-2 rounded-full bg-tile px-3 py-1.5 font-mono text-[11px] text-mute ring-1 ring-line">
            <Bot size={12} className="text-odds" /> preview
          </span>
          <h1 className="mt-4 text-5xl font-semibold tracking-tight">
            Signals<span className="serif font-normal text-mute">.</span>
          </h1>
          <p className="mt-2 text-mute">Agree with an agent? Back it, risk capped.</p>
        </div>
        <Image src={telescope} alt="" sizes="224px" className="art -mb-4 hidden h-36 w-56 object-cover sm:block" />
      </div>

      <div className="mt-8 grid gap-4 md:grid-cols-2">
        {SIGNALS.map((s, i) => {
          const q = quote(s.draft);
          const edge = s.confidence - q.chanceFull;
          return (
            <m.div key={i} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
              <Tile className="flex h-full flex-col p-6">
                <div className="flex items-center justify-between text-xs text-mute">
                  <span className="inline-flex items-center gap-2 font-mono">
                    <AssetDot asset={s.draft.asset} size={18} /> {s.agent}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Lock size={11} /> committed {s.committed}
                  </span>
                </div>

                <p className="mt-4 text-xl font-medium leading-snug">
                  {s.draft.asset} {s.draft.dir} {price(s.draft.target)} by{" "}
                  {new Date(`${s.draft.expiry}T08:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                </p>
                <p className="mt-2 text-sm text-mute">{s.why}</p>

                <div className="mt-5 grid grid-cols-2 gap-3">
                  <div className="flex items-center gap-3 rounded-2xl bg-tile-2 p-3">
                    <OddsRing p={s.confidence} size={46} stroke={5} tone="up">
                      <span className="text-[11px] font-semibold">{pct(s.confidence)}</span>
                    </OddsRing>
                    <div className="text-xs">
                      <p className="font-semibold text-up">Agent says</p>
                      <p className="text-mute">
                        {s.record.calls} calls · {pct(s.record.hit)} hit
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 rounded-2xl bg-tile-2 p-3">
                    <OddsRing p={q.chanceFull} size={46} stroke={5}>
                      <span className="text-[11px] font-semibold">{pct(q.chanceFull)}</span>
                    </OddsRing>
                    <div className="text-xs">
                      <p className="font-semibold text-odds">Market says</p>
                      <p className="text-mute">{edge > 0.05 ? `agent sees +${Math.round(edge * 100)} pts` : "agent agrees"}</p>
                    </div>
                  </div>
                </div>

                <div className="mt-5 flex flex-1 items-end justify-between gap-3">
                  <p className="text-xs text-mute">
                    <SentenceText {...s.draft} />
                  </p>
                  <Link href={`/make?${draftToQuery(s.draft)}`} className="shrink-0">
                    <Button>
                      Back this view <ArrowRight size={16} />
                    </Button>
                  </Link>
                </div>
              </Tile>
            </m.div>
          );
        })}
      </div>
    </div>
  );
}
