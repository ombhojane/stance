"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "motion/react";
import { useStore } from "@/lib/store";
import { RollingNumber } from "./RollingNumber";
import { Logo } from "./Logo";
import { ThemeToggle } from "./Theme";

const LINKS = [
  { href: "/make", label: "Take a stance", short: "Stance" },
  { href: "/positions", label: "Your stances", short: "Yours" },
  { href: "/house", label: "House", short: "House" },
  { href: "/signals", label: "Signals", short: "Signals" },
];

export function Nav() {
  const path = usePathname();
  const { balance, hydrated } = useStore();
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
                {isActive(l.href) && <motion.span layoutId="nav-pill" className="absolute inset-0 rounded-full bg-tile-3" transition={{ type: "spring", stiffness: 500, damping: 38 }} />}
                <span className={`relative ${isActive(l.href) ? "text-ink" : "text-mute hover:text-ink"}`}>{l.label}</span>
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <ThemeToggle />
            <span className="flex items-center gap-2 rounded-full bg-tile py-1 pl-3 pr-1 text-sm ring-1 ring-line">
              <span className="live-dot" />
              <span className="rounded-full bg-tile-3 px-3 py-1 font-semibold">
                {hydrated ? <RollingNumber value={balance} format="usd0" /> : "…"}
              </span>
            </span>
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
