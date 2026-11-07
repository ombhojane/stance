import { NextRequest, NextResponse } from "next/server";
import { DEPLOYMENT } from "@/lib/chain/deployment";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * A wallet's Test USD movements on Base Sepolia, labelled by the contract call behind each one.
 * Source: Basescan (Etherscan v2 multichain API); the key never leaves the server.
 */
interface Row {
  hash: string;
  at: number;
  label: string;
  amount: number; // signed, in USD
  counterparty: string;
}

const LABELS: Record<string, string> = {
  faucet: "Added test USD",
  buy: "Took a stance",
  sell: "Sold back",
  redeem: "Collected",
  deposit: "House deposit",
  withdraw: "House withdrawal",
  mint: "Minted",
  approve: "Approval",
};

export async function GET(req: NextRequest) {
  const address = req.nextUrl.searchParams.get("address")?.toLowerCase();
  if (!address || !/^0x[0-9a-f]{40}$/.test(address)) return NextResponse.json({ error: "bad address" }, { status: 400 });
  const key = process.env.ETHERSCAN_API_KEY;
  if (!key) return NextResponse.json({ rows: [], note: "activity unavailable" });

  const u = new URL("https://api.etherscan.io/v2/api");
  u.search = new URLSearchParams({
    chainid: "84532",
    module: "account",
    action: "tokentx",
    contractaddress: DEPLOYMENT.usd as string,
    address,
    page: "1",
    offset: "60",
    sort: "desc",
    apikey: key,
  }).toString();

  try {
    const r = await fetch(u, { cache: "no-store", signal: AbortSignal.timeout(8000) });
    const j = (await r.json()) as { status: string; result: unknown };
    const list = Array.isArray(j.result) ? (j.result as Record<string, string>[]) : [];
    const rows: Row[] = list.map((t) => {
      const incoming = t.to.toLowerCase() === address;
      const fn = (t.functionName || "").split("(")[0];
      const label = LABELS[fn] ?? (incoming ? "Received" : "Sent");
      const amount = (Number(t.value) / 10 ** Number(t.tokenDecimal || 6)) * (incoming ? 1 : -1);
      return { hash: t.hash, at: Number(t.timeStamp) * 1000, label, amount, counterparty: incoming ? t.from : t.to };
    });
    return NextResponse.json({ rows }, { headers: { "Cache-Control": "private, max-age=10" } });
  } catch {
    return NextResponse.json({ rows: [], note: "basescan unreachable" });
  }
}
