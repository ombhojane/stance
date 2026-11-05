import { ImageResponse } from "next/og";
import { MARK_COLS, MARK_ROWS, markDots } from "@/components/Logo";

/** Square app icon: the dot-matrix mark on ink, sized for the maskable safe zone. */
export function iconResponse(size: number, opts: { padding?: number } = {}) {
  const pad = opts.padding ?? 0.24; // maskable icons keep content inside the central ~60%
  const inner = size * (1 - pad * 2);
  const pitch = inner / MARK_COLS;
  const h = pitch * MARK_ROWS;
  const top = (size - h) / 2;
  const left = size * pad;
  return new ImageResponse(
    (
      <div style={{ width: size, height: size, background: "#0A0A0B", display: "flex", position: "relative" }}>
        {markDots().map(({ c, r, lit, flag }) => {
          const d = pitch * (lit ? 0.72 : 0.28);
          return (
            <div
              key={`${c}-${r}`}
              style={{
                position: "absolute",
                left: left + c * pitch + (pitch - d) / 2,
                top: top + r * pitch + (pitch - d) / 2,
                width: d,
                height: d,
                borderRadius: d,
                background: flag ? "#C8F560" : lit ? "#F4F3EF" : "rgba(244,243,239,0.22)",
              }}
            />
          );
        })}
      </div>
    ),
    { width: size, height: size },
  );
}
