"use client";

import { Suspense, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Check } from "lucide-react";
import { draftFromQuery, draftToQuery, expiryLabel, FEE } from "@/lib/market";
import { useStore } from "@/lib/store";
import { price, usd } from "@/lib/format";
import { SlideToConfirm } from "@/components/controls";
import { PayoffRamp } from "@/components/PayoffRamp";
import { OddsGrid } from "@/components/OddsGrid";
import { SentenceText } from "@/components/SentenceText";
import { useAccount } from "wagmi";
import { parseEventLogs } from "viem";
import { useStanceQuote } from "@/lib/chain/useStanceQuote";
import { useUsd } from "@/lib/chain/live";
import { useStanceTx } from "@/lib/chain/tx";
import { spreadAquaAppAbi } from "@/lib/chain/abis";
import { EXPLORER } from "@/lib/chain/deployment";

export default function ReviewPage() {
  return (
    <Suspense>
      <Review />
    </Suspense>
  );
}

function Review() {
  const params = useSearchParams();
  const router = useRouter();
  const { balance, dispatch, toast } = useStore();
  const draft = useMemo(() => draftFromQuery(params), [params]);
  const q = useStanceQuote(draft);
  const { isConnected } = useAccount();
  const usdc = useUsd();
  const tx = useStanceTx();
  const [ack, setAck] = useState(false);
  const [details, setDetails] = useState(false);
  const wallet = q.live ? usdc.balance ?? 0 : balance;
  const enough = wallet >= q.cost;
  const loseAt = draft.dir === "above" ? q.K1 : q.K2;

  const confirm = async () => {
    const id = `p-${Date.now().toString(36)}`;
    let live: { series: string; outcome: string; unitsRaw: string; txHash: string } | undefined;
    let units = q.units;
    let cost = q.cost;
    if (q.live) {
      const receipt = await tx.takeStance(q.strategy!, q.usdcIn!, q.minUnits!);
      if (!receipt) return; // error shown below the slider
      const [ev] = parseEventLogs({ abi: spreadAquaAppAbi, logs: receipt.logs, eventName: "Bought" });
      units = Number(ev.args.unitsOut) / 1e18;
      cost = Number(ev.args.usdcIn) / 1e6;
      live = { series: q.range!.series, outcome: q.outcome!, unitsRaw: ev.args.unitsOut.toString(), txHash: receipt.transactionHash };
      usdc.refetch();
    }
    dispatch({
      type: "buy",
      position: {
        id,
        createdAt: Date.now(),
        asset: draft.asset,
        dir: draft.dir,
        side: q.side,
        target: draft.target,
        amount: draft.amount,
        expiry: draft.expiry,
        K1: q.K1,
        K2: q.K2,
        units,
        cost,
        chanceAtBuy: q.chanceFull,
        status: "open",
        live,
      },
    });
    toast({ title: "Stance placed", tone: "up" });
    router.push(`/make/done?id=${id}`);
  };

  return (
    <div className="mx-auto max-w-[720px] pt-2 sm:pt-8">
      <Link href={`/make?${draftToQuery(draft)}`} className="inline-flex items-center gap-1.5 text-sm text-mute hover:text-ink">
        <ArrowLeft size={15} /> Edit
      </Link>

      <h1 className="mt-6 text-[clamp(1.8rem,4vw,2.6rem)] font-medium leading-tight tracking-[-0.03em]">
        <SentenceText {...draft} />
      </h1>

      <dl className="mt-8 grid grid-cols-3 gap-6 border-y border-line py-6">
        <Fact k="You pay" v={usd(q.cost)} />
        <Fact k="You could get" v={usd(q.maxPayout, { cents: false })} />
        <Fact k="Settles" v={`${expiryLabel(draft.expiry)}, 08:00 UTC`} />
      </dl>

      <section className="mt-10">
        <h2 className="text-sm font-medium text-mute">The odds, as the market sees them</h2>
        <div className="mt-4">
          <OddsGrid full={q.chanceFull} any={q.chanceAny} />
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-sm font-medium text-mute">What you get at each price</h2>
        <div className="mt-4">
          <PayoffRamp asset={draft.asset} side={q.side} K1={q.K1} K2={q.K2} units={q.units} cost={q.cost} spot={q.spot} expiry={draft.expiry} />
        </div>
      </section>

      <button onClick={() => setDetails((d) => !d)} className="mt-8 text-sm text-mute underline decoration-line underline-offset-4 hover:text-ink">
        {details ? "Hide details" : "Details"}
      </button>
      {details && (
        <dl className="mt-4 grid gap-x-10 gap-y-2 font-mono text-xs text-mute sm:grid-cols-2">
          <Row k="position" v={`${q.side} ${price(q.K1)}–${price(q.K2)} ${draft.asset}`} />
          <Row k="units" v={q.units.toFixed(3)} />
          <Row k="price/unit" v={`${usd(q.ask)} of ${usd(q.W)}`} />
          <Row k="spread" v={`${(FEE * 100).toFixed(0)}%`} />
          <Row k="collateral" v="USDC, fully backed" />
          <Row k="venue" v="1inch Aqua" />
          <Row k="settlement" v={`chainlink ${draft.asset}/usd`} />
          <Row k="guard" v="uniswap twap ±1.5%" />
        </dl>
      )}

      <div className="mt-10 space-y-4">
        <label className="flex cursor-pointer items-start gap-3 text-sm">
          <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition ${ack ? "border-ink bg-ink text-bg" : "border-faint"}`}>
            {ack && <Check size={14} strokeWidth={3} />}
          </span>
          <input type="checkbox" className="sr-only" checked={ack} onChange={(e) => setAck(e.target.checked)} />
          <span className="text-mute">
            If {draft.asset} is {draft.dir === "above" ? "at or below" : "at or above"} {price(loseAt)} on {expiryLabel(draft.expiry)}, I lose the <span className="text-ink">{usd(q.cost)}</span> I paid.
          </span>
        </label>
        {q.live && !isConnected ? (
          <p className="rounded-2xl bg-tile px-4 py-4 text-center text-sm text-mute">Connect a wallet (top right) to take this stance on Base Sepolia.</p>
        ) : (
          <SlideToConfirm
            key={`${ack}-${enough}-${tx.step}`}
            label={
              tx.step === "approving"
                ? "Approving test USD…"
                : tx.step === "confirming"
                  ? "Confirming onchain…"
                  : tx.step === "switching"
                    ? "Switching to Base Sepolia…"
                    : enough
                      ? `Slide to pay ${usd(q.cost)}`
                      : q.live
                        ? "Not enough test USD (get some from the wallet menu)"
                        : "Not enough demo USDC"
            }
            disabled={!ack || !enough || !q.ok || tx.busy}
            onConfirm={confirm}
          />
        )}
        {tx.error && <p className="text-center text-sm text-down">{tx.error}</p>}
        {q.live && (
          <p className="text-center font-mono text-[11px] text-faint">
            base sepolia ·{" "}
            <a className="underline" href={`${EXPLORER}/address/${q.range?.vault}`} target="_blank" rel="noreferrer">
              house vault
            </a>{" "}
            · priced by 1inch aqua
          </p>
        )}
      </div>
    </div>
  );
}

function Fact({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <dt className="text-xs text-mute">{k}</dt>
      <dd className="tnum mt-1 text-lg font-semibold sm:text-xl">{v}</dd>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt>{k}</dt>
      <dd className="text-ink">{v}</dd>
    </div>
  );
}
