"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import * as m from "motion/react-m";
import { Logo } from "./Logo";
import { ThemeToggle } from "./Theme";
import { WalletPill } from "./WalletPill";
import { useMode, Mode } from "@/lib/mode";
import { DEPLOYED } from "@/lib/chain/deployment";

const LINKS = [
  { href: "/make", label: "Take a stance", short: "Stance" },
  { href: "/positions", label: "Your stances", short: "Yours" },
  { href: "/house", label: "House", short: "House" },
  { href: "/signals", label: "Signals", short: "Signals" },
];

export function Nav() {
  const path = usePathname();
  const isActive = (href: string) => path === href || path.startsWith(href + "/");
  return (
    <>
      <header className="sticky top-0 z-40 bg-bg/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 w-full max-w-[1180px] items-center justify-between gap-3 px-4 sm:px-6">
          <Link href="/" aria-label="Stance home">
            <Logo />
          </Link>

          <nav className="hidden items-center gap-1 rounded-full bg-tile p-1 ring-1 ring-line md:flex">
            {LINKS.map((l) => (
              <Link key={l.href} href={l.href} className="relative rounded-full px-4 py-2 text-sm font-medium">
                {isActive(l.href) && <m.span layoutId="nav-pill" className="absolute inset-0 rounded-full bg-tile-3" transition={{ type: "spring", stiffness: 500, damping: 38 }} />}
                <span className={`relative ${isActive(l.href) ? "text-ink" : "text-mute hover:text-ink"}`}>{l.label}</span>
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <ModeSwitch />
            <ThemeToggle />
            <WalletPill />
          </div>
        </div>
      </header>

      {/* mobile bottom bar (outside the header: its backdrop-filter would trap `fixed`) */}
      <nav className="fixed inset-x-3 bottom-3 z-40 flex justify-between rounded-full bg-tile/95 p-1 ring-1 ring-line backdrop-blur-xl md:hidden">
        {LINKS.map((l) => (
          <Link key={l.href} href={l.href} className={`flex-1 rounded-full px-2 py-2.5 text-center text-xs font-medium ${isActive(l.href) ? "bg-tile-3 text-ink" : "text-mute"}`}>
            {l.short}
          </Link>
        ))}
      </nav>
    </>
  );
}

/** test: simulated money, every screen works offline. prod: the live Base Sepolia contracts. */
function ModeSwitch() {
  const { mode, setMode } = useMode();
  if (!DEPLOYED) return null;
  return (
    <div role="radiogroup" aria-label="Mode" className="flex rounded-full bg-tile p-0.5 text-xs font-semibold ring-1 ring-line">
      {(["test", "prod"] as Mode[]).map((v) => (
        <button
          key={v}
          role="radio"
          aria-checked={mode === v}
          onClick={() => setMode(v)}
          className={`relative rounded-full px-2.5 py-1.5 capitalize transition sm:px-3 ${mode === v ? "text-ink" : "text-faint hover:text-mute"}`}
        >
          {mode === v && <m.span layoutId="mode-pill" className={`absolute inset-0 rounded-full ${v === "test" ? "bg-sun/20" : "bg-tile-3"}`} transition={{ type: "spring", stiffness: 500, damping: 38 }} />}
          <span className="relative">{v}</span>
        </button>
      ))}
    </div>
  );
}
