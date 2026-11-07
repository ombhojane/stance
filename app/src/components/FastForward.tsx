"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence } from "motion/react";
import * as m from "motion/react-m";
import { FastForward as FfIcon, X } from "lucide-react";
import type { Position } from "@/lib/store";
import { ASSETS, expiryLabel, expiryTime, unitPayout } from "@/lib/market";
import { price, usd } from "@/lib/format";

type Outcome = "win" | "part" | "lose";
const DURATION = 7000;
const STEPS = 160;

/** End price for a chosen outcome, on the right side of the strikes for this stance. */
function endPrice(p: Position, o: Outcome) {
  const mid = (p.K1 + p.K2) / 2;
  if (o === "part") return Math.round(mid);
  const up = p.side === "UP";
  if (o === "win") return Math.round(up ? p.K2 * 1.04 : p.K1 * 0.96);
  return Math.round(up ? p.K1 * 0.95 : p.K2 * 1.05);
}

/** A price path from today to expiry that lands exactly on `end` (a Brownian bridge in log space). */
function bridge(spot: number, end: number, vol: number, years: number) {
  const dt = years / STEPS;
  const w: number[] = [0];
  for (let i = 1; i <= STEPS; i++) {
    const z = Math.sqrt(-2 * Math.log(Math.random() || 1e-9)) * Math.cos(2 * Math.PI * Math.random());
    w.push(w[i - 1] + vol * Math.sqrt(dt) * z);
  }
  const lnTarget = Math.log(end / spot);
  return w.map((x, i) => spot * Math.exp(x - (i / STEPS) * w[STEPS] + (i / STEPS) * lnTarget));
}

/**
 * Fast-forward a stance to its expiry: a 7-second film of the weeks between now and the
 * settlement date, ending on a payout. Test mode collects into the test balance; a live
 * onchain stance shows the same result as a preview (the chain settles on the real date).
 */
