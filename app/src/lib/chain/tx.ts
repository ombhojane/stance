"use client";

import { useCallback, useState } from "react";
import { useAccount, useChainId, usePublicClient, useSwitchChain, useWriteContract } from "wagmi";
import { baseSepolia } from "wagmi/chains";
import { encodeFunctionData, erc20Abi, type Abi, type Address, type Hash } from "viem";
import { usePrivyBridge } from "./privy";
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
  const privy = usePrivyBridge();
  const [step, setStep] = useState<Step>("idle");
  const [error, setError] = useState<string>();
  const [lastHash, setLastHash] = useState<Hash>();

  const run = useCallback(
    async <T,>(fn: () => Promise<T>): Promise<T | undefined> => {
      setError(undefined);
      try {
        if (chainId !== baseSepolia.id && !privy?.embedded) {
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
    [chainId, switchChainAsync, privy],
  );

  const write = useCallback(
    async (p: { address: Address; abi: Abi; functionName: string; args?: readonly unknown[] }): Promise<Hash> => {
      if (privy?.embedded) {
        const data = encodeFunctionData({ abi: p.abi, functionName: p.functionName, args: p.args ?? [] } as never);
        return privy.sponsoredSend(p.address, data);
      }
      return writeContractAsync(p as never);
    },
    [privy, writeContractAsync],
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
      await wait(await write({ address: token, abi: erc20Abi, functionName: "approve", args: [spender, amount] }));
    },
    [address, client, wait, write],
  );

  const faucet = () =>
    run(async () => {
      setStep("confirming");
      return wait(await write({ address: DEPLOYMENT.usd as Address, abi: testUsdAbi, functionName: "faucet" }));
    });

  /** Pay `usdcIn` (6dp) for at least `minUnits` (18dp) of this side. */
  const takeStance = (strategy: Strategy, usdcIn: bigint, minUnits: bigint) =>
    run(async () => {
      await ensureAllowance(DEPLOYMENT.usd as Address, DEPLOYMENT.app as Address, usdcIn);
      setStep("confirming");
      return wait(
        await write({
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
        await write({
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
      return wait(await write({ address: series, abi: spreadSeriesAbi, functionName: "redeem", args: [upUnits, downUnits, address!] }));
    });

  const deposit = (vault: Address, amount: bigint) =>
    run(async () => {
      await ensureAllowance(DEPLOYMENT.usd as Address, vault, amount);
      setStep("confirming");
      return wait(await write({ address: vault, abi: writerVaultAbi, functionName: "deposit", args: [amount, address!] }));
    });

  const withdraw = (vault: Address, shares: bigint) =>
    run(async () => {
      setStep("confirming");
      return wait(await write({ address: vault, abi: writerVaultAbi, functionName: "withdraw", args: [shares, address!] }));
    });

  return { step, error, lastHash, busy: step === "switching" || step === "approving" || step === "confirming", faucet, takeStance, sellBack, redeem, deposit, withdraw };
}
