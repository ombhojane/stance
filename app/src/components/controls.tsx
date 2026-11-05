"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useMotionValue, useTransform, animate } from "motion/react";
import { Minus, Plus, ChevronsRight, Check } from "lucide-react";
import { RollingNumber } from "./RollingNumber";
import { AssetId, ASSETS } from "@/lib/market";

// ── Tile ────────────────────────────────────────────────────────────────
export function Tile({ className = "", children, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`rounded-[var(--radius-tile)] border border-line/70 bg-tile ${className}`} {...rest}>
      {children}
    </div>
  );
}

// ── Buttons ─────────────────────────────────────────────────────────────
type BtnProps = React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" | "soft" | "down"; size?: "md" | "lg" };
export function Button({ variant = "primary", size = "md", className = "", children, ...rest }: BtnProps) {
  const v = {
    primary: "bg-accent text-on-accent hover:brightness-105",
    soft: "bg-tile-3 text-ink hover:bg-[#2f2f34]",
    ghost: "bg-transparent text-mute hover:text-ink hover:bg-tile-2",
    down: "bg-down text-on-accent hover:brightness-105",
  }[variant];
  const s = size === "lg" ? "h-14 px-7 text-base" : "h-11 px-5 text-sm";
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-full font-semibold transition active:scale-[0.97] disabled:opacity-40 ${v} ${s} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

export function Chip({ active, className = "", children, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return (
    <button
      className={`rounded-full px-3.5 py-2 text-sm font-medium transition active:scale-95 ${active ? "bg-ink text-bg" : "bg-tile-2 text-mute hover:text-ink"} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

// ── Asset badge ─────────────────────────────────────────────────────────
export function AssetDot({ asset, size = 22 }: { asset: AssetId; size?: number }) {
  const a = ASSETS[asset];
  const glyph = { ETH: "Ξ", BTC: "₿", SOL: "◎" }[asset];
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full font-bold text-[#0a0a0b]"
      style={{ width: size, height: size, background: a.hue, fontSize: size * 0.55 }}
      aria-hidden
    >
      {glyph}
    </span>
  );
}

// ── Stepper (− 500 +) with press-and-hold acceleration ──────────────────
export function Stepper({ value, onChange, step, min, max }: { value: number; onChange: (v: number) => void; step: number; min: number; max: number }) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const valRef = useRef(value);
  valRef.current = value;

  const nudge = (dir: 1 | -1) => {
    const next = Math.min(max, Math.max(min, valRef.current + dir * step));
    valRef.current = next;
    onChange(next);
  };
  const hold = (dir: 1 | -1) => {
    nudge(dir);
    let delay = 320;
    const tick = () => {
      nudge(dir);
      delay = Math.max(50, delay * 0.8);
      timer.current = setTimeout(tick, delay);
    };
    timer.current = setTimeout(tick, delay);
  };
  const stop = () => {
    if (timer.current) clearTimeout(timer.current);
  };
  useEffect(() => stop, []);

  return (
    <div className="inline-flex items-center gap-2 rounded-2xl bg-tile-2 p-1.5">
      <button
        aria-label="Decrease"
        onPointerDown={() => hold(-1)}
        onPointerUp={stop}
        onPointerLeave={stop}
        className="flex h-11 w-11 items-center justify-center rounded-xl bg-tile-3 text-ink transition active:scale-90"
      >
        <Minus size={18} />
      </button>
      <span className="min-w-[110px] text-center text-3xl font-semibold">
        <RollingNumber value={value} format="usd0" />
      </span>
      <button
        aria-label="Increase"
        onPointerDown={() => hold(1)}
        onPointerUp={stop}
        onPointerLeave={stop}
        className="flex h-11 w-11 items-center justify-center rounded-xl bg-tile-3 text-ink transition active:scale-90"
      >
        <Plus size={18} />
      </button>
    </div>
  );
}

// ── Tick slider (bencho-style) ──────────────────────────────────────────
export function TickSlider({
  value,
  onChange,
  min,
  max,
  step,
  marker,
  tone = "up",
}: {
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step: number;
  marker?: { value: number; label: string };
  tone?: "up" | "down";
}) {
  const ref = useRef<HTMLDivElement>(null);
  const count = 48;
  const frac = (value - min) / (max - min);
  const setFromX = (clientX: number) => {
    const r = ref.current!.getBoundingClientRect();
    const f = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
    const v = Math.round((min + f * (max - min)) / step) * step;
    if (v !== value) onChange(v);
  };
  const markerFrac = marker ? (marker.value - min) / (max - min) : null;
  const color = tone === "up" ? "var(--color-up)" : "var(--color-down)";

  return (
    <div className="select-none">
      <div
        ref={ref}
        role="slider"
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight" || e.key === "ArrowUp") onChange(Math.min(max, value + step));
          if (e.key === "ArrowLeft" || e.key === "ArrowDown") onChange(Math.max(min, value - step));
        }}
        onPointerDown={(e) => {
          (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
          setFromX(e.clientX);
        }}
        onPointerMove={(e) => e.buttons === 1 && setFromX(e.clientX)}
        className="relative flex h-16 cursor-ew-resize touch-none items-end justify-between rounded-2xl px-1 outline-none focus-visible:ring-2 focus-visible:ring-up/50"
      >
        {Array.from({ length: count }).map((_, i) => {
          const f = i / (count - 1);
          const lit = tone === "up" ? f >= frac - 0.0001 : f <= frac + 0.0001;
          const near = Math.abs(f - frac) < 0.5 / count;
          return (
            <span
              key={i}
              className="w-[3px] rounded-full transition-all duration-150"
              style={{
                height: near ? 40 : i % 6 === 0 ? 24 : 16,
                background: near ? "var(--color-ink)" : lit ? color : "var(--color-tile-3)",
                opacity: lit || near ? 1 : 0.9,
              }}
            />
          );
        })}
        {markerFrac !== null && markerFrac >= 0 && markerFrac <= 1 && (
          <span className="pointer-events-none absolute -top-1 -translate-x-1/2 text-[10px] font-medium text-mute" style={{ left: `${markerFrac * 100}%` }}>
            {marker!.label}
            <span className="mx-auto mt-0.5 block h-1.5 w-1.5 rounded-full bg-mute" />
          </span>
        )}
      </div>
    </div>
  );
}

// ── Slide to confirm ────────────────────────────────────────────────────
export function SlideToConfirm({ label, onConfirm, disabled, tone = "up" }: { label: string; onConfirm: () => void; disabled?: boolean; tone?: "up" | "down" }) {
  const track = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(320);
  const [done, setDone] = useState(false);
  const x = useMotionValue(0);
  const thumb = 56;
  const max = Math.max(0, width - thumb - 8);
  const fill = useTransform(x, (v) => v + thumb + 4);
  const labelOpacity = useTransform(x, [0, max * 0.6], [1, 0]);

  useEffect(() => {
    const el = track.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.offsetWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const bg = tone === "up" ? "bg-accent" : "bg-down";

  return (
    <div ref={track} className={`relative h-16 w-full overflow-hidden rounded-full bg-tile-2 ${disabled ? "opacity-40" : ""}`}>
      <motion.div className={`absolute inset-y-1 left-1 rounded-full ${bg} opacity-25`} style={{ width: fill }} />
      <motion.span style={{ opacity: labelOpacity }} className="pointer-events-none absolute inset-0 flex items-center justify-center pl-10 text-sm font-semibold text-ink">
        {done ? "" : label}
        <span className="ml-2 inline-flex text-mute">
          <ChevronsRight size={16} className="animate-pulse" />
        </span>
      </motion.span>
      <motion.button
        aria-label={label}
        disabled={disabled || done}
        drag={disabled || done ? false : "x"}
        dragConstraints={{ left: 0, right: max }}
        dragElastic={0.04}
        dragMomentum={false}
        style={{ x }}
        onDragEnd={() => {
          if (x.get() > max * 0.88) {
            animate(x, max, { type: "spring", stiffness: 500, damping: 40 });
            setDone(true);
            setTimeout(onConfirm, 260);
          } else {
            animate(x, 0, { type: "spring", stiffness: 500, damping: 30 });
          }
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !disabled && !done) {
            animate(x, max, { duration: 0.3 });
            setDone(true);
            setTimeout(onConfirm, 320);
          }
        }}
        className={`absolute left-1 top-1 flex h-14 w-14 items-center justify-center rounded-full ${bg} text-on-accent shadow-lg active:cursor-grabbing`}
      >
        {done ? <Check size={22} strokeWidth={3} /> : <ChevronsRight size={22} strokeWidth={2.5} />}
      </motion.button>
    </div>
  );
}

// ── Odds ring ───────────────────────────────────────────────────────────
export function OddsRing({ p, size = 88, stroke = 9, tone = "odds", children }: { p: number; size?: number; stroke?: number; tone?: "odds" | "up" | "down"; children?: React.ReactNode }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const color = { odds: "var(--color-odds)", up: "var(--color-up)", down: "var(--color-down)" }[tone];
  return (
    <span className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="var(--color-tile-3)" strokeWidth={stroke} fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - Math.min(1, Math.max(0, p)))}
          style={{ transition: "stroke-dashoffset 600ms cubic-bezier(.2,1,.3,1)" }}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center">{children}</span>
    </span>
  );
}

// ── Segmented toggle ────────────────────────────────────────────────────
export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: React.ReactNode }[]; onChange: (v: T) => void }) {
  return (
    <div className="inline-flex rounded-full bg-tile-2 p-1">
      {options.map((o) => (
        <button key={o.value} onClick={() => onChange(o.value)} className="relative rounded-full px-4 py-2 text-sm font-medium">
          {value === o.value && <motion.span layoutId={`seg-${options.map((x) => x.value).join("")}`} className="absolute inset-0 rounded-full bg-tile-3" transition={{ type: "spring", stiffness: 500, damping: 38 }} />}
          <span className={`relative ${value === o.value ? "text-ink" : "text-mute"}`}>{o.label}</span>
        </button>
      ))}
    </div>
  );
}
