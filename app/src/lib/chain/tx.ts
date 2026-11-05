"use client";

import { useCallback, useState } from "react";
import { useAccount, useChainId, usePublicClient, useSwitchChain, useWriteContract } from "wagmi";
import { baseSepolia } from "wagmi/chains";
import { erc20Abi, type Address, type Hash } from "viem";
import { DEPLOYMENT } from "./deployment";
import { spreadAquaAppAbi, spreadSeriesAbi, testUsdAbi, writerVaultAbi } from "./abis";
import type { Strategy } from "./live";

type Step = "idle" | "switching" | "approving" | "confirming" | "done" | "error";

/** Every onchain action Stance takes, with approve-if-needed and receipt waiting. */
export function useStanceTx() {
  const { address } = useAccount();
  const chainId = useChainId();
  const { switchChainAsync } = useSwitchChain();
  const client = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const [step, setStep] = useState<Step>("idle");
  const [error, setError] = useState<string>();
  const [lastHash, setLastHash] = useState<Hash>();

  const run = useCallback(
    async <T,>(fn: () => Promise<T>): Promise<T | undefined> => {
      setError(undefined);
      try {
        if (chainId !== baseSepolia.id) {
          setStep("switching");
          await switchChainAsync({ chainId: baseSepolia.id });
        }
        const out = await fn();
        setStep("done");
        return out;
      } catch (e) {
        const msg = (e as { shortMessage?: string; message?: string }).shortMessage ?? (e as Error).message;
        setError(/rejected|denied/i.test(msg) ? "You cancelled in your wallet." : msg);
        setStep("error");
        return undefined;
      }
    },
    [chainId, switchChainAsync],
  );

  const wait = useCallback(
    async (hash: Hash) => {
      setLastHash(hash);
      const r = await client!.waitForTransactionReceipt({ hash });
      if (r.status !== "success") throw new Error("Transaction reverted");
      return r;
    },
    [client],
  );

  const ensureAllowance = useCallback(
    async (token: Address, spender: Address, amount: bigint) => {
      const current = await client!.readContract({ address: token, abi: erc20Abi, functionName: "allowance", args: [address!, spender] });
      if (current >= amount) return;
      setStep("approving");
      await wait(await writeContractAsync({ address: token, abi: erc20Abi, functionName: "approve", args: [spender, amount] }));
    },
    [address, client, wait, writeContractAsync],
  );

  const faucet = () =>
    run(async () => {
      setStep("confirming");
      return wait(await writeContractAsync({ address: DEPLOYMENT.usd as Address, abi: testUsdAbi, functionName: "faucet" }));
    });

  /** Pay `usdcIn` (6dp) for at least `minUnits` (18dp) of this side. */
  const takeStance = (strategy: Strategy, usdcIn: bigint, minUnits: bigint) =>
    run(async () => {
      await ensureAllowance(DEPLOYMENT.usd as Address, DEPLOYMENT.app as Address, usdcIn);
      setStep("confirming");
      return wait(
        await writeContractAsync({
          address: DEPLOYMENT.app as Address,
          abi: spreadAquaAppAbi,
          functionName: "buy",
          args: [strategy, usdcIn, minUnits, address!],
        }),
      );
    });

  const sellBack = (strategy: Strategy, outcome: Address, units: bigint, minUsdc: bigint) =>
    run(async () => {
      await ensureAllowance(outcome, DEPLOYMENT.app as Address, units);
      setStep("confirming");
      return wait(
        await writeContractAsync({
          address: DEPLOYMENT.app as Address,
          abi: spreadAquaAppAbi,
          functionName: "sell",
          args: [strategy, units, minUsdc, address!],
        }),
      );
    });

  const redeem = (series: Address, upUnits: bigint, downUnits: bigint) =>
    run(async () => {
      setStep("confirming");
      return wait(await writeContractAsync({ address: series, abi: spreadSeriesAbi, functionName: "redeem", args: [upUnits, downUnits, address!] }));
    });

  const deposit = (vault: Address, amount: bigint) =>
    run(async () => {
      await ensureAllowance(DEPLOYMENT.usd as Address, vault, amount);
      setStep("confirming");
      return wait(await writeContractAsync({ address: vault, abi: writerVaultAbi, functionName: "deposit", args: [amount, address!] }));
    });

  const withdraw = (vault: Address, shares: bigint) =>
    run(async () => {
      setStep("confirming");
      return wait(await writeContractAsync({ address: vault, abi: writerVaultAbi, functionName: "withdraw", args: [shares, address!] }));
    });

  return { step, error, lastHash, busy: step === "switching" || step === "approving" || step === "confirming", faucet, takeStance, sellBack, redeem, deposit, withdraw };
}
