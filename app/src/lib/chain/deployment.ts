import type { Address } from "viem";

/**
 * Base Sepolia addresses written by contracts/script/Deploy.s.sol
 * (contracts/deployments/84532.json). Empty market → the app runs in demo mode.
 */
export const DEPLOYMENT = {
  chainId: 84532,
  market: "0xF0b865ebf18815C4f0B6f96D0356EB0E799c4BF7" as Address | "",
  app: "0xA1085bf16cd72e4AE8EBf8238CD6FBf48048c9AC" as Address | "",
  usd: "0x106f0B7C54f8E2Bfd5A204b37874DFada7F044ff" as Address | "",
  feed: "0x4aDC67696bA383F43DD60A9e78F2C97Fbbfc7cb1" as Address,
  aqua: "0xa2FaF9D614861B483b5D97BA850591b2328c6381" as Address | "",
  guard: "0x5234f46121A8a44a86e1EF020BdD97D4CaDBe9Ca" as Address | "",
  receiver: "0x616C1D81570feb237cA7Dd148732929ED1787B94" as Address | "",
  deployBlock: 54946541n,
};

export const LIVE = DEPLOYMENT.market !== "";

export const EXPLORER = "https://sepolia.basescan.org";
