"use client";

import { useId, useMemo, useRef, useState, memo } from "react";
import { ASSETS, AssetId, Side, unitPayout, yearsUntil } from "@/lib/market";
import { price, usd } from "@/lib/format";

interface Props {
  asset: AssetId;
  side: Side;
  K1: number;
  K2: number;
  units: number;
  cost: number;
  spot: number;
  expiry: string;
  settlePrice?: number;
  scrub?: boolean;
  showOdds?: boolean;
  compact?: boolean;
  initialScrub?: number;
}

const W = 640;

function PayoffRampClassicImpl({ asset, side, K1, K2, units, cost, spot, expiry, settlePrice, scrub = true, showOdds = true, compact = false, initialScrub }: Props) {
  const uid = useId().replace(/:/g, "");
  const H = compact ? 120 : 260;
  const padX = compact ? 6 : 18;
  const padTop = compact ? 10 : 22;
  const padBottom = compact ? 10 : 40;
  const width = K2 - K1;
  const a = ASSETS[asset];

  const lo = Math.max(0, Math.min(K1 - width * 0.8, spot - width * 0.25));
  const hi = Math.max(K2 + width * 0.8, spot + width * 0.25);
  const pnl = (S: number) => units * unitPayout(side, S, K1, K2) - cost;
  const maxP = units * width - cost;
  const minP = -cost;
  const yPad = (maxP - minP) * 0.14;
  const y0 = maxP + yPad;
  const y1 = minP - yPad;

  const sx = (S: number) => padX + ((S - lo) / (hi - lo)) * (W - padX * 2);
  const sy = (v: number) => padTop + ((y0 - v) / (y0 - y1)) * (H - padTop - padBottom);
  const xToS = (x: number) => lo + ((x - padX) / (W - padX * 2)) * (hi - lo);

  const pts = [lo, K1, K2, hi].map((S) => [sx(S), sy(pnl(S))] as const);
  const line = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const zeroY = sy(0);
  const area = `${line} L${sx(hi)},${zeroY} L${sx(lo)},${zeroY} Z`;
  const breakeven = side === "UP" ? K1 + cost / units : K2 - cost / units;

  // lognormal density of where the market thinks price lands
  const odds = useMemo(() => {
    if (!showOdds) return "";
    const t = yearsUntil(expiry);
    const sd = a.vol * Math.sqrt(t);
    const mu = Math.log(spot) - (sd * sd) / 2;
    const n = 80;
    const xs = Array.from({ length: n + 1 }, (_, i) => lo + ((hi - lo) * i) / n);
    const ys = xs.map((S) => (S <= 0 ? 0 : Math.exp(-((Math.log(S) - mu) ** 2) / (2 * sd * sd)) / (S * sd * Math.sqrt(2 * Math.PI))));
    const m = Math.max(...ys) || 1;
    const base = H - padBottom;
    const hgt = (H - padTop - padBottom) * 0.34;
    return `M${sx(lo)},${base} ` + xs.map((S, i) => `L${sx(S).toFixed(1)},${(base - (ys[i] / m) * hgt).toFixed(1)}`).join(" ") + ` L${sx(hi)},${base} Z`;
  }, [showOdds, expiry, a.vol, spot, lo, hi, H, padBottom, padTop]);

  const [S, setS] = useState(initialScrub ?? settlePrice ?? (side === "UP" ? K2 : K1));
  const svg = useRef<SVGSVGElement>(null);
  const onMove = (clientX: number) => {
    const r = svg.current!.getBoundingClientRect();
    const x = ((clientX - r.left) / r.width) * W;
    const v = Math.min(hi, Math.max(lo, xToS(x)));
    setS(v);
  };
  const scrubP = pnl(S);
  const scrubPayout = units * unitPayout(side, S, K1, K2);
  const posColor = "var(--color-up)";
  const negColor = "var(--color-down)";

  return (
    <div className="w-full">
      {scrub && !compact && (
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2 text-sm">
          <span className="text-mute">
            If {asset} ends at <span className="tnum font-semibold text-ink">{price(Math.round(S))}</span>
          </span>
          <span className="tnum">
            you get <span className="font-semibold">{usd(scrubPayout)}</span>{" "}
            <span className={scrubP >= 0 ? "text-up" : "text-down"}>({usd(scrubP, { sign: true })})</span>
          </span>
        </div>
      )}
      <svg
        ref={svg}
        viewBox={`0 0 ${W} ${H}`}
        className={`w-full touch-none ${scrub && !compact ? "cursor-ew-resize" : ""}`}
        onPointerDown={(e) => {
          if (!scrub || compact) return;
          (e.target as Element).setPointerCapture?.(e.pointerId);
          onMove(e.clientX);
        }}
        onPointerMove={(e) => scrub && !compact && e.buttons === 1 && onMove(e.clientX)}
        role="img"
        aria-label={`Payoff: lose up to ${usd(cost)}, make up to ${usd(maxP)}`}
      >
        <defs>
          <clipPath id={`above-${uid}`}>
            <rect x="0" y="0" width={W} height={zeroY} />
          </clipPath>
          <clipPath id={`below-${uid}`}>
            <rect x="0" y={zeroY} width={W} height={H - zeroY} />
          </clipPath>
          <linearGradient id={`gu-${uid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={posColor} stopOpacity="0.38" />
            <stop offset="1" stopColor={posColor} stopOpacity="0.04" />
          </linearGradient>
          <linearGradient id={`gd-${uid}`} x1="0" y1="1" x2="0" y2="0">
            <stop offset="0" stopColor={negColor} stopOpacity="0.38" />
            <stop offset="1" stopColor={negColor} stopOpacity="0.04" />
          </linearGradient>
        </defs>

        {showOdds && odds && <path d={odds} fill="var(--color-odds)" opacity={compact ? 0.07 : 0.09} />}

        <path d={area} fill={`url(#gu-${uid})`} clipPath={`url(#above-${uid})`} />
        <path d={area} fill={`url(#gd-${uid})`} clipPath={`url(#below-${uid})`} />
        <line x1={padX} x2={W - padX} y1={zeroY} y2={zeroY} stroke="var(--color-tile-3)" strokeDasharray="3 5" />

        <path d={line} fill="none" stroke={posColor} strokeWidth={compact ? 2.5 : 3.5} strokeLinejoin="round" clipPath={`url(#above-${uid})`} />
        <path d={line} fill="none" stroke={negColor} strokeWidth={compact ? 2.5 : 3.5} strokeLinejoin="round" clipPath={`url(#below-${uid})`} />

        {/* today */}
        {settlePrice === undefined && (
          <>
            <line x1={sx(spot)} x2={sx(spot)} y1={padTop - 6} y2={H - padBottom} stroke="var(--color-mute)" strokeDasharray="2 4" opacity="0.7" />
            {!compact && (
              <text x={sx(spot)} y={padTop - 10} textAnchor="middle" fontSize="11" fill="var(--color-mute)">
                today {price(Math.round(spot))}
              </text>
            )}
          </>
        )}
        {settlePrice !== undefined && !compact && (
          <text x={sx(settlePrice)} y={padTop - 10} textAnchor="middle" fontSize="11" fill="var(--color-sun)">
            settled {price(Math.round(settlePrice))}
          </text>
        )}

        {settlePrice !== undefined && (
          <g>
            <line x1={sx(settlePrice)} x2={sx(settlePrice)} y1={padTop} y2={H - padBottom} stroke="var(--color-sun)" strokeWidth="2" />
            <circle cx={sx(settlePrice)} cy={sy(pnl(settlePrice))} r={compact ? 4 : 7} fill="var(--color-sun)" stroke="var(--color-bg)" strokeWidth="3" />
          </g>
        )}

        {!compact && (
          <>
            {/* breakeven */}
            <circle cx={sx(breakeven)} cy={zeroY} r="5" fill="var(--color-bg)" stroke="var(--color-ink)" strokeWidth="2" />
            {/* axis labels */}
            {[K1, K2].map((k) => (
              <g key={k}>
                <line x1={sx(k)} x2={sx(k)} y1={H - padBottom} y2={H - padBottom + 6} stroke="var(--color-faint)" />
                <text x={sx(k)} y={H - padBottom + 22} textAnchor="middle" fontSize="12" fill="var(--color-mute)" className="tnum">
                  {price(k)}
                </text>
              </g>
            ))}
            {scrub && (
              <g pointerEvents="none">
                <line x1={sx(S)} x2={sx(S)} y1={padTop} y2={H - padBottom} stroke="var(--color-ink)" strokeWidth="1.5" opacity="0.8" />
                <circle cx={sx(S)} cy={sy(scrubP)} r="8" fill={scrubP >= 0 ? posColor : negColor} stroke="var(--color-bg)" strokeWidth="3" />
              </g>
            )}
          </>
        )}
      </svg>
      {!compact && (
        <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-mute">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-up" /> profit
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-down" /> loss
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full border-2 border-ink" /> breakeven {price(Math.round(breakeven))}
          </span>
          {showOdds && (
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-3 rounded-sm bg-odds/40" /> where the market thinks {asset} lands
            </span>
          )}
          {scrub && <span className="ml-auto">drag the chart to try prices</span>}
        </div>
      )}
    </div>
  );
}

/** Memoised: re-renders only when its numbers change. */
export const PayoffRampClassic = memo(PayoffRampClassicImpl);
