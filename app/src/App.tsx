import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { BN } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import {
  BOO_PRICE,
  connection,
  costs,
  DEVNET_GENESIS_HASH,
  explorerAddress,
  explorerTransaction,
  fetchJudgments,
  fetchProfile,
  fetchProfiles,
  getProgram,
  isRetracted,
  judgmentPda,
  JudgmentRecord,
  networkStatus,
  poolBalance,
  ProfileAccount,
  profilePda,
  readRawJudgment,
  shortAddress,
  spitePoolPda,
  subscribeToJudgmentEvents,
  walletBalance,
  DOWNVOTE_PRICE,
  WalletLike,
} from "./chain";
import { SystemProgram } from "@solana/web3.js";
import { Character } from "./components/Character";
import { CostChip } from "./components/CostChip";
import { ReceiptCard } from "./components/ReceiptCard";
import { SpiteJar } from "./components/SpiteJar";

type Route = { screen: "discover" | "profile" | "me" | "pool" | "not-found"; address?: PublicKey };
type Toast = { id: number; tone: "success" | "error" | "quiet"; title: string; body: string; signature?: string; faucet?: boolean };
type Pending = { kind: "boo" | "downvote" | "profile"; target?: PublicKey; rent: number; price: number; username?: string; metadata?: string };

const DEVNET_FAUCET = "https://faucet.solana.com/";

function parseRoute(pathname: string): Route {
  if (pathname === "/" || pathname === "") return { screen: "discover" };
  if (pathname === "/me") return { screen: "me" };
  if (pathname === "/pool") return { screen: "pool" };
  if (pathname.startsWith("/w/")) {
    try { return { screen: "profile", address: new PublicKey(pathname.slice(3)) }; } catch { return { screen: "not-found" }; }
  }
  return { screen: "not-found" };
}

