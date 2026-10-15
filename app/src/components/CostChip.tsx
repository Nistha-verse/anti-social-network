import { useMemo } from "react";

type CostChipProps = {
  kind: "boo" | "downvote" | "profile";
  price?: number;
  rent: number;
  fee: number;
  onConfirm: () => void;
  onCancel: () => void;
};

const sol = (lamports: number) => `${(lamports / 1_000_000_000).toFixed(6)} SOL`;

export function CostChip({ kind, price = 0, rent, fee, onConfirm, onCancel }: CostChipProps) {
  const total = useMemo(() => price + rent + fee, [fee, price, rent]);
  const isProfile = kind === "profile";
  return (
    <div className="confirm-card" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
      <div className="confirm-card__spark">✦</div>
      <span className="eyebrow">Before the wallet prompt</span>
      <h3 id="confirm-title">{isProfile ? "Leave your mark?" : kind === "boo" ? "Boo. Make it official?" : "Downvote this receipt?"}</h3>
      <div className="cost-lines">
        {!isProfile && <div><span>Price to Spite Pool</span><strong>{sol(price)}</strong></div>}
        <div><span>One-time account rent</span><strong>{sol(rent)}</strong></div>
        <div><span>Network fee</span><strong>{sol(fee)}</strong></div>
        <div className="cost-lines__total"><span>Estimated total</span><strong>{sol(total)}</strong></div>
      </div>
      <p className="fine-print">The rent keeps this {isProfile ? "profile" : "judgment"} on-chain forever and is not refundable.</p>
      <div className="confirm-card__actions">
        <button className="button button--quiet" onClick={onCancel}>Not yet</button>
        <button className="button button--primary" onClick={onConfirm}>Open wallet</button>
      </div>
    </div>
  );
}
