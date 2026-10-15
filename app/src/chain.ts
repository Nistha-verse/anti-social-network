import { AnchorProvider, BN, Idl, Program } from "@coral-xyz/anchor";
import { Connection, PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import idlJson from "./idl/anti_social_network.json";

export const RPC_URL = import.meta.env.VITE_RPC_URL || "https://api.devnet.solana.com";
export const PROGRAM_ID = new PublicKey(
  import.meta.env.VITE_PROGRAM_ID || "D6a8LBt3wiGQGp1oEXnvUCJNTQoMJmSnFfTNJSRAKH9m",
);
export const DEVNET_GENESIS_HASH = "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG";
export const DOWNVOTE_PRICE = 1_000_000;
export const BOO_PRICE = 10_000_000;
export const BASE_FEE = 5_000;
export const PROFILE_SIZE = 205;
export const JUDGMENT_SIZE = 108;
export const SYSTEM_PROGRAM = SystemProgram.programId;

export const connection = new Connection(RPC_URL, "confirmed");
export const idl = idlJson as Idl;

function seed(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

export type WalletLike = {
  publicKey: PublicKey;
  signTransaction: (transaction: Transaction) => Promise<Transaction>;
  signAllTransactions?: (transactions: Transaction[]) => Promise<Transaction[]>;
};

export type ProfileAccount = {
  owner: PublicKey;
  username: string;
  metadataUri: string;
  judgmentCount: BN;
  createdAt: BN;
  updatedAt: BN;
  bump: number;
};

export type JudgmentAccount = {
  id: BN;
  actor: PublicKey;
  target: PublicKey;
  kind: { downvote?: Record<string, never>; boo?: Record<string, never> };
  amount: BN;
  status: { active?: Record<string, never>; retracted?: Record<string, never> };
  createdAt: BN;
  retractedAt: BN | null;
  bump: number;
};

export type JudgmentRecord = {
  publicKey: PublicKey;
  account: JudgmentAccount;
};

export type ProfileMap = Map<string, ProfileAccount | null>;

export function profilePda(owner: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync([seed("profile"), owner.toBytes()], PROGRAM_ID)[0];
}

export function judgmentPda(actor: PublicKey, id: BN | number | bigint): PublicKey {
  const bytes = new Uint8Array(8);
  new DataView(bytes.buffer).setBigUint64(0, BigInt(id.toString()), true);
  return PublicKey.findProgramAddressSync([seed("judgment"), actor.toBytes(), bytes], PROGRAM_ID)[0];
}

export function spitePoolPda(): PublicKey {
  return PublicKey.findProgramAddressSync([seed("spite_pool")], PROGRAM_ID)[0];
}

export const SPITE_POOL = spitePoolPda();

export function explorerAddress(address: PublicKey): string {
  return `https://explorer.solana.com/address/${address.toBase58()}?cluster=devnet`;
}

export function explorerTransaction(signature: string): string {
  return `https://explorer.solana.com/tx/${signature}?cluster=devnet`;
}

export function shortAddress(address: PublicKey | string, chars = 4): string {
  const value = typeof address === "string" ? address : address.toBase58();
  return `${value.slice(0, chars)}…${value.slice(-chars)}`;
}

export function getProgram(wallet?: WalletLike): Program {
  if (!wallet) return new Program(idl, { connection } as AnchorProvider);
  const provider = new AnchorProvider(connection, wallet as never, { commitment: "confirmed" });
  return new Program(idl, provider);
}

export async function networkStatus(): Promise<{ ok: boolean; actual: string; expected: string }> {
  const actual = await connection.getGenesisHash();
  return { ok: actual === DEVNET_GENESIS_HASH, actual, expected: DEVNET_GENESIS_HASH };
}

export async function fetchProfile(owner: PublicKey): Promise<ProfileAccount | null> {
  const info = await connection.getAccountInfo(profilePda(owner), "confirmed");
  if (!info) return null;
  return (getProgram().coder.accounts.decode("Profile", info.data) as ProfileAccount);
}

export async function fetchJudgments(
  owner: PublicKey,
  direction: "received" | "made",
): Promise<JudgmentRecord[]> {
  const offset = direction === "received" ? 48 : 16;
  const program = getProgram();
  const accounts = await (program.account as any).judgment.all([
    { memcmp: { offset, bytes: owner.toBase58() } },
  ]);
  return (accounts as JudgmentRecord[]).sort(
    (a, b) => Number(b.account.createdAt.toString()) - Number(a.account.createdAt.toString()),
  );
}

export async function fetchProfiles(owners: PublicKey[]): Promise<ProfileMap> {
  const unique = [...new Map(owners.map((owner) => [owner.toBase58(), owner])).values()];
  const infos = await connection.getMultipleAccountsInfo(unique.map(profilePda), "confirmed");
  const profiles: ProfileMap = new Map();
  unique.forEach((owner, index) => {
    const info = infos[index];
    profiles.set(
      owner.toBase58(),
      info ? (getProgram().coder.accounts.decode("Profile", info.data) as ProfileAccount) : null,
    );
  });
  return profiles;
}

export async function poolBalance(): Promise<number> {
  return connection.getBalance(SPITE_POOL, "confirmed");
}

export async function walletBalance(owner: PublicKey): Promise<number> {
  return connection.getBalance(owner, "confirmed");
}

export function isBoo(judgment: JudgmentAccount): boolean {
  return Object.prototype.hasOwnProperty.call(judgment.kind, "boo");
}

export function isRetracted(judgment: JudgmentAccount): boolean {
  return Object.prototype.hasOwnProperty.call(judgment.status, "retracted");
}

export async function costs(): Promise<{
  profileRent: number;
  judgmentRent: number;
  networkFee: number;
}> {
  const [profileRent, judgmentRent] = await Promise.all([
    connection.getMinimumBalanceForRentExemption(PROFILE_SIZE),
    connection.getMinimumBalanceForRentExemption(JUDGMENT_SIZE),
  ]);
  return { profileRent, judgmentRent, networkFee: BASE_FEE };
}

export async function readRawJudgment(address: PublicKey): Promise<{
  data: Uint8Array;
  actor: PublicKey;
  target: PublicKey;
  kind: number;
  amount: bigint;
  status: number;
}> {
  const info = await connection.getAccountInfo(address, "confirmed");
  if (!info) throw new Error("This receipt account is no longer available from the RPC.");
  const data = new Uint8Array(info.data);
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  return {
    data,
    actor: new PublicKey(data.subarray(16, 48)),
    target: new PublicKey(data.subarray(48, 80)),
    kind: data[80],
    amount: view.getBigUint64(81, true),
    status: data[89],
  };
}

export async function subscribeToJudgmentEvents(
  onChange: (judgment: PublicKey, eventName: string) => void,
): Promise<() => Promise<void>> {
  const program = getProgram();
  const registrations: Array<{ name: string; id: number }> = [];
  for (const name of ["Booed", "Downvoted", "JudgmentRetracted"]) {
    const id = await (program as any).addEventListener(name, (event: { judgment?: PublicKey }) => {
      if (event?.judgment) onChange(event.judgment, name);
    });
    registrations.push({ name, id });
  }
  return async () => {
    for (const registration of registrations) {
      await (program as any).removeEventListener(registration.id);
    }
  };
}
