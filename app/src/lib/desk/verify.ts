// Server-only: independent TEE verification of a 0G inference.
// processResponse(provider, chatID) fetches the provider's signature for this
// exact response and checks it against the TEE signer registered on 0G Chain.
// A throwaway read-only wallet is enough: nothing is signed or paid here.
type Broker = { inference: { processResponse: (provider: string, chatID: string) => Promise<boolean | null> } };

let brokerP: Promise<Broker> | null = null;

async function broker(): Promise<Broker> {
  if (!brokerP) {
    brokerP = (async () => {
      const { ethers } = await import("ethers");
      const { createZGComputeNetworkBroker } = await import("@0gfoundation/0g-compute-ts-sdk");
      const rpc = new ethers.JsonRpcProvider(process.env.ZG_CHAIN_RPC || "https://evmrpc.0g.ai");
      const wallet = ethers.Wallet.createRandom().connect(rpc);
      return (await createZGComputeNetworkBroker(wallet as never)) as unknown as Broker;
    })().catch((e) => {
      brokerP = null; // retry next time
      throw e;
    });
  }
  return brokerP;
}

/** true = signature valid, false = invalid, null = could not check. */
export async function verifyTee(provider: string, chatID: string, timeoutMs = 20_000): Promise<boolean | null> {
  try {
    const b = await broker();
    const r = await Promise.race([
      b.inference.processResponse(provider, chatID),
      new Promise<null>((res) => setTimeout(() => res(null), timeoutMs)),
    ]);
    return typeof r === "boolean" ? r : null;
  } catch (e) {
    console.warn("desk: tee verify failed:", e instanceof Error ? e.message : e);
    return null;
  }
}
