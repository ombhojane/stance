"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence } from "motion/react";
import * as m from "motion/react-m";
import { ArrowRight, ChevronDown, TriangleAlert } from "lucide-react";
import { ASSETS, Draft, Direction, EXPIRIES, draftFromQuery, draftToQuery, expiryLabel, expiryTime, isExactExpiry, quote, roundTo } from "@/lib/market";
import { useRanges } from "@/lib/chain/live";
import { useLive } from "@/lib/mode";
import { useLiveSpot } from "@/lib/store";
import { snapTarget, useStanceQuote } from "@/lib/chain/useStanceQuote";
import { deskChance, useDesk } from "@/lib/useDesk";
import { DeskChip } from "./DeskChip";
import { pct, usd } from "@/lib/format";
import { AsciiCone } from "./AsciiCone";
import { Chip, TickSlider } from "./controls";
import { RollingNumber } from "./RollingNumber";

type Field = "amount" | "target" | "date" | null;

export function StanceHero({ syncUrl = false, draft: external, onDraft }: { syncUrl?: boolean; draft?: Draft; onDraft?: (d: Draft) => void }) {
  const router = useRouter();
  const params = useSearchParams();
  const [internal, setInternal] = useState<Draft>(() => draftFromQuery(params));
  const draft = external ?? internal;
  const setDraft = (d: Draft) => (onDraft ? onDraft(d) : setInternal(d));
  const [open, setOpen] = useState<Field>(null);
  const demoSpot = useLiveSpot(draft.asset);
  const q = useStanceQuote(draft, demoSpot);
  const desk = useDesk();
  const isLive = useLive();
  const { ranges } = useRanges();
  // onchain ranges with an exact expiry that can still be bought (the app's cutoff is 5 minutes)
  const demoExpiries = isLive
    ? [...new Set(ranges.filter((r) => isExactExpiry(r.expiryId) && !r.settled && expiryTime(r.expiryId) - 5 * 60_000 > Date.now() + 30_000).map((r) => r.expiryId))]
    : [];
  const dc = deskChance(desk, draft, q.spot, q.K1, q.K2);
  const live = q.spot; // Chainlink ETH/USD when live, simulated in demo
  const a = ASSETS[draft.asset];
  const snap = (v: number) => snapTarget(v, q.targets);
  const composer = useRef<HTMLDivElement>(null);
  const cta = useRef<HTMLButtonElement>(null);
  const [amtText, setAmtText] = useState(() => String(draft.amount));
  const [stuck, setStuck] = useState(false);

  useEffect(() => {
    if (q.live && q.targets.length && !q.targets.includes(draft.target)) setDraft({ ...draft, target: snapTarget(draft.target, q.targets) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q.live, q.targets, draft.target]);

  useEffect(() => {
    if (syncUrl) router.replace(`/make?${draftToQuery(draft)}`, { scroll: false });
  }, [draft, syncUrl, router]);

  useEffect(() => {
    const close = (e: PointerEvent) => composer.current && !composer.current.contains(e.target as Node) && setOpen(null);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(null);
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", esc);
    };
  }, []);

  // the sticky bar shows only while the real button is off screen
  useEffect(() => {
    const el = cta.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setStuck(!e.isIntersecting));
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const set = (patch: Partial<Draft>) => setDraft({ ...draft, ...patch });
  const setAmount = (v: number) => {
    const n = Math.min(50000, Math.max(50, Math.round(v)));
    setAmtText(String(n));
    set({ amount: n });
  };
  const setDir = (dir: Direction) => {
    if (dir === draft.dir) return;
    const mirrored = roundTo(2 * live - draft.target, a.grid);
    const ok = dir === "above" ? mirrored > live : mirrored < live && mirrored > a.grid;
    set({ dir, target: ok ? mirrored : roundTo(live * (dir === "above" ? 1.12 : 0.88), a.grid) });
  };
  const move = ((draft.target - live) / live) * 100;
  const toggle = (f: Field) => setOpen((o) => (o === f ? null : f));
  const review = () => q.ok && router.push(`/make/review?${draftToQuery(draft)}`);
  const up = draft.dir === "above";

  return (
    <section className="relative flex min-h-[600px] flex-col overflow-hidden rounded-[36px] bg-hero ring-1 ring-line/60 sm:min-h-[640px]">
      {/* the price cone, as a quiet field behind everything */}
      <AsciiCone quiet asset={draft.asset} dir={draft.dir} target={draft.target} expiry={draft.expiry} spot={live} chance={q.chanceFull} />
      {/* soft clearing so the sentence reads over the glyphs (no edges, not a card) */}
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_85%_28%_at_50%_57%,var(--hero-bg)_45%,transparent_100%)] sm:bg-[radial-gradient(ellipse_48%_34%_at_50%_54%,var(--hero-bg)_30%,transparent_100%)]" />

      <div className="pointer-events-none relative flex flex-1 flex-col items-center px-5 pb-12 pt-12 text-center sm:pt-14">
        <h1 className="text-[clamp(1.5rem,3.2vw,2.5rem)] font-semibold leading-[1.05] tracking-[-0.035em]">
          Trade what you think <br className="sm:hidden" />
          <span className="serif font-normal">happens next.</span>
        </h1>

        <div ref={composer} className="pointer-events-auto my-auto w-full max-w-[860px] pt-10">
          {/* the sentence */}
          <p className="text-[clamp(1.6rem,4.2vw,3rem)] font-medium leading-[1.6] tracking-[-0.025em] text-mute">
            I want to make{" "}
            <SChip tone="amount" active={open === "amount"} onClick={() => toggle("amount")}>
              {usd(draft.amount, { cents: false })}
            </SChip>{" "}
            if <span className="text-ink">ETH</span> ends{" "}
            <SChip tone="dir" caret={false} onClick={() => setDir(up ? "below" : "above")}>
              {up ? "above" : "below"}
            </SChip>{" "}
            <SChip tone={up ? "up" : "down"} active={open === "target"} onClick={() => toggle("target")}>
              <RollingNumber value={draft.target} format="price" />
            </SChip>{" "}
            on{" "}
            <SChip tone="date" active={open === "date"} onClick={() => toggle("date")}>
              {expiryLabel(draft.expiry)}
            </SChip>
          </p>

          {/* editor for the tapped word */}
          <AnimatePresence initial={false}>
              {open && (
                <m.div
                  key={open}
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ type: "spring", stiffness: 480, damping: 40 }}
                  className="overflow-hidden"
                >
                <div className="mx-auto mt-5 w-full max-w-[560px] rounded-3xl bg-tile p-4 text-left shadow-[0_30px_80px_-30px_rgba(0,0,0,.5)] ring-1 ring-line sm:p-5">
                  {open === "amount" && (
                    <div>
                      <div className="flex items-baseline">
                        <span className="text-3xl font-semibold tracking-tight">$</span>
                        <input
                          autoFocus
                          value={amtText}
                          inputMode="numeric"
                          aria-label="Amount you want to make"
                          onChange={(e) => {
                            const t = e.target.value.replace(/[^0-9]/g, "").slice(0, 5);
                            setAmtText(t);
                            const n = Number(t);
                            if (n >= 50 && n <= 50000) set({ amount: n });
                          }}
                          onBlur={() => setAmount(Number(amtText) || draft.amount)}
                          onKeyDown={(e) => e.key === "Enter" && setOpen(null)}
                          className="tnum w-full min-w-0 bg-transparent text-4xl font-semibold tracking-tight text-ink outline-none"
                        />
                      </div>
                      <input
                        type="range"
                        min={100}
                        max={10000}
                        step={50}
                        value={Math.min(10000, Math.max(100, draft.amount))}
                        onChange={(e) => setAmount(Number(e.target.value))}
                        aria-label="Amount you want to make"
                        className="mt-4 w-full accent-accent"
                      />
                    </div>
                  )}
                  {open === "target" && (
                    <div>
                      <div className="mb-1 flex items-baseline justify-between">
                        <span className="text-3xl font-semibold tracking-tight text-ink">
                          <RollingNumber value={draft.target} format="price" />
                        </span>
                        <span className={`font-mono text-sm ${move >= 0 ? "text-up" : "text-down"}`}>
                          {move >= 0 ? "+" : ""}
                          {move.toFixed(1)}%
                        </span>
                      </div>
                      <TickSlider
                        value={draft.target}
                        onChange={(v) => set({ target: snap(v) })}
                        min={Math.max(a.grid, roundTo(live * 0.6, a.grid))}
                        max={roundTo(live * 1.6, a.grid)}
                        step={a.grid}
                        marker={{ value: live, label: "now" }}
                        tone={up ? "up" : "down"}
                      />
                      <div className="mt-3 flex flex-wrap gap-2">
                        {(q.targets.length
                          ? q.targets.map((v) => Math.round(((v - live) / live) * 100))
                          : up ? [5, 10, 20, 35] : [-5, -10, -20, -35]
                        ).map((p, i) => {
                          const v = q.targets.length ? q.targets[i] : roundTo(live * (1 + p / 100), a.grid);
                          return (
                            <Chip key={`${p}-${i}`} active={draft.target === v} onClick={() => set({ target: v })}>
                              {p > 0 ? "+" : ""}
                              {p}%
                            </Chip>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  {open === "date" && (
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      {/* live onchain ranges with an exact expiry (demo ranges), while still tradeable */}
                      {demoExpiries.map((id) => {
                        const on = draft.expiry === id;
                        return (
                          <button
                            key={id}
                            onClick={() => {
                              set({ expiry: id });
                              setOpen(null);
                            }}
                            className={`rounded-2xl p-3.5 text-left transition active:scale-[0.98] ${on ? "bg-tile-2 ring-2 ring-up" : "bg-tile-2/60 hover:bg-tile-2"}`}
                          >
                            <p className="font-semibold text-ink">{expiryLabel(id)}</p>
                            <p className="mt-2 font-mono text-xs text-odds">demo · settles in {Math.max(1, Math.round((expiryTime(id) - Date.now()) / 60000))}m</p>
                          </button>
                        );
                      })}
                      {EXPIRIES.map((e) => {
                        const alt = quote({ ...draft, expiry: e.id }, live);
                        const on = draft.expiry === e.id;
                        return (
                          <button
                            key={e.id}
                            onClick={() => {
                              set({ expiry: e.id });
                              setOpen(null);
                            }}
                            className={`rounded-2xl p-3.5 text-left transition active:scale-[0.98] ${on ? "bg-tile-2 ring-2 ring-up" : "bg-tile-2/60 hover:bg-tile-2"}`}
                          >
                            <p className="font-semibold text-ink">{e.label}</p>
                            <p className="tnum mt-2 font-mono text-xs">
                              <span className="text-odds">{pct(alt.chanceFull)}</span> <span className="text-mute">· {usd(alt.cost)}</span>
                            </p>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
                </m.div>
              )}
          </AnimatePresence>

          {/* what it costs, and go */}
          <div className="mt-10 flex flex-wrap items-center justify-center gap-x-6 gap-y-4">
            <p className="tnum text-lg text-mute">
              You pay{" "}
              <span className="font-semibold text-ink">
                <RollingNumber value={q.cost} format="usd" />
              </span>
              <span className="mx-2 text-faint">·</span>
              <span className="text-odds">{pct(dc ?? q.chanceFull)}</span> chance <DeskChip desk={desk} expiry={draft.expiry} textbook={q.chanceFull} deskC={dc} />
            </p>
            <button
              ref={cta}
              disabled={!q.ok}
              onClick={review}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-accent px-7 font-semibold text-on-accent transition hover:brightness-105 active:scale-[0.98] disabled:opacity-40"
            >
              Review trade <ArrowRight size={17} />
            </button>
          </div>

          <AnimatePresence>
            {q.nudge?.tone === "warn" && (
              <m.p
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="mx-auto mt-4 flex w-fit items-center gap-2 rounded-full bg-down-deep px-4 py-2 text-sm text-down"
              >
                <TriangleAlert size={15} />
                {q.live ? q.nudge.text.split(".")[0] + "." : "Already there. Pick a target further away."}
              </m.p>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* sticky bar while the button is off screen */}
      <AnimatePresence>
        {stuck && (
          <m.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            transition={{ type: "spring", stiffness: 420, damping: 38 }}
            className="fixed inset-x-0 bottom-[76px] z-40 flex justify-center px-4 md:bottom-4"
          >
            <div className="flex items-center gap-4 rounded-full bg-tile/90 py-2 pl-5 pr-2 shadow-[0_18px_50px_-18px_rgba(0,0,0,.5)] ring-1 ring-line backdrop-blur">
              <span className="text-sm text-mute">
                You pay <span className="tnum font-semibold text-ink">{usd(q.cost)}</span>
              </span>
              <button
                disabled={!q.ok}
                onClick={review}
                className="inline-flex h-10 items-center gap-1.5 rounded-full bg-accent px-5 text-sm font-semibold text-on-accent transition hover:brightness-105 active:scale-[0.98] disabled:opacity-40"
              >
                Review trade <ArrowRight size={15} />
              </button>
            </div>
          </m.div>
        )}
      </AnimatePresence>
    </section>
  );
}

// ── Sentence chip: a word of the sentence you can change ────────────────
// light: white chips with coloured words (tints vanish on the lime hero); dark: tinted chips
const TONES = {
  amount: "bg-tile text-sun dark:bg-sun/15",
  date: "bg-tile text-odds dark:bg-odds-deep",
  up: "bg-tile text-up dark:bg-up-deep",
  down: "bg-tile text-down dark:bg-down-deep",
  dir: "bg-ink text-bg dark:bg-tile-3 dark:text-ink",
} as const;

function SChip({ tone, active, caret = true, onClick, children }: { tone: keyof typeof TONES; active?: boolean; caret?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-expanded={caret ? !!active : undefined}
      className={`inline-flex h-[1.35em] items-center gap-0.5 rounded-[0.45em] px-[0.32em] align-[-0.18em] font-semibold tracking-tight transition hover:ring-2 hover:ring-current/20 active:scale-[0.98] ${TONES[tone]} ${active ? "ring-2 ring-current/30" : ""}`}
    >
      {children}
      {caret && <ChevronDown className={`size-[0.6em] opacity-50 transition-transform ${active ? "rotate-180" : ""}`} />}
    </button>
  );
}