function navigate(path: string) {
  window.history.pushState({}, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

function friendlyError(error: unknown, balance?: number, total?: number): string {
  const message = String(error);
  if (/User rejected|rejected the request|WalletSignTransactionError/i.test(message)) return "No signature, no drama. The receipt was not created.";
  if (/insufficient|insufficient lamports|0x1/i.test(message)) {
    const amount = total ? `${(total / 1_000_000_000).toFixed(6)} SOL` : "the displayed total";
    return `You need ${amount} available in this wallet. Devnet SOL is free from the faucet.`;
  }
  if (/UsernameEmpty/i.test(message)) return "Give your profile at least one byte of personality.";
  if (/UsernameTooLong/i.test(message)) return "That username is over 32 UTF-8 bytes.";
  if (/MetadataUriTooLong/i.test(message)) return "That metadata URI is over 100 bytes.";
  if (/SelfJudgmentNotAllowed/i.test(message)) return "You cannot boo your own reflection.";
  if (/UnauthorizedRetraction/i.test(message)) return "Only the original judge can retract this receipt.";
  if (/JudgmentAlreadyRetracted/i.test(message)) return "This receipt already wears its RETRACTED stamp.";
  if (/ConstraintSeeds|seeds constraint/i.test(message)) return "This receipt got stale. Refresh and try once more.";
  if (/AccountNotInitialized|account does not exist/i.test(message)) return "Make your profile first; the chain needs an actor.";
  if (/wrong cluster|genesis/i.test(message)) return "Writes are disabled until the RPC is Solana devnet.";
  return "The RPC declined that move. Nothing was written; try again when the network is less dramatic.";
}

function formatSol(lamports: number) { return `${(lamports / 1_000_000_000).toFixed(6)} SOL`; }

function ProfileEditor({
  profile,
  onCreate,
  onUpdate,
  disabled,
}: {
  profile: ProfileAccount | null;
  onCreate: (username: string, metadata: string) => Promise<void>;
  onUpdate: (username: string, metadata: string) => Promise<void>;
  disabled: boolean;
}) {
  const [username, setUsername] = useState(profile?.username || "");
  const [metadata, setMetadata] = useState(profile?.metadataUri || "");
  const [busy, setBusy] = useState(false);
  useEffect(() => { setUsername(profile?.username || ""); setMetadata(profile?.metadataUri || ""); }, [profile]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try { await (profile ? onUpdate(username, metadata) : onCreate(username, metadata)); } finally { setBusy(false); }
  }
  return (
    <form className="profile-form" onSubmit={submit}>
      <div className="section-heading"><div><span className="eyebrow">{profile ? "Edit your character sheet" : "Start with a character sheet"}</span><h2>{profile ? "Keep the chain updated." : "Claim your on-chain corner."}</h2></div></div>
      <label>Username <span>1–32 UTF-8 bytes</span><input maxLength={32} required value={username} onChange={(event) => setUsername(event.target.value)} placeholder="Something memorable" /></label>
      <label>Metadata URI <span>0–100 bytes · plain text, optional link</span><input maxLength={100} value={metadata} onChange={(event) => setMetadata(event.target.value)} placeholder="https://… (optional)" /></label>
      <div className="form-foot"><p className="fine-print">Names are not unique. Your short wallet address stays beside it.</p><button className="button button--primary" disabled={disabled || busy}>{busy ? "Waiting…" : profile ? "Save profile" : "Create profile"}</button></div>
    </form>
  );
}

function App() {
  const { publicKey, connected, wallet } = useWallet();
  const adapter = wallet?.adapter as WalletLike | undefined;
  const [route, setRoute] = useState<Route>(() => parseRoute(window.location.pathname));
  const [network, setNetwork] = useState<{ ok: boolean; actual: string; expected: string } | null>(null);
  const [pool, setPool] = useState(0);
  const [pulse, setPulse] = useState(0);
  const [refresh, setRefresh] = useState(0);
  const [viewerProfile, setViewerProfile] = useState<ProfileAccount | null>(null);
  const [viewerBalance, setViewerBalance] = useState(0);
  const [toastId, setToastId] = useState(0);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [pending, setPending] = useState<Pending | null>(null);
  const [costState, setCostState] = useState<Awaited<ReturnType<typeof costs>> | null>(null);
  const eventJudgments = useRef(new Map<string, string>());

  const pushToast = (toast: Omit<Toast, "id">) => {
    setToastId((id) => { const next = id + 1; setToasts((current) => [...current, { ...toast, id: next }]); return next; });
  };

  useEffect(() => {
    const onPop = () => setRoute(parseRoute(window.location.pathname));
    window.addEventListener("popstate", onPop);
    networkStatus().then(setNetwork).catch((error) => pushToast({ tone: "error", title: "RPC unavailable", body: String(error) }));
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  useEffect(() => {
    let alive = true;
    const updatePool = () => poolBalance().then((value) => { if (alive) setPool(value); }).catch(() => undefined);
    updatePool();
    const poll = window.setInterval(() => { setRefresh((value) => value + 1); updatePool(); }, 10_000);
    let unsubscribe: (() => Promise<void>) | undefined;
    subscribeToJudgmentEvents((judgment, name) => {
      const key = judgment.toBase58();
      if (eventJudgments.current.get(key) === name) return;
      eventJudgments.current.set(key, name);
      setPulse((value) => value + 1);
      setRefresh((value) => value + 1);
      updatePool();
      pushToast({ tone: "quiet", title: name === "JudgmentRetracted" ? "A receipt changed" : "Fresh pettiness detected", body: `${shortAddress(judgment, 6)} is now on-chain.` });
    }).then((cleanup) => { if (alive) unsubscribe = cleanup; else cleanup(); }).catch(() => undefined);
    return () => { alive = false; window.clearInterval(poll); unsubscribe?.(); };
  }, []);

  useEffect(() => {
    if (!publicKey) { setViewerProfile(null); setViewerBalance(0); return; }
    Promise.all([fetchProfile(publicKey), walletBalance(publicKey)]).then(([profile, balance]) => { setViewerProfile(profile); setViewerBalance(balance); }).catch((error) => pushToast({ tone: "error", title: "Could not read your wallet", body: String(error) }));
  }, [publicKey, refresh]);

  async function beginJudgment(kind: "boo" | "downvote", target: PublicKey) {
    if (!connected || !publicKey) { pushToast({ tone: "quiet", title: "Connect a real wallet first", body: "The chain only accepts signatures from your wallet." }); return; }
    if (!network?.ok) { pushToast({ tone: "error", title: "Writes paused", body: "The configured RPC is not the published Solana devnet." }); return; }
    if (publicKey.equals(target)) { pushToast({ tone: "quiet", title: "Nice try", body: "You cannot judge yourself." }); return; }
    if (!viewerProfile) { pushToast({ tone: "quiet", title: "Make your profile first", body: "An on-chain actor needs an on-chain profile." }); navigate("/me"); return; }
    try {
      const pricing = await costs();
      setCostState(pricing);
      setPending({ kind, target, price: kind === "boo" ? BOO_PRICE : DOWNVOTE_PRICE, rent: pricing.judgmentRent });
    } catch (error) { pushToast({ tone: "error", title: "Could not calculate cost", body: String(error) }); }
  }

  async function sendJudgment(kind: "boo" | "downvote", target: PublicKey): Promise<string> {
    if (!publicKey || !adapter) throw new Error("Connect a wallet to sign.");
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const profile = await fetchProfile(publicKey);
      if (!profile) throw new Error("AccountNotInitialized");
      const program = getProgram(adapter);
      const id = new BN(profile.judgmentCount.toString());
      const method = kind === "boo" ? program.methods.boo(target) : program.methods.downvote(target);
      try {
        return await method.accountsPartial({ actor: publicKey, actorProfile: profilePda(publicKey), judgment: judgmentPda(publicKey, id), spitePool: spitePoolPda(), systemProgram: SystemProgram.programId }).rpc();
      } catch (error) {
        if (attempt === 0 && /ConstraintSeeds|seeds constraint|stale/i.test(String(error))) { setRefresh((value) => value + 1); continue; }
        throw error;
      }
    }
    throw new Error("The judgment became stale twice.");
  }

  async function confirmPending() {
    if (!pending) return;
    const action = pending;
    setPending(null);
    try {
      if (action.kind === "profile") {
        await createProfile(action.username || "", action.metadata || "");
        return;
      }
      const signature = await sendJudgment(action.kind, action.target!);
      pushToast({ tone: "success", title: action.kind === "boo" ? "Boo. Petty, but official." : "Downvote receipt minted.", body: "The account is permanent and readable by anyone.", signature });
      setRefresh((value) => value + 1);
    } catch (error) {
      if (/User rejected|rejected the request/i.test(String(error))) pushToast({ tone: "quiet", title: "Signature cancelled", body: "No receipt was created." });
      else pushToast({ tone: "error", title: "The chain said no", body: friendlyError(error, viewerBalance, pending.price + pending.rent + (costState?.networkFee || 5_000)), faucet: /insufficient/i.test(String(error)) });
    }
  }

  async function createProfile(username: string, metadata: string) {
    if (!publicKey || !adapter) throw new Error("Connect a wallet to sign.");
    if (!network?.ok) throw new Error("wrong cluster");
    try {
      const signature = await getProgram(adapter).methods.createProfile(username, metadata).accountsPartial({ owner: publicKey, profile: profilePda(publicKey), systemProgram: SystemProgram.programId }).rpc();
      pushToast({ tone: "success", title: "Profile created", body: "Now you can leave official receipts.", signature });
      setRefresh((value) => value + 1);
    } catch (error) { pushToast({ tone: "error", title: "Profile not created", body: friendlyError(error), faucet: /insufficient/i.test(String(error)) }); }
  }

  async function updateProfile(username: string, metadata: string) {
    if (!publicKey || !adapter) throw new Error("Connect a wallet to sign.");
    try {
      const signature = await getProgram(adapter).methods.updateProfile(username, metadata).accountsPartial({ owner: publicKey, profile: profilePda(publicKey) }).rpc();
      pushToast({ tone: "success", title: "Profile updated", body: "The chain has the latest version.", signature });
      setRefresh((value) => value + 1);
    } catch (error) { pushToast({ tone: "error", title: "Profile not updated", body: friendlyError(error), faucet: /insufficient/i.test(String(error)) }); }
  }

  async function retract(address: PublicKey) {
    if (!publicKey || !adapter || !network?.ok) { pushToast({ tone: "error", title: "Retraction paused", body: "Connect your wallet on devnet first." }); return; }
    try {
      const signature = await getProgram(adapter).methods.retractJudgment().accountsPartial({ actor: publicKey, judgment: address }).rpc();
      pushToast({ tone: "success", title: "Receipt retracted", body: "Changed your mind? The receipt stays.", signature });
      setRefresh((value) => value + 1);
    } catch (error) { pushToast({ tone: "error", title: "Could not retract", body: friendlyError(error), faucet: /insufficient/i.test(String(error)) }); }
  }

  const writeDisabled = !connected || !network?.ok;
  return (
    <div className="app-shell">
      <header className="site-header">
        <a className="brand" href="/" onClick={(event) => { event.preventDefault(); navigate("/"); }}><span className="brand__mark">✦</span><span>anti-social<br /><em>network</em></span></a>
        <nav className="main-nav" aria-label="Primary"><a className={route.screen === "discover" ? "active" : ""} href="/" onClick={(event) => { event.preventDefault(); navigate("/"); }}>Discover</a>{connected && <a className={route.screen === "me" ? "active" : ""} href="/me" onClick={(event) => { event.preventDefault(); navigate("/me"); }}>My profile</a>}<a className={route.screen === "pool" ? "active" : ""} href="/pool" onClick={(event) => { event.preventDefault(); navigate("/pool"); }}>Pool</a></nav>
        <div className="header-actions"><a className="header-jar" href="/pool" onClick={(event) => { event.preventDefault(); navigate("/pool"); }}><SpiteJar lamports={pool} pulse={pulse} compact /></a><div className="network-badge"><span>DEVNET</span><small>{network?.ok ? "writes live" : "writes paused"}</small></div><WalletMultiButton /></div>
      </header>
      <div className="network-hint"><span className="status-dot" />{network?.ok ? "Solana devnet · switch your wallet to Devnet · symbolic SOL only" : network ? `Wrong network · expected devnet genesis ${DEVNET_GENESIS_HASH.slice(0, 8)}…` : "Checking the configured RPC…"}{connected && <span className="wallet-balance">{shortAddress(publicKey!)} · {formatSol(viewerBalance)}</span>}</div>
      <main className="main-content">
        {route.screen === "discover" && <Discover connected={connected} onSearch={(address) => navigate(`/w/${address}`)} onMine={() => publicKey && navigate(`/w/${publicKey.toBase58()}`)} pool={pool} />}
        {route.screen === "profile" && route.address && <WalletProfile address={route.address} viewer={publicKey} viewerProfile={viewerProfile} refresh={refresh} writeDisabled={writeDisabled} onJudge={beginJudgment} />}
        {route.screen === "me" && <MyProfile publicKey={publicKey} profile={viewerProfile} refresh={refresh} writeDisabled={writeDisabled} onCreate={async (username, metadata) => { try { const pricing = await costs(); setCostState(pricing); setPending({ kind: "profile", price: 0, rent: pricing.profileRent, username, metadata }); } catch (error) { pushToast({ tone: "error", title: "Could not calculate profile rent", body: String(error) }); } }} onUpdate={updateProfile} onRetract={retract} />}
        {route.screen === "pool" && <PoolDetail pool={pool} pulse={pulse} />}
        {route.screen === "not-found" && <EmptyState title="That address wandered off." body="Use a full Solana wallet address and try again." />}
      </main>
      <footer className="site-footer"><span>Built for petty permanence.</span><span>Every receipt is public. Every face is derived.</span></footer>
      {pending && costState && <div className="modal-backdrop"><CostChip kind={pending.kind} price={pending.price} rent={pending.rent} fee={costState.networkFee} onConfirm={confirmPending} onCancel={() => setPending(null)} /></div>}
      {toasts.length > 0 && <div className="toast-stack" aria-live="polite">{toasts.map((toast) => <div key={toast.id} className={`toast toast--${toast.tone}`}><button className="toast__close" onClick={() => setToasts((current) => current.filter((item) => item.id !== toast.id))}>×</button><strong>{toast.title}</strong><span>{toast.body}</span>{toast.faucet && <a href={DEVNET_FAUCET} target="_blank" rel="noreferrer">Get devnet SOL from the faucet ↗</a>}{toast.signature && <a href={explorerTransaction(toast.signature)} target="_blank" rel="noreferrer">View on Explorer ↗</a>}</div>)}</div>}
    </div>
  );
}

function Discover({ connected, onSearch, onMine, pool }: { connected: boolean; onSearch: (address: string) => void; onMine: () => void; pool: number }) {
  const [address, setAddress] = useState("");
  const [error, setError] = useState("");
  function submit(event: FormEvent) {
    event.preventDefault();
    try { const key = new PublicKey(address.trim()); setError(""); onSearch(key.toBase58()); } catch { setError("That is not a valid Solana address."); }
  }
  return <section className="discover-page"><div className="hero-copy"><span className="eyebrow">A public ledger for tiny grudges</span><h1>Make it <span>official.</span></h1><p>Downvotes and boos, paid in devnet SOL, sealed on-chain forever. No leaderboard. No algorithm. Just receipts.</p></div><form className="search-box" onSubmit={submit}><label htmlFor="wallet-search">Look up a wallet</label><div><input id="wallet-search" value={address} onChange={(event) => setAddress(event.target.value)} placeholder="Paste a Solana address" /><button className="button button--primary">Search</button></div>{error && <span className="error-text">{error}</span>}</form>{connected && <button className="mine-link" onClick={onMine}>↳ View my wallet</button>}<div className="discover-grid"><div className="paper-note"><span className="eyebrow">The vibe</span><h2>Petty, not cruel.</h2><p>Fixed kinds. No free-text attacks. No rankings. Just a character, a target, and a very public receipt.</p><div className="note-doodle">(¬‿¬)</div></div><div className="discover-pool"><span className="eyebrow">Live total</span><SpiteJar lamports={pool} /><p>Tap a wallet address above to inspect its receipts.</p></div></div></section>;
}

function WalletProfile({ address, viewer, viewerProfile, refresh, writeDisabled, onJudge }: { address: PublicKey; viewer: PublicKey | null; viewerProfile: ProfileAccount | null; refresh: number; writeDisabled: boolean; onJudge: (kind: "boo" | "downvote", target: PublicKey) => void }) {
  const [profile, setProfile] = useState<ProfileAccount | null>(null);
  const [receipts, setReceipts] = useState<JudgmentRecord[]>([]);
  const [profiles, setProfiles] = useState<Map<string, ProfileAccount | null>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => { let alive = true; setLoading(true); Promise.all([fetchProfile(address), fetchJudgments(address, "received")]).then(async ([nextProfile, nextReceipts]) => { const people = await fetchProfiles(nextReceipts.flatMap((item) => [item.account.actor, item.account.target])); if (alive) { setProfile(nextProfile); setReceipts(nextReceipts); setProfiles(people); setLoading(false); } }).catch((reason) => { if (alive) { setError(String(reason)); setLoading(false); } }); return () => { alive = false; }; }, [address, refresh]);
  const own = viewer?.equals(address) || false;
  return <section className="wallet-page"><a className="back-link" href="/" onClick={(event) => { event.preventDefault(); navigate("/"); }}>← Discover</a><div className="wallet-hero"><Character pubkey={address} size={132} mood={own ? "neutral" : profile ? "side-eye" : "neutral"} /><div><span className="eyebrow">{profile ? "Wallet profile" : "Unregistered wallet"}</span><h1>{profile?.username || "A mysterious little wallet"}</h1><code>{address.toBase58()}</code>{profile?.metadataUri && (/^https?:\/\//i.test(profile.metadataUri) ? <a className="metadata-link" href={profile.metadataUri} target="_blank" rel="noopener noreferrer">{profile.metadataUri} ↗</a> : <span className="metadata-text">{profile.metadataUri}</span>)}{!profile && <p>This wallet has a face, even before it has a profile.</p>}</div></div><div className="judgment-actions"><span className="eyebrow">Leave a receipt</span><button className="button button--soft" disabled={own || writeDisabled || !viewerProfile} onClick={() => onJudge("downvote", address)}>↓ Downvote <small>0.001 SOL</small></button><button className="button button--pink" disabled={own || writeDisabled || !viewerProfile} onClick={() => onJudge("boo", address)}>◒ Boo <small>0.010 SOL</small></button>{!own && !viewerProfile && <button className="button button--quiet" onClick={() => navigate("/me")}>Make your profile first</button>}{own && <span className="fine-print">Your own wallet is off-limits. Even here.</span>}</div><div className="section-heading"><div><span className="eyebrow">Public receipts</span><h2>{loading ? "Reading the chain…" : `${receipts.length} receipt${receipts.length === 1 ? "" : "s"} received`}</h2></div></div>{error && <div className="error-panel">RPC error: {error}</div>}{!loading && !error && receipts.length === 0 && <EmptyState title="No receipts yet." body="The chain is quiet here. That is allowed." />}{!loading && receipts.map((record) => <ReceiptCard key={record.publicKey.toBase58()} record={record} profiles={profiles} />)}</section>;
}

function MyProfile({ publicKey, profile, refresh, writeDisabled, onCreate, onUpdate, onRetract }: { publicKey: PublicKey | null; profile: ProfileAccount | null; refresh: number; writeDisabled: boolean; onCreate: (username: string, metadata: string) => Promise<void>; onUpdate: (username: string, metadata: string) => Promise<void>; onRetract: (address: PublicKey) => Promise<void> }) {
  const [receipts, setReceipts] = useState<JudgmentRecord[]>([]);
  const [profiles, setProfiles] = useState<Map<string, ProfileAccount | null>>(new Map());
  const [loading, setLoading] = useState(false);
  useEffect(() => { if (!publicKey) return; let alive = true; setLoading(true); fetchJudgments(publicKey, "made").then(async (items) => { const people = await fetchProfiles(items.flatMap((item) => [item.account.actor, item.account.target])); if (alive) { setReceipts(items); setProfiles(people); setLoading(false); } }).catch(() => setLoading(false)); return () => { alive = false; }; }, [publicKey, refresh]);
  if (!publicKey) return <EmptyState title="Your profile is waiting for a wallet." body="Connect Phantom, Solflare, Backpack, or another real Wallet Standard wallet to begin." />;
  const boos = receipts.filter((item) => Object.prototype.hasOwnProperty.call(item.account.kind, "boo")).length;
  const downvotes = receipts.length - boos;
  const retractions = receipts.filter((item) => isRetracted(item.account)).length;
  const rate = receipts.length ? Math.round((retractions / receipts.length) * 100) : 0;
  const active = receipts.filter((item) => !isRetracted(item.account));
  const retracted = receipts.filter((item) => isRetracted(item.account));
  return <section className="me-page"><div className="me-hero"><Character pubkey={publicKey} mood={retractions ? "sheepish" : "neutral"} size={112} /><div><span className="eyebrow">My profile</span><h1>{profile?.username || "Unregistered wallet"}</h1><code>{publicKey.toBase58()}</code></div></div>{!profile ? <><div className="empty-callout"><strong>One small setup step.</strong><span>Create a profile before you can leave a receipt. Profile rent keeps the account on-chain forever.</span></div><ProfileEditor profile={null} onCreate={onCreate} onUpdate={onUpdate} disabled={writeDisabled} /></> : <><ProfileEditor profile={profile} onCreate={onCreate} onUpdate={onUpdate} disabled={writeDisabled} /><div className="stats-grid"><div><strong>{downvotes}</strong><span>downvotes</span></div><div><strong>{boos}</strong><span>boos</span></div><div><strong>{retractions}</strong><span>retracted</span></div><div><strong>{rate}%</strong><span>retraction rate</span></div></div><div className="section-heading"><div><span className="eyebrow">Your receipts</span><h2>{loading ? "Reading the chain…" : `${boos} boos, ${retractions} retracted (${rate}%)`}</h2></div></div>{active.length === 0 && !loading && <EmptyState title="No active receipts." body="Your wallet has not left any current marks." />}{active.map((record) => <ReceiptCard key={record.publicKey.toBase58()} record={record} profiles={profiles} viewer={publicKey} canRetract onRetract={onRetract} />)}{retracted.length > 0 && <><div className="subsection-label">Retracted receipts stay below</div>{retracted.map((record) => <ReceiptCard key={record.publicKey.toBase58()} record={record} profiles={profiles} viewer={publicKey} />)}</>}</>}</section>;
}

function PoolDetail({ pool, pulse }: { pool: number; pulse: number }) { return <section className="pool-page"><div className="pool-hero"><SpiteJar lamports={pool} pulse={pulse} /><div><span className="eyebrow">The public pot</span><h1>Spite, accounted for.</h1><p>Every Boo and Downvote sends a fixed price to this data-less System Program account. No one can withdraw it through this program.</p><a className="button button--soft" href={explorerAddress(spitePoolPda())} target="_blank" rel="noreferrer">Inspect pool on Explorer ↗</a></div></div><div className="pool-explainer"><div><span className="eyebrow">The number is truth</span><h2>{formatSol(pool)} on devnet</h2><p>The jar is a decorative scale: <code>1 − exp(−totalSOL / 5)</code>. It never overflows, and it never pretends to be a balance.</p></div><div><span className="eyebrow">What you are paying for</span><h2>Permanent receipts.</h2><p>Price: 0.001 SOL to downvote or 0.010 SOL to boo. Account rent is separate, computed live before every signature, and non-refundable.</p></div></div></section>; }

function EmptyState({ title, body }: { title: string; body: string }) { return <div className="empty-state"><div className="empty-state__face">·ᴗ·</div><h2>{title}</h2><p>{body}</p></div>; }

export default App;
