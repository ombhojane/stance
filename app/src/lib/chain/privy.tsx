"use client";

import { createContext, useContext, useMemo } from "react";
import { useAccount } from "wagmi";
import { baseSepolia } from "wagmi/chains";
import { usePrivy, useSendTransaction, useWallets } from "@privy-io/react-auth";
import type { Address, Hash, Hex } from "viem";

/**
 * A thin bridge so the rest of the app never imports Privy directly:
 * - who is signed in, and how (social / email / external wallet)
 * - sponsored sends for Privy embedded wallets (gas paid by the app, so a
 *   brand-new Google sign-in can trade with zero ETH)
 * Without a Privy app id the bridge is absent and callers fall back to wagmi.
 */
export interface PrivyBridge {
  ready: boolean;
  authenticated: boolean;
  login: () => void;
  logout: () => Promise<void>;
  label: string | null; // "om@gmail.com", "@om", or null for wallet-only users
  embedded: boolean; // active wallet is a Privy embedded wallet
  sponsoredSend: (to: Address, data: Hex) => Promise<Hash>;
}

const Ctx = createContext<PrivyBridge | null>(null);
export const usePrivyBridge = () => useContext(Ctx);

export function PrivyBridgeProvider({ children }: { children: React.ReactNode }) {
  const { ready, authenticated, login, logout, user } = usePrivy();
  const { wallets } = useWallets();
  const { sendTransaction } = useSendTransaction();
  const { address } = useAccount();

  const active = wallets.find((w) => address && w.address.toLowerCase() === address.toLowerCase());
  const embedded = active?.walletClientType === "privy";
  const label =
    user?.google?.email ?? user?.email?.address ?? (user?.twitter?.username ? `@${user.twitter.username}` : null) ?? user?.apple?.email ?? null;

  const value = useMemo<PrivyBridge>(
    () => ({
      ready,
      authenticated,
      login,
      logout,
      label,
      embedded,
      sponsoredSend: async (to, data) => {
        const { hash } = await sendTransaction(
          { to, data, chainId: baseSepolia.id },
          // gas is paid by the app (Privy fee sponsorship); no confirm modal for routine trade steps
          { sponsor: true, uiOptions: { showWalletUIs: false } },
        );
        return hash as Hash;
      },
    }),
    [ready, authenticated, login, logout, label, embedded, sendTransaction],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
