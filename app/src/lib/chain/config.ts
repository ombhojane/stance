import { createConfig as createWagmiConfig, http } from "wagmi";
import { createConfig as createPrivyConfig } from "@privy-io/wagmi";
import { baseSepolia } from "wagmi/chains";
import { injected, walletConnect } from "wagmi/connectors";

export const PRIVY_APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID || "";
const wcProjectId = process.env.NEXT_PUBLIC_WC_PROJECT_ID;
const transports = { [baseSepolia.id]: http(process.env.NEXT_PUBLIC_RPC_URL || "https://sepolia.base.org", { batch: true }) };

/**
 * Base Sepolia only.
 * With a Privy app id: Privy owns connection (social sign-in, embedded wallets, MetaMask in the same modal).
 * Without one: plain browser wallets, plus WalletConnect when a project id is set.
 */
export const wagmiConfig = PRIVY_APP_ID
  ? createPrivyConfig({ chains: [baseSepolia], transports, ssr: true })
  : createWagmiConfig({
      chains: [baseSepolia],
      connectors: [
        injected({ shimDisconnect: true }),
        ...(wcProjectId
          ? [
              walletConnect({
                projectId: wcProjectId,
                showQrModal: true,
                metadata: { name: "Stance", description: "Trade what you think happens next.", url: "https://stance.omisaur.app", icons: ["/icons/192"] },
              }),
            ]
          : []),
      ],
      transports,
      ssr: true,
    });

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
