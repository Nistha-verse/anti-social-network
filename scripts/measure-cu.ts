import * as anchor from "@anchor-lang/core";
import { readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  Transaction,
} from "@solana/web3.js";

type Measurement = { instruction: string; signature: string; computeUnits: number };

const rpcUrl = process.env.ANCHOR_PROVIDER_URL ?? process.env.VITE_RPC_URL ?? "https://api.devnet.solana.com";
const walletPath = process.env.ANCHOR_WALLET ?? join(homedir(), ".config", "solana", "id.json");
const wallet = new anchor.Wallet(
  Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(walletPath, "utf8")))),
);
const connection = new anchor.web3.Connection(rpcUrl, "confirmed");
const provider = new anchor.AnchorProvider(connection, wallet, { commitment: "confirmed" });
const idl = JSON.parse(readFileSync("target/idl/anti_social_network.json", "utf8"));
const program = new anchor.Program(idl, provider) as any;

const [spitePool] = PublicKey.findProgramAddressSync([Buffer.from("spite_pool")], program.programId);
const systemProgram = anchor.web3.SystemProgram.programId;

function profilePda(owner: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync([Buffer.from("profile"), owner.toBuffer()], program.programId)[0];
}

function judgmentPda(actor: PublicKey, id: number): PublicKey {
  const idBytes = Buffer.alloc(8);
  idBytes.writeBigUInt64LE(BigInt(id));
  return PublicKey.findProgramAddressSync(
    [Buffer.from("judgment"), actor.toBuffer(), idBytes],
    program.programId,
  )[0];
}

async function sendAs(walletKeypair: Keypair, method: any): Promise<string> {
  const transaction = (await method.transaction()) as Transaction;
  const latestBlockhash = await connection.getLatestBlockhash("confirmed");
  transaction.feePayer = walletKeypair.publicKey;
  transaction.recentBlockhash = latestBlockhash.blockhash;
  transaction.sign(walletKeypair);
  const signature = await connection.sendRawTransaction(transaction.serialize());
  await connection.confirmTransaction({ ...latestBlockhash, signature }, "confirmed");
  return signature;
}

async function computeUnits(signature: string): Promise<number> {
  const transaction = await connection.getTransaction(signature, {
    commitment: "confirmed",
    maxSupportedTransactionVersion: 0,
  });
  const value = transaction?.meta?.computeUnitsConsumed;
  if (value === undefined) throw new Error(`No compute-unit metadata for ${signature}`);
  return value;
}

async function ensureFunds(actor: Keypair): Promise<void> {
  const balance = await connection.getBalance(actor.publicKey, "confirmed");
  if (balance >= 2 * LAMPORTS_PER_SOL) return;
  try {
    const signature = await connection.requestAirdrop(actor.publicKey, 2 * LAMPORTS_PER_SOL);
    await connection.confirmTransaction(signature, "confirmed");
    return;
  } catch {
    const fundingTransaction = new Transaction().add(
      anchor.web3.SystemProgram.transfer({
        fromPubkey: wallet.publicKey,
        toPubkey: actor.publicKey,
        lamports: 2 * LAMPORTS_PER_SOL,
      }),
    );
    const latestBlockhash = await connection.getLatestBlockhash("confirmed");
    fundingTransaction.feePayer = wallet.publicKey;
    fundingTransaction.recentBlockhash = latestBlockhash.blockhash;
    fundingTransaction.sign(wallet.payer);
    const signature = await connection.sendRawTransaction(fundingTransaction.serialize());
    await connection.confirmTransaction({ ...latestBlockhash, signature }, "confirmed");
  }
}

function updateReadme(measurements: Measurement[]): void {
  const table = [
    "| Instruction | Compute units consumed | Signature |",
    "| --- | ---: | --- |",
    ...measurements.map((item) => `| \`${item.instruction}\` | ${item.computeUnits} | [${item.signature.slice(0, 12)}](https://explorer.solana.com/tx/${item.signature}?cluster=devnet) |`),
  ].join("\n");
  const marker = /<!-- MEASURED_CU_START -->[\s\S]*?<!-- MEASURED_CU_END -->/;
  const block = `<!-- MEASURED_CU_START -->\n${table}\n<!-- MEASURED_CU_END -->`;
  const current = readFileSync("README.md", "utf8");
  writeFileSync("README.md", marker.test(current) ? current.replace(marker, block) : `${current}\n\n${block}\n`);
}

async function main(): Promise<void> {
  const actor = Keypair.generate();
  const target = Keypair.generate().publicKey;
  await ensureFunds(actor);

  const measurements: Measurement[] = [];
  const createSignature = await sendAs(
    actor,
    program.methods.createProfile("CU probe", "").accountsPartial({
      owner: actor.publicKey,
      profile: profilePda(actor.publicKey),
      systemProgram,
    }),
  );
  measurements.push({ instruction: "create_profile", signature: createSignature, computeUnits: await computeUnits(createSignature) });

  const updateSignature = await sendAs(
    actor,
    program.methods.updateProfile("CU probe updated", "").accountsPartial({
      owner: actor.publicKey,
      profile: profilePda(actor.publicKey),
    }),
  );
  measurements.push({ instruction: "update_profile", signature: updateSignature, computeUnits: await computeUnits(updateSignature) });

  const downvoteSignature = await sendAs(
    actor,
    program.methods.downvote(target).accountsPartial({
      actor: actor.publicKey,
      actorProfile: profilePda(actor.publicKey),
      judgment: judgmentPda(actor.publicKey, 0),
      spitePool,
      systemProgram,
    }),
  );
  measurements.push({ instruction: "downvote", signature: downvoteSignature, computeUnits: await computeUnits(downvoteSignature) });

  const booSignature = await sendAs(
    actor,
    program.methods.boo(target).accountsPartial({
      actor: actor.publicKey,
      actorProfile: profilePda(actor.publicKey),
      judgment: judgmentPda(actor.publicKey, 1),
      spitePool,
      systemProgram,
    }),
  );
  measurements.push({ instruction: "boo", signature: booSignature, computeUnits: await computeUnits(booSignature) });

  const retractSignature = await sendAs(
    actor,
    program.methods.retractJudgment().accountsPartial({
      actor: actor.publicKey,
      judgment: judgmentPda(actor.publicKey, 1),
    }),
  );
  measurements.push({ instruction: "retract_judgment", signature: retractSignature, computeUnits: await computeUnits(retractSignature) });

  updateReadme(measurements);
  console.table(measurements);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
