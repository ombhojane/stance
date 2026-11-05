"use client";

import { memo } from "react";

import { usd, pct } from "@/lib/format";

type Fmt = "usd" | "usd0" | "usdSigned" | "price" | "pct" | "int" | "x";

function render(value: number, format: Fmt): string {
  switch (format) {
    case "usd":
      return usd(value, { cents: Math.abs(value) < 1000 });
    case "usd0":
      return usd(value, { cents: false });
    case "usdSigned":
      return usd(value, { sign: true, cents: Math.abs(value) < 1000 });
    case "price":
      return `$${value.toLocaleString("en-US", { maximumFractionDigits: value < 1000 ? 2 : 0, minimumFractionDigits: value < 1000 ? 2 : 0 })}`;
    case "pct":
      return pct(value);
    case "int":
      return Math.round(value).toLocaleString("en-US");
    case "x":
      return `${value.toFixed(1)}x`;
  }
}

/** Digit-by-digit rolling counter (bencho-style). */
function RollingNumberImpl({ value, format = "usd", className = "" }: { value: number; format?: Fmt; className?: string }) {
  const text = render(value, format);
  const chars = text.split("");
  return (
    <span className={`tnum inline-flex overflow-hidden leading-none ${className}`} aria-label={text}>
      {chars.map((c, i) => {
        const key = chars.length - i; // key from the right so columns stay stable
        if (!/[0-9]/.test(c)) {
          return (
            <span key={`s${key}`} aria-hidden>
              {c}
            </span>
          );
        }
        const d = Number(c);
        return (
          <span key={`d${key}`} aria-hidden className="relative inline-block h-[1em] w-[0.6em] overflow-hidden">
            <span
              className="absolute left-0 top-0 flex flex-col items-center"
              style={{
                transform: `translateY(${-d * 10}%)`,
                transition: "transform 520ms cubic-bezier(.2,1.25,.35,1)",
                width: "100%",
              }}
            >
              {"0123456789".split("").map((n) => (
                <span key={n} className="block h-[1em] leading-none">
                  {n}
                </span>
              ))}
            </span>
          </span>
        );
      })}
    </span>
  );
}

/** Memoised: re-renders only when its numbers change. */
export const RollingNumber = memo(RollingNumberImpl);
