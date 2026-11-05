"use client";

import Link from "next/link";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowUpRight } from "lucide-react";
import { Draft, draftFromQuery, expiryLabel, quote } from "@/lib/market";
import { pct, price } from "@/lib/format";
import { AssetDot, Tile } from "@/components/controls";
import { StanceHero } from "@/components/StanceHero";

const EXAMPLES: Draft[] = [
  { amount: 500, asset: "ETH", dir: "above", target: 3000, expiry: "2026-11-27" },
  { amount: 250, asset: "SOL", dir: "below", target: 125, expiry: "2026-12-25" },
  { amount: 1000, asset: "BTC", dir: "above", target: 75000, expiry: "2027-03-26" },
  { amount: 300, asset: "ETH", dir: "below", target: 2300, expiry: "2026-11-13" },
];

export default function Landing() {
  return (
    <Suspense>
      <Home />
    </Suspense>
  );
}

function Home() {
  const params = useSearchParams();
  const [draft, setDraft] = useState<Draft>(() => draftFromQuery(params));

  return (
    <div className="space-y-20">
      <StanceHero draft={draft} onDraft={setDraft} />

      {/* ── Try one ── */}
      <div className="-mt-6 flex flex-wrap items-center justify-center gap-2">
        {EXAMPLES.map((d, i) => {
          const q = quote(d);
          return (
            <button
              key={i}
              onClick={() => {
                setDraft(d);
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
              className="inline-flex items-center gap-2 rounded-full bg-tile px-3.5 py-2 text-sm ring-1 ring-line transition hover:-translate-y-0.5 hover:ring-faint"
            >
              <AssetDot asset={d.asset} size={18} />
              <span className="font-medium">
                {d.asset} {d.dir === "above" ? "↑" : "↓"} {price(d.target)}
              </span>
              <span className="text-mute">{expiryLabel(d.expiry)}</span>
              <span className="font-mono text-xs text-odds">{pct(q.chanceFull)}</span>
            </button>
          );
        })}
      </div>

      {/* ── Ramp, not a coin flip ── */}
      <section className="grid items-center gap-4 md:grid-cols-[1fr_1fr_1fr]">
        <h2 className="text-4xl font-semibold leading-[1] tracking-tight">
          Not yes
          <br />
          <span className="serif font-normal text-mute">or no.</span>
        </h2>
        <Tile className="p-6">
          <p className="font-mono text-xs text-mute">prediction market</p>
          <svg viewBox="0 0 300 110" className="mt-3 w-full">
            <path d="M10 90 H150 V20 H290" fill="none" stroke="var(--mute)" strokeWidth="3" strokeLinejoin="round" />
            <circle cx="150" cy="90" r="5" fill="var(--down)" />
          </svg>
          <p className="mt-2 font-mono text-xs text-faint">$2,999 → $0</p>
        </Tile>
        <Tile className="p-6">
          <p className="font-mono text-xs text-up">stance</p>
          <svg viewBox="0 0 300 110" className="mt-3 w-full">
            <path d="M10 90 H100 L200 20 H290" fill="none" stroke="var(--up)" strokeWidth="3.5" strokeLinejoin="round" />
            <circle cx="180" cy="34" r="5" fill="var(--up)" />
          </svg>
          <p className="mt-2 font-mono text-xs text-faint">close → paid most of it</p>
        </Tile>
      </section>

      {/* ── Two doors ── */}
      <section className="grid gap-4 md:grid-cols-2">
        <Door href="/make" title="Take a stance" sub="Capped risk. Real odds." img="/art/flag.png" zoom />
        <Door href="/house" title="Be the house" sub="Back both sides. Earn the spread." img="/art/scale.png" />
      </section>

      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-6 font-mono text-[11px] text-faint">
        <span>1inch aqua · chainlink · uniswap</span>
        <span>simulated prices · testnet</span>
      </footer>
    </div>
  );
}

function Door({ href, title, sub, img, zoom }: { href: string; title: string; sub: string; img: string; zoom?: boolean }) {
  return (
    <Link href={href} className="group">
      <Tile className="relative h-full overflow-hidden p-7 transition group-hover:-translate-y-1">
        <div className="relative z-10 flex items-start justify-between">
          <div>
            <p className="text-3xl font-semibold tracking-tight">{title}</p>
            <p className="mt-1 text-mute">{sub}</p>
          </div>
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-accent text-on-accent transition group-hover:rotate-45">
            <ArrowUpRight size={20} />
          </span>
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={img} alt="" className={`art pointer-events-none mx-auto mt-2 h-56 w-full object-cover object-center transition duration-500 ${zoom ? "scale-[1.6] group-hover:scale-[1.66]" : "group-hover:scale-[1.04]"}`} />
      </Tile>
    </Link>
  );
}
