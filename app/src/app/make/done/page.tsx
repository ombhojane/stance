"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import * as m from "motion/react-m";
import { Check } from "lucide-react";
import { useStore } from "@/lib/store";
import { expiryLabel } from "@/lib/market";
import { usd } from "@/lib/format";
import { Button } from "@/components/controls";
import { SentenceText } from "@/components/SentenceText";

export default function DonePage() {
  return (
    <Suspense>
      <Done />
    </Suspense>
  );
}

function Done() {
  const params = useSearchParams();
  const { positions, hydrated } = useStore();
  const p = positions.find((x) => x.id === params.get("id"));

  if (!hydrated) return null;
  if (!p)
    return (
      <p className="pt-24 text-center text-mute">
        Couldn&rsquo;t find that stance. <Link href="/positions" className="text-ink underline">See yours</Link>
      </p>
    );

  return (
    <div className="mx-auto max-w-[560px] pt-16 sm:pt-24">
      <m.span
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 400, damping: 22 }}
        className="flex h-12 w-12 items-center justify-center rounded-full bg-accent text-on-accent"
      >
        <Check size={22} strokeWidth={3} />
      </m.span>
      <h1 className="mt-6 text-4xl font-semibold tracking-tight">Stance placed.</h1>
      <p className="mt-3 text-xl leading-snug text-mute">
        <SentenceText amount={p.amount} asset={p.asset} dir={p.dir} target={p.target} expiry={p.expiry} />
      </p>

      <dl className="mt-8 grid grid-cols-3 gap-6 border-y border-line py-6">
        <div>
          <dt className="text-xs text-mute">Paid</dt>
          <dd className="tnum mt-1 text-lg font-semibold">{usd(p.cost)}</dd>
        </div>
        <div>
          <dt className="text-xs text-mute">Could get</dt>
          <dd className="tnum mt-1 text-lg font-semibold">{usd(p.units * (p.K2 - p.K1), { cents: false })}</dd>
        </div>
        <div>
          <dt className="text-xs text-mute">Settles</dt>
          <dd className="mt-1 text-lg font-semibold">{expiryLabel(p.expiry)}</dd>
        </div>
      </dl>

      <div className="mt-8 flex gap-3">
        <Link href={`/positions/${p.id}`}>
          <Button size="lg">View stance</Button>
        </Link>
        <Link href="/make">
          <Button size="lg" variant="ghost">
            Take another
          </Button>
        </Link>
      </div>
    </div>
  );
}
