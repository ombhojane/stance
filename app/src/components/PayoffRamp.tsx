"use client";

import { useRef, useState, memo } from "react";
import { AssetId, Side, unitPayout } from "@/lib/market";
import { price, usd } from "@/lib/format";

interface Props {
  asset: AssetId;
  side: Side;
  K1: number;
  K2: number;
  units: number;
  cost: number;
  spot: number;
  expiry?: string;
  settlePrice?: number;
  scrub?: boolean;
  compact?: boolean;
  initialScrub?: number;
  /** kept for call-site compatibility; the chart no longer draws a density band */
  showOdds?: boolean;
}

const W = 640;

/** What you'd make or lose at every ending price. One line, plain labels. */
function PayoffRampImpl({ asset, side, K1, K2, units, cost, spot, settlePrice, scrub = true, compact = false, initialScrub }: Props) {
  const H = compact ? 72 : 220;
  const padX = compact ? 2 : 12;
  const padTop = compact ? 6 : 28;
  const padBottom = compact ? 6 : 34;
  const width = K2 - K1;
  const lo = Math.max(0, Math.min(K1 - width * 0.7, spot - width * 0.2));
  const hi = Math.max(K2 + width * 0.7, spot + width * 0.2);
  const pnl = (S: number) => units * unitPayout(side, S, K1, K2) - cost;
  const maxP = units * width - cost;
  const minP = -cost;
  const span = maxP - minP;
  const y0 = maxP + span * 0.08;
  const y1 = minP - span * 0.08;
  const sx = (S: number) => padX + ((S - lo) / (hi - lo)) * (W - padX * 2);
  const sy = (v: number) => padTop + ((y0 - v) / (y0 - y1)) * (H - padTop - padBottom);
  const xToS = (x: number) => lo + ((x - padX) / (W - padX * 2)) * (hi - lo);
  const line = [lo, K1, K2, hi].map((S, i) => `${i ? "L" : "M"}${sx(S).toFixed(1)},${sy(pnl(S)).toFixed(1)}`).join(" ");
  const zeroY = sy(0);
  const breakeven = side === "UP" ? K1 + cost / units : K2 - cost / units;

  const [S, setS] = useState(initialScrub ?? settlePrice ?? (side === "UP" ? K2 : K1));
  const svg = useRef<SVGSVGElement>(null);
  const onMove = (clientX: number) => {
    const r = svg.current!.getBoundingClientRect();
    setS(Math.min(hi, Math.max(lo, xToS(((clientX - r.left) / r.width) * W))));
  };
  const interactive = scrub && !compact;
  const sp = pnl(S);
  const winX = side === "UP" ? (sx(K2) + sx(hi)) / 2 : (sx(lo) + sx(K1)) / 2;
  const loseX = side === "UP" ? (sx(lo) + sx(K1)) / 2 : (sx(K2) + sx(hi)) / 2;

  return (
    <div className="w-full">
      {interactive && (
        <p className="mb-2 text-sm text-mute">
          If {asset} ends at <span className="tnum font-medium text-ink">{price(Math.round(S))}</span>, you{" "}
          {sp >= 0 ? "make" : "lose"} <span className={`tnum font-medium ${sp >= 0 ? "text-up" : "text-down"}`}>{usd(Math.abs(sp))}</span>
        </p>
      )}
      <svg
        ref={svg}
        viewBox={`0 0 ${W} ${H}`}
        className={`w-full touch-pan-y ${interactive ? "cursor-ew-resize" : ""}`}
        onPointerDown={(e) => {
          if (!interactive) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          onMove(e.clientX);
        }}
        onPointerMove={(e) => interactive && e.buttons === 1 && onMove(e.clientX)}
        role="img"
        aria-label={`Lose up to ${usd(cost)}, make up to ${usd(maxP)}`}
      >
        <line x1={padX} x2={W - padX} y1={zeroY} y2={zeroY} stroke="var(--line)" strokeWidth="1" />
        <path d={line} fill="none" stroke="var(--ink)" strokeWidth={compact ? 1.5 : 2} strokeLinejoin="round" />

        {!compact && (
          <g fontSize="12" className="tnum">
            <text x={winX} y={sy(maxP) - 10} textAnchor="middle" fill="var(--up)" fontWeight="600">
              +{usd(maxP)}
            </text>
            <text x={loseX} y={sy(minP) + 20} textAnchor="middle" fill="var(--down)" fontWeight="600">
              −{usd(cost)}
            </text>
            {[K1, K2].map((k) => (
              <text key={k} x={sx(k)} y={H - 8} textAnchor="middle" fill="var(--mute)">
                {price(k)}
              </text>
            ))}
            <line x1={sx(breakeven)} x2={sx(breakeven)} y1={zeroY - 4} y2={zeroY + 4} stroke="var(--ink)" />
            <text x={sx(breakeven) + (side === "UP" ? 10 : -10)} y={zeroY + 16} textAnchor={side === "UP" ? "start" : "end"} fill="var(--mute)">
              even at {price(Math.round(breakeven))}
            </text>
            {settlePrice === undefined && (
              <g>
                <path d={`M${sx(spot) - 4},${H - padBottom + 10} L${sx(spot) + 4},${H - padBottom + 10} L${sx(spot)},${H - padBottom + 4} Z`} fill="var(--mute)" />
              </g>
            )}
          </g>
        )}

        {settlePrice !== undefined && <circle cx={sx(settlePrice)} cy={sy(pnl(settlePrice))} r={compact ? 3 : 5} fill="var(--ink)" />}
        {compact && settlePrice === undefined && <circle cx={sx(spot)} cy={sy(pnl(spot))} r="3" fill="var(--ink)" />}

        {interactive && (
          <g pointerEvents="none">
            <line x1={sx(S)} x2={sx(S)} y1={padTop - 8} y2={H - padBottom} stroke="var(--mute)" strokeWidth="1" />
            <circle cx={sx(S)} cy={sy(sp)} r="5" fill="var(--bg)" stroke="var(--ink)" strokeWidth="2" />
          </g>
        )}
      </svg>
    </div>
  );
}

/** Memoised: re-renders only when its numbers change. */
export const PayoffRamp = memo(PayoffRampImpl);
