import { useState } from "react";
import { PublicKey } from "@solana/web3.js";
import {
  explorerAddress,
  isBoo,
  isRetracted,
  JudgmentRecord,
  ProfileMap,
  readRawJudgment,
  shortAddress,
} from "../chain";
import { Character } from "./Character";

type ReceiptCardProps = {
  record: JudgmentRecord;
  profiles: ProfileMap;
  viewer?: PublicKey;
  canRetract?: boolean;
  onRetract?: (address: PublicKey) => void;
};

const displayDate = (timestamp: string) => {
  const value = Number(timestamp) * 1000;
  return Number.isFinite(value) ? new Date(value).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : "Timestamp unavailable";
};

export function ReceiptCard({ record, profiles, viewer, canRetract = false, onRetract }: ReceiptCardProps) {
  const { publicKey, account } = record;
  const boo = isBoo(account);
  const retracted = isRetracted(account);
  const [verifyOpen, setVerifyOpen] = useState(false);
  const [raw, setRaw] = useState<Awaited<ReturnType<typeof readRawJudgment>> | null>(null);
  const [rawError, setRawError] = useState<string | null>(null);
  const actorProfile = profiles.get(account.actor.toBase58());
  const targetProfile = profiles.get(account.target.toBase58());
  const actorName = actorProfile?.username || shortAddress(account.actor);
  const targetName = targetProfile?.username || shortAddress(account.target);

  async function toggleVerify() {
    setVerifyOpen((value) => !value);
    if (!raw && !rawError) {
      try { setRaw(await readRawJudgment(publicKey)); } catch (error) { setRawError(error instanceof Error ? error.message : "Could not read raw bytes."); }
    }
  }

  return (
    <article className={`receipt ${retracted ? "receipt--retracted" : ""}`}>
      {retracted && <div className="receipt__stamp">RETRACTED</div>}
      <div className="receipt__topline">
        <span className={`kind-pill kind-pill--${boo ? "boo" : "downvote"}`}>{boo ? "◒ Boo" : "↓ Downvote"}</span>
        <span className="receipt__date">{displayDate(account.createdAt.toString())}</span>
      </div>
      <div className="receipt__people">
        <div className="receipt__person">
          <Character pubkey={account.actor} mood={retracted ? "sheepish" : "smug"} size={64} />
          <div><span className="eyebrow">Judge</span><strong>{actorName}</strong><small>{shortAddress(account.actor)}</small></div>
        </div>
        <div className="receipt__arrow" aria-hidden="true">→</div>
        <div className="receipt__person receipt__person--target">
          <Character pubkey={account.target} mood={retracted ? "neutral" : "side-eye"} size={64} />
          <div><span className="eyebrow">Target</span><strong>{targetName}</strong><small>{shortAddress(account.target)}</small></div>
        </div>
      </div>
      <div className="receipt__details">
        <span>Paid <b>{(Number(account.amount.toString()) / 1_000_000_000).toFixed(3)} SOL</b> to make it permanent.</span>
        <span className={`status status--${retracted ? "retracted" : "active"}`}>{retracted ? "Retracted" : "Active"}</span>
      </div>
      {retracted && <p className="receipt__retraction">Changed their mind at {displayDate(account.retractedAt?.toString() || "")}.</p>}
      <div className="receipt__actions">
        <button className="text-button" onClick={toggleVerify} aria-expanded={verifyOpen}>▣ {verifyOpen ? "Hide bytes" : "Verify it yourself"}</button>
        <a className="text-button" href={explorerAddress(publicKey)} target="_blank" rel="noreferrer">Explorer ↗</a>
        {canRetract && !retracted && onRetract && <button className="text-button text-button--danger" onClick={() => onRetract(publicKey)}>Retract</button>}
      </div>
      {verifyOpen && (
        <div className="verify-panel">
          <div className="verify-panel__heading"><span className="eyebrow">Live account read</span><code>{shortAddress(publicKey, 8)}</code></div>
          {rawError && <p className="error-text">{rawError}</p>}
          {raw && <div className="verify-grid">
            <div><code>16…47</code><span>actor</span><strong>{shortAddress(raw.actor, 7)}</strong></div>
            <div><code>48…79</code><span>target</span><strong>{shortAddress(raw.target, 7)}</strong></div>
            <div><code>80</code><span>kind</span><strong>{raw.kind === 1 ? "Boo (1)" : "Downvote (0)"}</strong></div>
            <div><code>81…88</code><span>amount</span><strong>{raw.amount.toString()} lamports</strong></div>
            <div><code>89</code><span>status</span><strong>{raw.status === 1 ? "Retracted (1)" : "Active (0)"}</strong></div>
          </div>}
          <p className="fine-print">These bytes came directly from RPC. No database is in the middle.</p>
        </div>
      )}
    </article>
  );
}
