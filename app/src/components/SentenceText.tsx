import { AssetId, Direction, expiryLabel } from "@/lib/market";
import { price, usd } from "@/lib/format";

/** A stance, read back as the sentence it was made from. Emphasis by weight, not colour. */
export function SentenceText({ amount, asset, dir, target, expiry, className = "" }: { amount: number; asset: AssetId; dir: Direction; target: number; expiry: string; className?: string }) {
  return (
    <span className={className}>
      Make <b className="font-semibold text-ink">{usd(amount, { cents: false })}</b> if {asset} goes {dir} <b className="font-semibold text-ink">{price(target)}</b> by{" "}
      <b className="font-semibold text-ink">{expiryLabel(expiry)}</b>.
    </span>
  );
}
