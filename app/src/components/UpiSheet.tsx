"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence } from "motion/react";
import * as m from "motion/react-m";
import { Check, Loader2, X } from "lucide-react";
import { useStore } from "@/lib/store";
import { useLive } from "@/lib/mode";
import { useStanceTx } from "@/lib/chain/tx";
import { useUsd } from "@/lib/chain/live";
import { useSpots } from "./useSpots";

const INR_PER_USD = 88.5; // indicative; a real onramp quotes live
const PRESETS = [500, 1000, 5000];
const APPS = [
  { id: "gpay", name: "Google Pay", tint: "#e8f0fe", ink: "#1a73e8" },
  { id: "phonepe", name: "PhonePe", tint: "#f1e9fb", ink: "#5f259f" },
  { id: "paytm", name: "Paytm", tint: "#e6f4fb", ink: "#00a5e4" },
  { id: "bhim", name: "BHIM", tint: "#fdeee5", ink: "#e8721c" },
];

type Step = "pick" | "approve" | "done" | "error";

/**
 * Add money with UPI.
 * Test mode: credits the in-browser test balance with the rupee amount at an indicative rate.
 * Prod (Base Sepolia): testnets have no rupee rail, so the UPI step is simulated and the
 * wallet receives the Test USD faucet drip (gas sponsored for sign-in wallets).
 * On mainnet this screen hands off to a UPI onramp delivering USDC on Base.
 */
