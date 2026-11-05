import { AssetId, Direction, expiryLabel } from "@/lib/market";
import { price, usd } from "@/lib/format";

/** Read-only rendering of a call as the sentence the user typed. */
export function SentenceText({ amount, asset, dir, target, expiry, className = "" }: { amount: number; asset: AssetId; dir: Direction; target: number; expiry: string; className?: string }) {
  return (
    <span className={className}>
      Make <b className="font-semibold text-up">{usd(amount, { cents: false })}</b> <span className="serif text-mute">if</span> <b className="font-semibold">{asset}</b> is{" "}
      <b className={`font-semibold ${dir === "above" ? "text-up" : "text-down"}`}>{dir}</b> <b className="font-semibold">{price(target)}</b>{" "}
      <span className="serif text-mute">by</span> <b className="font-semibold">{expiryLabel(expiry)}</b>
    </span>
  );
}
