"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { ArrowDownRight, ArrowRight, ArrowUpRight, CalendarDays, Coins, Flag, Info, TriangleAlert } from "lucide-react";
import { ASSETS, ASSET_LIST, AssetId, Draft, Direction, EXPIRIES, draftFromQuery, draftToQuery, expiryLabel, quote, roundTo } from "@/lib/market";
import { useLiveSpot } from "@/lib/store";
import { pct, price, usd } from "@/lib/format";
import { AsciiCone } from "./AsciiCone";
import { AssetDot, Chip, OddsRing, Stepper, TickSlider } from "./controls";
import { RollingNumber } from "./RollingNumber";

type Field = "amount" | "target" | "date" | null;

export function StanceHero({ syncUrl = false, draft: external, onDraft }: { syncUrl?: boolean; draft?: Draft; onDraft?: (d: Draft) => void }) {
  const router = useRouter();
  const params = useSearchParams();
  const [internal, setInternal] = useState<Draft>(() => draftFromQuery(params));
  const draft = external ?? internal;
  const setDraft = (d: Draft) => (onDraft ? onDraft(d) : setInternal(d));
  const [open, setOpen] = useState<Field>(null);
  const live = useLiveSpot(draft.asset);
  const q = useMemo(() => quote(draft), [draft]);
  const a = ASSETS[draft.asset];
  const bar = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (syncUrl) router.replace(`/make?${draftToQuery(draft)}`, { scroll: false });
  }, [draft, syncUrl, router]);

  useEffect(() => {
    const close = (e: PointerEvent) => bar.current && !bar.current.contains(e.target as Node) && setOpen(null);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(null);
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", esc);
    };
  }, []);

  const set = (patch: Partial<Draft>) => setDraft({ ...draft, ...patch });
  const setAsset = (id: AssetId) => {
    if (id === draft.asset) return;
    const ratio = draft.target / ASSETS[draft.asset].spot;
    const n = ASSETS[id];
    set({ asset: id, target: Math.max(n.grid, roundTo(n.spot * ratio, n.grid)) });
  };
  const setDir = (dir: Direction) => {
    if (dir === draft.dir) return;
    const mirrored = roundTo(2 * a.spot - draft.target, a.grid);
    const ok = dir === "above" ? mirrored > a.spot : mirrored < a.spot && mirrored > a.grid;
    set({ dir, target: ok ? mirrored : roundTo(a.spot * (dir === "above" ? 1.12 : 0.88), a.grid) });
  };
  const move = ((draft.target - a.spot) / a.spot) * 100;
  const toggle = (f: Field) => setOpen((o) => (o === f ? null : f));

  return (
    <section className="relative">
      {/* ── Visual ── */}
      <div className="relative h-[560px] overflow-hidden rounded-[36px] bg-hero ring-1 ring-line/60 sm:h-[660px]">
        <AsciiCone asset={draft.asset} dir={draft.dir} target={draft.target} expiry={draft.expiry} spot={live} chance={q.chanceFull} onTarget={(v) => set({ target: v })} />
        <div className="pointer-events-none absolute inset-x-0 top-0 flex flex-col items-center px-4 pt-9 text-center sm:pt-12">
          <span className="inline-flex items-center gap-3 rounded-full bg-tile/80 px-3 py-1.5 font-mono text-[11px] text-mute backdrop-blur">
            <span className="live-dot" />
            {ASSET_LIST.map((x) => (
              <span key={x.id} className={x.id === draft.asset ? "text-ink" : ""}>
                {x.id} {price(x.id === draft.asset ? Math.round(live) : x.spot)}
              </span>
            ))}
          </span>
          <h1 className="mt-5 text-[clamp(2.4rem,6.2vw,5rem)] font-semibold leading-[0.95] tracking-[-0.04em]">
            Trade what you think
            <br />
            <span className="serif font-normal">happens next.</span>
          </h1>
        </div>
        <span className="pointer-events-none absolute bottom-[132px] left-6 hidden font-mono text-[11px] text-mute sm:block">↕ drag the flag</span>
      </div>

      {/* ── Composer (docked like a search bar) ── */}
      <div ref={bar} className="relative z-20 mx-auto -mt-[118px] w-full max-w-[1000px] px-2 sm:px-6">
        {/* asset tabs */}
        <div className="flex">
          {ASSET_LIST.map((x) => {
            const on = x.id === draft.asset;
            return (
              <button
                key={x.id}
                onClick={() => setAsset(x.id)}
                className={`flex items-center gap-2 rounded-t-2xl px-4 py-2.5 text-sm font-semibold transition sm:px-5 ${on ? "bg-tile text-ink" : "bg-tile/70 text-mute backdrop-blur hover:text-ink"}`}
              >
                <AssetDot asset={x.id} size={18} /> {x.id}
              </button>
            );
          })}
        </div>

        <div className="rounded-[28px] rounded-tl-none bg-tile p-3 shadow-[0_30px_80px_-30px_rgba(0,0,0,.45)] ring-1 ring-line sm:p-4">
          {/* direction tabs */}
          <div className="flex gap-5 px-2 pb-3 pt-1 text-sm">
            {(["above", "below"] as Direction[]).map((d) => (
              <button key={d} onClick={() => setDir(d)} className={`relative pb-1.5 font-medium transition ${draft.dir === d ? "text-ink" : "text-mute hover:text-ink"}`}>
                {d === "above" ? "Goes up" : "Goes down"}
                {draft.dir === d && <motion.span layoutId="dir-underline" className={`absolute inset-x-0 -bottom-0.5 h-0.5 rounded-full ${d === "above" ? "bg-up" : "bg-down"}`} />}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-2 lg:grid-cols-[1fr_1fr_1fr_1.05fr_auto]">
            <FieldBtn icon={<Coins size={15} />} label="Make" active={open === "amount"} onClick={() => toggle("amount")}>
              <span className="text-up">{usd(draft.amount, { cents: false })}</span>
            </FieldBtn>
            <FieldBtn
              icon={draft.dir === "above" ? <ArrowUpRight size={15} /> : <ArrowDownRight size={15} />}
              label={draft.dir === "above" ? "If above" : "If below"}
              active={open === "target"}
              onClick={() => toggle("target")}
            >
              <RollingNumber value={draft.target} format="price" />
            </FieldBtn>
            <FieldBtn icon={<CalendarDays size={15} />} label="By" active={open === "date"} onClick={() => toggle("date")}>
              {expiryLabel(draft.expiry)}
            </FieldBtn>
            <div className="flex items-center gap-3 rounded-2xl px-3 py-2.5">
              <OddsRing p={q.chanceFull} size={44} stroke={5}>
                <span className="text-[11px] font-semibold">{pct(q.chanceFull)}</span>
              </OddsRing>
              <div className="leading-tight">
                <p className="text-xs text-mute">Costs</p>
                <p className="text-lg font-semibold">
                  <RollingNumber value={q.cost} format="usd" />
                </p>
              </div>
            </div>
            <button
              disabled={!q.ok}
              onClick={() => router.push(`/make/review?${draftToQuery(draft)}`)}
              className="col-span-2 inline-flex h-14 items-center justify-center gap-2 rounded-2xl bg-accent px-7 font-semibold text-on-accent transition hover:brightness-105 active:scale-[0.98] disabled:opacity-40 lg:col-span-1 lg:h-full lg:rounded-full"
            >
              <Flag size={17} /> Take stance <ArrowRight size={17} />
            </button>
          </div>

          {/* popover editors */}
          <AnimatePresence>
            {open && (
              <motion.div
                key={open}
                initial={{ opacity: 0, y: -6, height: 0 }}
                animate={{ opacity: 1, y: 0, height: "auto" }}
                exit={{ opacity: 0, y: -6, height: 0 }}
                transition={{ type: "spring", stiffness: 420, damping: 36 }}
                className="overflow-hidden"
              >
                <div className="mt-3 rounded-2xl bg-tile-2 p-4 sm:p-5">
                  {open === "amount" && (
                    <div className="flex flex-wrap items-center gap-4">
                      <Stepper value={draft.amount} onChange={(v) => set({ amount: v })} step={50} min={50} max={50000} />
                      <div className="flex flex-wrap gap-2">
                        {[100, 250, 500, 1000, 5000].map((v) => (
                          <Chip key={v} active={draft.amount === v} onClick={() => set({ amount: v })}>
                            {usd(v, { cents: false })}
                          </Chip>
                        ))}
                      </div>
                    </div>
                  )}
                  {open === "target" && (
                    <div>
                      <div className="mb-1 flex items-baseline justify-between">
                        <span className="text-3xl font-semibold tracking-tight">
                          <RollingNumber value={draft.target} format="price" />
                        </span>
                        <span className={`font-mono text-sm ${move >= 0 ? "text-up" : "text-down"}`}>
                          {move >= 0 ? "+" : ""}
                          {move.toFixed(1)}%
                        </span>
                      </div>
                      <TickSlider
                        value={draft.target}
                        onChange={(v) => set({ target: v })}
                        min={Math.max(a.grid, roundTo(a.spot * 0.6, a.grid))}
                        max={roundTo(a.spot * 1.6, a.grid)}
                        step={a.grid}
                        marker={{ value: a.spot, label: "now" }}
                        tone={draft.dir === "above" ? "up" : "down"}
                      />
                      <div className="mt-3 flex flex-wrap gap-2">
                        {(draft.dir === "above" ? [5, 10, 20, 35] : [-5, -10, -20, -35]).map((p) => {
                          const v = roundTo(a.spot * (1 + p / 100), a.grid);
                          return (
                            <Chip key={p} active={draft.target === v} onClick={() => set({ target: v })}>
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
                      {EXPIRIES.map((e) => {
                        const alt = quote({ ...draft, expiry: e.id });
                        const on = draft.expiry === e.id;
                        return (
                          <button
                            key={e.id}
                            onClick={() => set({ expiry: e.id })}
                            className={`rounded-2xl p-3.5 text-left transition active:scale-[0.98] ${on ? "bg-tile ring-2 ring-up" : "bg-tile/60 hover:bg-tile"}`}
                          >
                            <p className="font-semibold">{e.label}</p>
                            <p className="tnum mt-2 font-mono text-xs">
                              <span className="text-odds">{pct(alt.chanceFull)}</span> <span className="text-mute">· {usd(alt.cost)}</span>
                            </p>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <AnimatePresence>
          {q.nudge && (
            <motion.p
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className={`mx-auto mt-3 flex w-fit items-center gap-2 rounded-full px-4 py-2 text-sm ${q.nudge.tone === "warn" ? "bg-down-deep text-down" : "bg-odds-deep text-odds"}`}
            >
              {q.nudge.tone === "warn" ? <TriangleAlert size={15} /> : <Info size={15} />}
              {q.nudge.tone === "warn" ? "Already there. Pick a target further away." : q.nudge.text.split(".")[0] + "."}
            </motion.p>
          )}
        </AnimatePresence>
      </div>
    </section>
  );
}

function FieldBtn({ icon, label, active, onClick, children }: { icon: React.ReactNode; label: string; active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className={`rounded-2xl px-3 py-2.5 text-left transition ${active ? "bg-tile-2 ring-1 ring-line" : "hover:bg-tile-2"}`}>
      <span className="flex items-center gap-1.5 text-xs font-medium text-mute">
        {icon} {label}
      </span>
      <span className="mt-0.5 block text-xl font-semibold tracking-tight">{children}</span>
    </button>
  );
}