export function UpiSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const live = useLive();
  const { dispatch, toast } = useStore();
  const tx = useStanceTx();
  const usdc = useUsd();
  const [inr, setInr] = useState(1000);
  const [app, setApp] = useState(APPS[0].id);
  const [step, setStep] = useState<Step>("pick");
  const [err, setErr] = useState<string>();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const usd = Math.floor((inr / INR_PER_USD) * 100) / 100;
  const ethSpot = useSpots().ETH;
  const eth = ethSpot ? usd / ethSpot : 0;

  useEffect(() => {
    if (open) {
      setStep("pick");
      setErr(undefined);
    }
  }, [open]);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && step !== "approve" && onClose();
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [onClose, step]);

  const pay = async () => {
    setStep("approve");
    // the UPI collect request: on testnet this is the simulated approval in the user's UPI app
    await new Promise((r) => setTimeout(r, 1600));
    if (!live) {
      dispatch({ type: "fund", amount: usd });
      toast({ title: `Added $${usd.toLocaleString("en-US")}`, tone: "up" });
      setStep("done");
      return;
    }
    const r = await tx.faucet();
    if (!r) {
      const soon = usdc.nextDripAt && usdc.nextDripAt * 1000 > Date.now();
      setErr(
        soon
          ? `Testnet top-ups are once an hour. Next one at ${new Date(usdc.nextDripAt! * 1000).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}.`
          : tx.error ?? "Top-up failed. Try again.",
      );
      setStep("error");
      return;
    }
    usdc.refetch();
    toast({ title: "Added 10,000 test USD", tone: "up" });
    setStep("done");
  };

  const appName = APPS.find((a) => a.id === app)?.name;

  // portal to <body>: the header's backdrop-filter would otherwise trap `position: fixed`
  if (!mounted) return null;
  return createPortal(
    <AnimatePresence>
      {open && (
        <m.div
          key="upi"
          className="fixed inset-0 z-[60] flex items-end justify-center bg-ink/30 backdrop-blur-sm sm:items-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onPointerDown={(e) => e.target === e.currentTarget && step !== "approve" && onClose()}
        >
          <m.div
            role="dialog"
            aria-label="Add money with UPI"
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 40, opacity: 0 }}
            transition={{ type: "spring", stiffness: 420, damping: 36 }}
            className="w-full max-w-[440px] rounded-t-[28px] bg-tile p-6 ring-1 ring-line sm:rounded-[28px]"
          >
            <div className="flex items-center justify-between">
              <p className="text-lg font-semibold">Add money</p>
              {step !== "approve" && (
                <button onClick={onClose} aria-label="Close" className="rounded-full p-1.5 text-mute hover:bg-tile-2 hover:text-ink">
                  <X size={18} />
                </button>
              )}
            </div>

            {step === "pick" && (
              <>
                <div className="mt-5 flex items-baseline gap-1">
                  <span className="text-3xl font-semibold">₹</span>
                  <input
                    value={inr}
                    inputMode="numeric"
                    aria-label="Amount in rupees"
                    onChange={(e) => setInr(Math.min(100000, Number(e.target.value.replace(/[^0-9]/g, "")) || 0))}
                    className="tnum w-full bg-transparent text-5xl font-semibold tracking-tight outline-none"
                  />
                </div>
                {live ? (
                  <p className="tnum mt-1 text-sm text-mute">You get 10,000 test USD (testnet drip)</p>
                ) : (
                  <div className="tnum mt-3 grid grid-cols-2 gap-2">
                    <div className="rounded-2xl bg-tile-2 px-4 py-3">
                      <p className="text-[11px] font-medium text-mute">You get</p>
                      <p className="text-xl font-semibold tracking-tight">${usd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                    </div>
                    <div className="rounded-2xl bg-tile-2 px-4 py-3">
                      <p className="text-[11px] font-medium text-mute">Worth in ETH</p>
                      <p className="text-xl font-semibold tracking-tight">{eth ? eth.toFixed(4) : "—"} <span className="text-sm text-mute">ETH</span></p>
                    </div>
                    <p className="col-span-2 font-mono text-[11px] text-faint">
                      ₹{INR_PER_USD}/$ · ETH ${Math.round(ethSpot).toLocaleString("en-US")}
                    </p>
                  </div>
                )}
                <div className="mt-4 flex gap-2">
                  {PRESETS.map((v) => (
                    <button
                      key={v}
                      onClick={() => setInr(v)}
                      className={`tnum rounded-full px-3.5 py-1.5 text-sm font-medium transition ${inr === v ? "bg-ink text-bg" : "bg-tile-2 text-mute hover:text-ink"}`}
                    >
                      ₹{v.toLocaleString("en-IN")}
                    </button>
                  ))}
                </div>

                <p className="mt-6 text-xs font-medium text-mute">Pay with UPI</p>
                <div className="mt-2 grid grid-cols-4 gap-2">
                  {APPS.map((a) => (
                    <button
                      key={a.id}
                      onClick={() => setApp(a.id)}
                      className={`flex flex-col items-center gap-1.5 rounded-2xl p-2.5 text-[11px] font-medium transition ${app === a.id ? "ring-2 ring-ink" : "ring-1 ring-line hover:ring-ink/40"}`}
                    >
                      <span className="flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold" style={{ background: a.tint, color: a.ink }}>
                        {a.name[0]}
                      </span>
                      {a.name}
                    </button>
                  ))}
                </div>

                <button
                  onClick={pay}
                  disabled={inr < 100}
                  className="mt-6 h-13 w-full rounded-full bg-accent py-3.5 font-semibold text-on-accent transition hover:brightness-105 active:scale-[0.98] disabled:opacity-40"
                >
                  Pay ₹{inr.toLocaleString("en-IN")} with {appName}
                </button>
                <p className="mt-3 text-center text-[11px] leading-relaxed text-faint">
                  {live ? "Testnet: the UPI step is simulated and no rupees move." : "Test mode: no rupees move."} On mainnet this hands off to a UPI onramp that delivers USDC on Base.
                </p>
              </>
            )}

            {step === "approve" && (
              <div className="py-10 text-center">
                <Loader2 size={36} className="mx-auto animate-spin text-mute" />
                <p className="mt-5 font-semibold">Approve ₹{inr.toLocaleString("en-IN")} in {appName}</p>
                <p className="mt-1 text-sm text-mute">{live ? "Then we credit your wallet on Base Sepolia." : "Then we credit your test balance."}</p>
              </div>
            )}

            {step === "done" && (
              <div className="py-8 text-center">
                <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-accent text-on-accent">
                  <Check size={26} strokeWidth={3} />
                </span>
                <p className="mt-5 text-2xl font-semibold tracking-tight">
                  {live ? "10,000 test USD added" : `$${usd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} added`}
                </p>
                {!live && eth > 0 && <p className="tnum mt-1 font-mono text-xs text-mute">≈ {eth.toFixed(4)} ETH at today&apos;s price</p>}
                <p className="mt-1 text-sm text-mute">Your stance is one sentence away.</p>
                <button onClick={onClose} className="mt-6 rounded-full bg-ink px-6 py-3 font-semibold text-bg">
                  Done
                </button>
              </div>
            )}

            {step === "error" && (
              <div className="py-8 text-center">
                <p className="font-semibold">Couldn&apos;t add money</p>
                <p className="mt-1 text-sm text-mute">{err}</p>
                <button onClick={() => setStep("pick")} className="mt-6 rounded-full bg-tile-2 px-6 py-3 font-semibold">
                  Back
                </button>
              </div>
            )}
          </m.div>
        </m.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
