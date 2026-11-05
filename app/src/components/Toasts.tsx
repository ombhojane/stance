"use client";

import { AnimatePresence } from "motion/react";
import * as m from "motion/react-m";
import { X } from "lucide-react";
import { useStore, useToasts } from "@/lib/store";

const TONE = { up: "bg-up", down: "bg-down", odds: "bg-odds" } as const;

export function Toasts() {
  const { dismiss } = useStore();
  const toasts = useToasts();
  return (
    <div className="pointer-events-none fixed bottom-20 right-4 z-50 flex w-[min(360px,calc(100vw-2rem))] flex-col gap-2 md:bottom-6">
      <AnimatePresence initial={false}>
        {toasts.map((t) => (
          <m.div
            key={t.id}
            layout
            initial={{ opacity: 0, y: 24, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, x: 40, scale: 0.96 }}
            transition={{ type: "spring", stiffness: 420, damping: 32 }}
            className="pointer-events-auto flex items-start gap-3 rounded-2xl bg-ink px-4 py-3 text-bg shadow-xl"
          >
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{t.title}</p>
              {t.body && <p className="mt-0.5 text-xs text-mute">{t.body}</p>}
            </div>
            <button onClick={() => dismiss(t.id)} className="opacity-50 hover:opacity-100" aria-label="Dismiss">
              <X size={14} />
            </button>
          </m.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
