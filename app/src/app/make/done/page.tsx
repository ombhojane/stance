"use client";

import { Suspense, useMemo } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { motion } from "motion/react";
import { ArrowRight, ExternalLink, Plus } from "lucide-react";
import { useStore } from "@/lib/store";
import { expiryLabel } from "@/lib/market";
import { pct, price, shortHash, usd } from "@/lib/format";
import { AssetDot, Button } from "@/components/controls";
import { SentenceText } from "@/components/SentenceText";

const CONFETTI = ["#C8F560", "#B9A6FF", "#FFD66B", "#FF8A7A", "#F4F3EF"];

export default function DonePage() {
  return (
    <Suspense>
      <Done />
    </Suspense>
  );
}

function Done() {
  const params = useSearchParams();
  const { positions, hydrated } = useStore();
  const p = positions.find((x) => x.id === params.get("id"));
  const bits = useMemo(
    () =>
      Array.from({ length: 36 }, (_, i) => ({
        x: (Math.random() - 0.5) * 900,
        y: -Math.random() * 520 - 80,
        r: Math.random() * 540 - 270,
        c: CONFETTI[i % CONFETTI.length],
        w: 6 + Math.random() * 8,
        d: Math.random() * 0.25,
      })),
    [],
  );

  if (!hydrated) return null;
  if (!p)
    return (
      <div className="pt-24 text-center text-mute">
        Couldn't find that position. <Link href="/positions" className="text-up underline">See all positions</Link>
      </div>
    );

  return (
    <div className="relative mx-auto max-w-[520px] pt-10 sm:pt-16">
      {/* confetti */}
      <div className="pointer-events-none absolute left-1/2 top-48 z-0">
        {bits.map((b, i) => (
          <motion.span
            key={i}
            className="absolute rounded-[2px]"
            style={{ width: b.w, height: b.w * 0.45, background: b.c }}
            initial={{ x: 0, y: 0, rotate: 0, opacity: 1 }}
            animate={{ x: b.x, y: [0, b.y, b.y + 700], rotate: b.r, opacity: [1, 1, 0] }}
            transition={{ duration: 2.4, delay: b.d, ease: "easeOut" }}
          />
        ))}
      </div>

      <motion.p initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="relative z-10 text-center text-sm font-medium text-up">
        You're in.
      </motion.p>
      <motion.h1 initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="relative z-10 mt-2 text-center text-4xl font-semibold tracking-tight">
        Your stance is <span className="serif font-normal">live.</span>
      </motion.h1>

      {/* ticket */}
      <motion.div
        initial={{ opacity: 0, y: 40, rotate: -4, scale: 0.92 }}
        animate={{ opacity: 1, y: 0, rotate: -1.5, scale: 1 }}
        transition={{ type: "spring", stiffness: 180, damping: 18, delay: 0.1 }}
        whileHover={{ rotate: 0, y: -4 }}
        className="relative z-10 mt-10"
      >
        <div className="ticket-edge overflow-hidden rounded-[26px] bg-[#f4f3ef] text-[#0a0a0b] shadow-2xl ring-1 ring-black/5">
          <div className="p-6">
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-2 text-sm font-semibold">
                <AssetDot asset={p.asset} size={26} /> {p.asset} · {p.side}
              </span>
              <span className="rounded-full bg-black/10 px-2.5 py-1 text-xs font-semibold">{expiryLabel(p.expiry)}</span>
            </div>
            <p className="mt-5 text-xl font-medium leading-snug [&_.text-mute]:text-black/50 [&_.text-up]:text-[#4f7a00] [&_.text-down]:text-[#c2412d]">
              <SentenceText amount={p.amount} asset={p.asset} dir={p.dir} target={p.target} expiry={p.expiry} />
            </p>
          </div>
          <div className="mx-6 border-t-2 border-dashed border-black/15" />
          <div className="grid grid-cols-3 gap-2 p-6 text-sm">
            <Stat k="Paid" v={usd(p.cost)} />
            <Stat k="Could collect" v={usd(p.units * (p.K2 - p.K1), { cents: false })} />
            <Stat k="Chance" v={pct(p.chanceAtBuy)} />
          </div>
          <div className="flex items-center justify-between bg-black/5 px-6 py-3 text-xs">
            <span className="font-mono opacity-60">{shortHash(p.id)}</span>
            <span className="inline-flex items-center gap-1 font-semibold opacity-70">
              Base fork <ExternalLink size={12} />
            </span>
          </div>
        </div>
      </motion.div>

      <p className="relative z-10 mt-6 text-center text-sm text-mute">
        Range {price(p.K1)}–{price(p.K2)}. Sell back anytime, or wait for settlement.
      </p>

      <div className="relative z-10 mt-8 flex flex-col gap-3 sm:flex-row">
        <Link href={`/positions/${p.id}`} className="flex-1">
          <Button size="lg" className="w-full">
            Watch it <ArrowRight size={18} />
          </Button>
        </Link>
        <Link href="/make" className="flex-1">
          <Button size="lg" variant="soft" className="w-full">
            <Plus size={18} /> Make another
          </Button>
        </Link>
      </div>
    </div>
  );
}

function Stat({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <p className="text-xs opacity-50">{k}</p>
      <p className="tnum mt-0.5 text-lg font-semibold">{v}</p>
    </div>
  );
}