export function FastForward({ p, spot, live, onCollect }: { p: Position; spot: number; live: boolean; onCollect: (settlePrice: number, payout: number) => void }) {
  const [open, setOpen] = useState(false);
  const [outcome, setOutcome] = useState<Outcome>("win");
  const [t, setT] = useState(0); // 0..1 progress of the film
  const [phase, setPhase] = useState<"pick" | "run" | "end">("pick");
  const [mounted, setMounted] = useState(false);
  const raf = useRef(0);
  useEffect(() => setMounted(true), []);

  const start = useMemo(() => Date.now(), [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const end = expiryTime(p.expiry);
  const years = Math.max((end - start) / (365 * 24 * 3600 * 1000), 1 / 365);
  const final = endPrice(p, outcome);
  const path = useMemo(() => bridge(spot, final, ASSETS[p.asset].vol, years), [spot, final, years, p.asset, phase === "run"]); // eslint-disable-line react-hooks/exhaustive-deps
  const payout = unitPayout(p.side, final, p.K1, p.K2) * p.units;

  const run = () => {
    setPhase("run");
    const t0 = performance.now();
    const tick = (now: number) => {
      const x = Math.min(1, (now - t0) / DURATION);
      setT(x);
      if (x < 1) raf.current = requestAnimationFrame(tick);
      else setPhase("end");
    };
    raf.current = requestAnimationFrame(tick);
  };
  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  const close = () => {
    cancelAnimationFrame(raf.current);
    setOpen(false);
    setPhase("pick");
    setT(0);
  };

  // chart geometry
  const W = 560, H = 220;
  const lo = Math.min(...path, p.K1) * 0.97, hi = Math.max(...path, p.K2) * 1.03;
  const y = (v: number) => H - ((v - lo) / (hi - lo)) * H;
  const n = Math.max(1, Math.floor(t * STEPS));
  const pts = path.slice(0, n + 1).map((v, i) => `${(i / STEPS) * W},${y(v)}`).join(" ");
  const nowPrice = path[Math.min(n, STEPS)];
  const day = new Date(start + (end - start) * t);
  const won = payout > p.cost;

  const sheet = (
    <AnimatePresence>
      {open && (
        <m.div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-ink/40 p-4 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <m.div
            initial={{ y: 30, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 30, opacity: 0 }}
            transition={{ type: "spring", stiffness: 420, damping: 36 }}
            className="w-full max-w-[640px] rounded-[28px] bg-tile p-6 ring-1 ring-line sm:p-8"
          >
            <div className="flex items-center justify-between">
              <p className="font-mono text-xs tracking-widest text-mute">FAST-FORWARD TO {expiryLabel(p.expiry).toUpperCase()}</p>
              {phase !== "run" && (
                <button onClick={close} aria-label="Close" className="rounded-full p-1.5 text-mute hover:bg-tile-2 hover:text-ink">
                  <X size={18} />
                </button>
              )}
            </div>

            {phase === "pick" && (
              <>
                <p className="mt-4 text-2xl font-semibold tracking-tight">How does ETH end?</p>
                <div className="mt-5 grid gap-2 sm:grid-cols-3">
                  {(
                    [
                      ["win", `${p.side === "UP" ? "Above" : "Below"} ${price(p.side === "UP" ? p.K2 : p.K1)}`, "you win in full"],
                      ["part", `Between ${price(p.K1)} – ${price(p.K2)}`, "you get part"],
                      ["lose", `${p.side === "UP" ? "Below" : "Above"} ${price(p.side === "UP" ? p.K1 : p.K2)}`, "you lose what you paid"],
                    ] as [Outcome, string, string][]
                  ).map(([o, h, s]) => (
                    <button
                      key={o}
                      onClick={() => setOutcome(o)}
                      className={`rounded-2xl p-4 text-left transition ${outcome === o ? "bg-tile-2 ring-2 ring-ink" : "ring-1 ring-line hover:ring-ink/40"}`}
                    >
                      <span className="block font-semibold">{h}</span>
                      <span className="mt-1 block text-xs text-mute">{s}</span>
                    </button>
                  ))}
                </div>
                <button onClick={run} className="mt-6 flex h-13 w-full items-center justify-center gap-2 rounded-full bg-accent py-3.5 font-semibold text-on-accent active:scale-[0.98]">
                  <FfIcon size={18} /> Play the next {Math.max(1, Math.round((end - start) / 86400000))} days in 7 seconds
                </button>
              </>
            )}

            {phase !== "pick" && (
              <>
                <div className="mt-4 flex items-end justify-between">
                  <div>
                    <p className="text-xs text-mute">ETH</p>
                    <p className="tnum text-4xl font-semibold tracking-tight">{price(Math.round(nowPrice))}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-mute">{phase === "end" ? "settled" : "date"}</p>
                    <p className="tnum text-xl font-semibold">{day.toLocaleDateString("en-US", { month: "short", day: "numeric" })}</p>
                  </div>
                </div>
                <svg viewBox={`0 0 ${W} ${H}`} className="mt-4 w-full overflow-visible">
                  {/* the full-payout strike is green: K2 for an UP stance, K1 for a DOWN one */}
                  {[p.K2, p.K1].map((k) => {
                    const winLine = p.side === "UP" ? k === p.K2 : k === p.K1;
                    return (
                      <g key={k}>
                        <line x1="0" x2={W} y1={y(k)} y2={y(k)} stroke={winLine ? "var(--up)" : "var(--faint)"} strokeDasharray="5 6" strokeWidth="1.5" />
                        <text x={W} y={y(k) - 6} textAnchor="end" className={`font-mono text-[11px] ${winLine ? "fill-up" : "fill-mute"}`}>
                          {price(k)}
                        </text>
                      </g>
                    );
                  })}
                  <polyline points={pts} fill="none" stroke="var(--ink)" strokeWidth="2.5" strokeLinejoin="round" />
                  <circle cx={(n / STEPS) * W} cy={y(nowPrice)} r="5" fill="var(--accent)" stroke="var(--ink)" strokeWidth="2" />
                </svg>

                {phase === "end" && (
                  <m.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mt-6">
                    <div className="grid grid-cols-3 gap-3 border-y border-line py-4">
                      <div>
                        <p className="text-xs text-mute">Paid</p>
                        <p className="tnum text-xl font-semibold">{usd(p.cost)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-mute">Collect</p>
                        <p className="tnum text-xl font-semibold">{usd(payout)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-mute">Result</p>
                        <p className={`tnum text-xl font-semibold ${won ? "text-up" : "text-down"}`}>{usd(payout - p.cost, { sign: true })}</p>
                      </div>
                    </div>
                    {live ? (
                      <>
                        <p className="mt-4 text-center text-sm text-mute">
                          Preview. On {expiryLabel(p.expiry)}, Chainlink settles this range onchain and you collect here.
                        </p>
                        <button onClick={close} className="mt-4 w-full rounded-full bg-ink py-3.5 font-semibold text-bg">
                          Done
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => {
                          onCollect(final, payout);
                          close();
                        }}
                        className="mt-5 w-full rounded-full bg-accent py-3.5 font-semibold text-on-accent active:scale-[0.98]"
                      >
                        {payout > 0 ? `Collect ${usd(payout)}` : "Close the stance"}
                      </button>
                    )}
                  </m.div>
                )}
              </>
            )}
          </m.div>
        </m.div>
      )}
    </AnimatePresence>
  );

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex w-full items-center justify-center gap-2 rounded-full bg-tile py-3.5 text-sm font-semibold ring-1 ring-line transition hover:bg-tile-2 active:scale-[0.98]"
      >
        <FfIcon size={16} /> Fast-forward to {expiryLabel(p.expiry)}
      </button>
      {mounted && createPortal(sheet, document.body)}
    </>
  );
}
