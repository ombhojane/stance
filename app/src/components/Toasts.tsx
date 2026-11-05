"use client";

import { AnimatePresence, motion } from "motion/react";
import { X } from "lucide-react";
import { useStore } from "@/lib/store";

const TONE = { up: "bg-up", down: "bg-down", odds: "bg-odds" } as const;

export function Toasts() {
  const { toasts, dismiss } = useStore();
  return (
    <div className="pointer-events-none fixed bottom-20 right-4 z-50 flex w-[min(360px,calc(100vw-2rem))] flex-col gap-2 md:bottom-6">
      <AnimatePresence initial={false}>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            layout
            initial={{ opacity: 0, y: 24, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, x: 40, scale: 0.96 }}
            transition={{ type: "spring", stiffness: 420, damping: 32 }}
            className="pointer-events-auto flex items-start gap-3 rounded-2xl border border-line bg-tile-2/95 p-3.5 shadow-2xl backdrop-blur-xl"
          >
            <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${TONE[t.tone ?? "up"]}`} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">{t.title}</p>
              {t.body && <p className="mt-0.5 text-xs text-mute">{t.body}</p>}
            </div>
            <button onClick={() => dismiss(t.id)} className="text-mute hover:text-ink" aria-label="Dismiss">
              <X size={14} />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
