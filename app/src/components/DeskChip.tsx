"use client";

import { useEffect, useRef, useState } from "react";
import { ShieldCheck, Cpu } from "lucide-react";
import { pct } from "@/lib/format";
import type { DeskClientRead } from "@/lib/useDesk";

const short = (s: string | null) => (s ? `${s.slice(0, 10)}…` : "—");

/**
 * The odds receipt. A quiet chip beside any desk-priced number; tapping it
 * shows which inference produced the number — model, TEE provider, request id.
 */
export function DeskChip({ desk, expiry, textbook, deskC }: { desk: DeskClientRead | undefined; expiry: string; textbook?: number; deskC?: number | null }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const close = (e: PointerEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, []);

  if (!desk || desk.source === "static") return null;
  const vol = desk.vols?.[expiry];
  const zg = desk.source === "0g";

  return (
    <span ref={ref} className="relative inline-flex">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        title="How this number was priced"
        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-mono text-[10px] ring-1 transition active:scale-95 ${
          zg ? "bg-odds-deep text-odds ring-odds/20" : "bg-tile text-mute ring-line"
        }`}
      >
        {zg ? <ShieldCheck size={11} /> : <Cpu size={11} />}
        {zg ? "0G" : "ai"}
      </button>
      {open && (
        <span className="absolute bottom-full left-1/2 z-50 mb-2 w-72 -translate-x-1/2 rounded-2xl bg-tile p-4 text-left shadow-[0_20px_60px_-20px_rgba(0,0,0,.55)] ring-1 ring-line">
          <span className="block text-[13px] font-semibold leading-snug text-ink">{desk.headline}</span>
          <span className="mt-1.5 block text-xs leading-relaxed text-mute">{desk.read}</span>
          <span className="tnum mt-3 grid grid-cols-2 gap-x-3 gap-y-1 font-mono text-[11px]">
            <span className="text-faint">desk vol</span>
            <span className="text-ink">{vol ? pct(vol) : "—"}</span>
            {textbook !== undefined && deskC != null && (
              <>
                <span className="text-faint">chance</span>
                <span className="text-ink">
                  {pct(deskC)} <span className="text-faint">(textbook {pct(textbook)})</span>
                </span>
              </>
            )}
            <span className="text-faint">bias</span>
            <span className={desk.bias === "up" ? "text-up" : desk.bias === "down" ? "text-down" : "text-ink"}>{desk.bias}</span>
            <span className="text-faint">model</span>
            <span className="text-ink">{desk.model}</span>
            {zg && (
              <>
                <span className="text-faint">tee</span>
                <span className={desk.teeVerified ? "text-up" : "text-mute"}>{desk.teeVerified ? "verified ✓" : "attested route"}</span>
                <span className="text-faint">provider</span>
                <span className="text-ink">{short(desk.provider)}</span>
              </>
            )}
            <span className="text-faint">request</span>
            <span className="break-all text-ink">{short(desk.requestId)}</span>
            <span className="text-faint">read at</span>
            <span className="text-ink">
              {new Date(desk.at).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })} · {desk.latencyMs}ms
            </span>
          </span>
          <span className="mt-3 block border-t border-line pt-2 text-[10px] leading-relaxed text-faint">
            {zg ? "Priced by inference on 0G Compute. The request id is the receipt: this exact output, from this TEE provider." : "Priced by a fallback model; 0G receipt unavailable."}
          </span>
        </span>
      )}
    </span>
  );
}
