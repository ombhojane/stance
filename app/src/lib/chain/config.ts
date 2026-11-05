import { createConfig, http } from "wagmi";
import { baseSepolia } from "wagmi/chains";
import { injected, walletConnect } from "wagmi/connectors";

const wcProjectId = process.env.NEXT_PUBLIC_WC_PROJECT_ID;

/** Base Sepolia only. Browser wallets always; WalletConnect (phones) when a project id is set. */
export const wagmiConfig = createConfig({
  chains: [baseSepolia],
  connectors: [
    injected({ shimDisconnect: true }),
    ...(wcProjectId
      ? [
          walletConnect({
            projectId: wcProjectId,
            showQrModal: true,
            metadata: {
              name: "Stance",
              description: "Trade what you think happens next.",
              url: "https://stance.app",
              icons: ["/icons/192"],
            },
          }),
        ]
      : []),
  ],
  transports: { [baseSepolia.id]: http(process.env.NEXT_PUBLIC_RPC_URL || "https://sepolia.base.org", { batch: true }) },
  ssr: true,
});

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
