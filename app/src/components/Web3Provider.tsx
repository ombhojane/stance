"use client";

import { useState } from "react";
import { WagmiProvider } from "wagmi";
import { WagmiProvider as PrivyWagmiProvider } from "@privy-io/wagmi";
import { PrivyProvider } from "@privy-io/react-auth";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { baseSepolia } from "wagmi/chains";
import { PRIVY_APP_ID, wagmiConfig } from "@/lib/chain/config";
import { PrivyBridgeProvider } from "@/lib/chain/privy";

export function Web3Provider({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () => new QueryClient({ defaultOptions: { queries: { staleTime: 10_000, refetchOnWindowFocus: false } } }),
  );

  if (!PRIVY_APP_ID) {
    return (
      <WagmiProvider config={wagmiConfig}>
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      </WagmiProvider>
    );
  }

  return (
    <PrivyProvider
      appId={PRIVY_APP_ID}
      config={{
        loginMethods: ["google", "email", "apple", "twitter", "wallet"],
        appearance: {
          theme: "light",
          accentColor: "#111113",
          logo: "/icons/192",
          landingHeader: "Sign in to Stance",
          loginMessage: "Your wallet is created for you. No seed phrase.",
          walletChainType: "ethereum-only",
          walletList: ["metamask", "coinbase_wallet", "rainbow", "detected_ethereum_wallets", "wallet_connect"],
        },
        embeddedWallets: { ethereum: { createOnLogin: "users-without-wallets" }, showWalletUIs: false },
        defaultChain: baseSepolia,
        supportedChains: [baseSepolia],
      }}
    >
      <QueryClientProvider client={client}>
        <PrivyWagmiProvider config={wagmiConfig}>
          <PrivyBridgeProvider>{children}</PrivyBridgeProvider>
        </PrivyWagmiProvider>
      </QueryClientProvider>
    </PrivyProvider>
  );
}
