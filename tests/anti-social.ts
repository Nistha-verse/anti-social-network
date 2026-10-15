import * as anchor from "@anchor-lang/core";
import { expect } from "chai";
import {
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import { AntiSocialNetwork } from "../target/types/anti_social_network";

describe("anti-social-network", () => {
  anchor.setProvider(anchor.AnchorProvider.env());

  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const program = anchor.workspace.antiSocialNetwork as anchor.Program<AntiSocialNetwork>;
  const programId = program.programId;
  const systemProgram = SystemProgram.programId;

  const [spitePool] = PublicKey.findProgramAddressSync([Buffer.from("spite_pool")], programId);

  function profilePda(owner: PublicKey): PublicKey {
    return PublicKey.findProgramAddressSync([Buffer.from("profile"), owner.toBuffer()], programId)[0];
  }

  function judgmentPda(actor: PublicKey, id: number | bigint): PublicKey {
    const idBuffer = Buffer.alloc(8);
    idBuffer.writeBigUInt64LE(BigInt(id));
    return PublicKey.findProgramAddressSync(
      [Buffer.from("judgment"), actor.toBuffer(), idBuffer],
      programId,
    )[0];
  }

  async function fund(wallet: Keypair, sol = 5): Promise<void> {
    const signature = await provider.connection.requestAirdrop(
      wallet.publicKey,
      sol * LAMPORTS_PER_SOL,
    );
    await provider.connection.confirmTransaction(signature, "confirmed");
  }

  async function sendAs(wallet: Keypair, builder: { transaction(): Promise<Transaction> }): Promise<string> {
    const transaction = await builder.transaction();
    const latestBlockhash = await provider.connection.getLatestBlockhash("confirmed");
    transaction.feePayer = wallet.publicKey;
    transaction.recentBlockhash = latestBlockhash.blockhash;
    transaction.sign(wallet);
    const signature = await provider.connection.sendRawTransaction(transaction.serialize());
    await provider.connection.confirmTransaction({ ...latestBlockhash, signature }, "confirmed");
    return signature;
  }

  async function createProfile(wallet: Keypair, username = "petty", metadataUri = ""): Promise<string> {
    return sendAs(
      wallet,
      program.methods.createProfile(username, metadataUri).accountsPartial({
        owner: wallet.publicKey,
        profile: profilePda(wallet.publicKey),
        systemProgram,
      }),
    );
  }

  async function expectFailure(operation: Promise<unknown>, expected: string): Promise<void> {
    const error = await operation.then(
      () => null,
      (caught) => caught,
    );
    expect(error, `expected ${expected} but the transaction succeeded`).to.not.equal(null);
    expect(String(error)).to.contain(expected);
  }

  async function createJudgment(
    instruction: "boo" | "downvote",
    actor: Keypair,
    target: PublicKey,
    id?: number,
    pool = spitePool,
  ): Promise<string> {
    const profile = profilePda(actor.publicKey);
    const actorProfile = await program.account.profile.fetch(profile);
    const nextId = id ?? Number(actorProfile.judgmentCount.toString());
    return sendAs(
      actor,
      program.methods[instruction](target).accountsPartial({
        actor: actor.publicKey,
        actorProfile: profile,
        judgment: judgmentPda(actor.publicKey, nextId),
        spitePool: pool,
        systemProgram,
      }),
    );
  }

  it("creates a profile with the specified fields and zero judgments", async () => {
    const actor = Keypair.generate();
    await fund(actor);
    await createProfile(actor, "Mildly Petty", "https://example.com/profile");

    const profile = await program.account.profile.fetch(profilePda(actor.publicKey));
    expect(profile.owner.equals(actor.publicKey)).to.equal(true);
    expect(profile.username).to.equal("Mildly Petty");
    expect(profile.metadataUri).to.equal("https://example.com/profile");
    expect(profile.judgmentCount.toString()).to.equal("0");
    expect(profile.createdAt.toString()).to.equal(profile.updatedAt.toString());
  });

  it("accepts the first-ever deposit into the fresh system-owned pool", async () => {
    const actor = Keypair.generate();
    const target = Keypair.generate().publicKey;
    await fund(actor);
    await createProfile(actor);
    expect(await provider.connection.getAccountInfo(spitePool)).to.equal(null);
    expect(await provider.connection.getMinimumBalanceForRentExemption(0)).to.equal(890_880);

    const beforePool = await provider.connection.getBalance(spitePool);
    const signature = await createJudgment("boo", actor, target);
    const afterPool = await provider.connection.getBalance(spitePool);
    expect(afterPool - beforePool).to.equal(10_000_000);
    expect((await provider.connection.getAccountInfo(spitePool))?.owner.equals(systemProgram)).to.equal(true);

    const judgment = await program.account.judgment.fetch(judgmentPda(actor.publicKey, 0));
    expect(judgment.id.toString()).to.equal("0");
    expect(judgment.actor.equals(actor.publicKey)).to.equal(true);
    expect(judgment.target.equals(target)).to.equal(true);
    expect(judgment.kind).to.have.property("boo");
    expect(judgment.amount.toString()).to.equal("10000000");
    expect(judgment.status).to.have.property("active");
    expect(judgment.retractedAt).to.equal(null);

    const transaction = await provider.connection.getTransaction(signature, {
      commitment: "confirmed",
      maxSupportedTransactionVersion: 0,
    });
    const rent = await provider.connection.getMinimumBalanceForRentExemption(108);
    expect(transaction?.meta?.fee).to.equal(5_000);
    expect(transaction?.meta?.preBalances[0]! - transaction?.meta?.postBalances[0]!).to.equal(
      10_000_000 + rent + 5_000,
    );
  });

  it("downvotes at the lower price and increments the counter", async () => {
    const actor = Keypair.generate();
    await fund(actor);
    await createProfile(actor);
    const beforePool = await provider.connection.getBalance(spitePool);
    await createJudgment("downvote", actor, Keypair.generate().publicKey);
    expect((await provider.connection.getBalance(spitePool)) - beforePool).to.equal(1_000_000);
    const judgment = await program.account.judgment.fetch(judgmentPda(actor.publicKey, 0));
    expect(judgment.kind).to.have.property("downvote");
    expect(judgment.amount.toString()).to.equal("1000000");
    expect((await program.account.profile.fetch(profilePda(actor.publicKey))).judgmentCount.toString()).to.equal("1");
  });

  it("assigns judgment ids 0, 1, and 2 in order", async () => {
    const actor = Keypair.generate();
    await fund(actor);
    await createProfile(actor);
    await createJudgment("boo", actor, Keypair.generate().publicKey);
    await createJudgment("downvote", actor, Keypair.generate().publicKey);
    await createJudgment("boo", actor, Keypair.generate().publicKey);
    for (const id of [0, 1, 2]) {
      const judgment = await program.account.judgment.fetch(judgmentPda(actor.publicKey, id));
      expect(judgment.id.toString()).to.equal(String(id));
    }
    expect((await program.account.profile.fetch(profilePda(actor.publicKey))).judgmentCount.toString()).to.equal("3");
  });

  it("retracts by the actor without refunding or closing the receipt", async () => {
    const actor = Keypair.generate();
    await fund(actor);
    await createProfile(actor);
    await createJudgment("boo", actor, Keypair.generate().publicKey);
    const judgmentAddress = judgmentPda(actor.publicKey, 0);
    const beforePool = await provider.connection.getBalance(spitePool);
    const signature = await sendAs(
      actor,
      program.methods
        .retractJudgment()
        .accountsPartial({ actor: actor.publicKey, judgment: judgmentAddress }),
    );

    const judgment = await program.account.judgment.fetch(judgmentAddress);
    expect(judgment.status).to.have.property("retracted");
    expect(judgment.retractedAt).to.not.equal(null);
    expect(await provider.connection.getBalance(spitePool)).to.equal(beforePool);
    expect((await provider.connection.getAccountInfo(judgmentAddress))?.data.length).to.equal(108);
    expect(signature).to.be.a("string");
  });

  it("rejects a spoofed actor without the actor signature", async () => {
    const actor = Keypair.generate();
    const spoofingWallet = Keypair.generate();
    await fund(actor);
    await fund(spoofingWallet);
    await createProfile(actor);
    await expectFailure(
      program.methods
        .boo(Keypair.generate().publicKey)
        .accountsPartial({
          actor: actor.publicKey,
          actorProfile: profilePda(actor.publicKey),
          judgment: judgmentPda(actor.publicKey, 0),
          spitePool,
          systemProgram,
        })
        .signers([spoofingWallet])
        .rpc(),
      "unknown signer",
    );
  });

  it("rejects retraction by a stranger and leaves it active", async () => {
    const actor = Keypair.generate();
    const stranger = Keypair.generate();
    await fund(actor);
    await fund(stranger);
    await createProfile(actor);
    await createJudgment("boo", actor, Keypair.generate().publicKey);
    const address = judgmentPda(actor.publicKey, 0);
    await expectFailure(
      program.methods
        .retractJudgment()
        .accountsPartial({ actor: stranger.publicKey, judgment: address })
        .signers([stranger])
        .rpc(),
      "UnauthorizedRetraction",
    );
    expect((await program.account.judgment.fetch(address)).status).to.have.property("active");
  });

  it("rejects a second retraction", async () => {
    const actor = Keypair.generate();
    await fund(actor);
    await createProfile(actor);
    await createJudgment("downvote", actor, Keypair.generate().publicKey);
    const address = judgmentPda(actor.publicKey, 0);
    await program.methods.retractJudgment().accountsPartial({ actor: actor.publicKey, judgment: address }).signers([actor]).rpc();
    await expectFailure(
      program.methods
        .retractJudgment()
        .accountsPartial({ actor: actor.publicKey, judgment: address })
        .signers([actor])
        .rpc(),
      "JudgmentAlreadyRetracted",
    );
  });

  it("rejects self-judgment, judging without a profile, and a stale PDA", async () => {
    const actor = Keypair.generate();
    const noProfile = Keypair.generate();
    await fund(actor);
    await fund(noProfile);
    await createProfile(actor);
    await expectFailure(createJudgment("boo", actor, actor.publicKey), "SelfJudgmentNotAllowed");
    const noProfileAddress = judgmentPda(noProfile.publicKey, 0);
    await expectFailure(
      program.methods
        .boo(actor.publicKey)
        .accountsPartial({
          actor: noProfile.publicKey,
          actorProfile: profilePda(noProfile.publicKey),
          judgment: noProfileAddress,
          spitePool,
          systemProgram,
        })
        .signers([noProfile])
        .rpc(),
      "AccountNotInitialized",
    );
    await expectFailure(createJudgment("boo", actor, Keypair.generate().publicKey, 1), "seeds constraint was violated");
  });

  it("rejects updates against another wallet's profile", async () => {
    const owner = Keypair.generate();
    const stranger = Keypair.generate();
    await fund(owner);
    await fund(stranger);
    await createProfile(owner);
    await expectFailure(
      program.methods
        .updateProfile("hijacked", "")
        .accountsPartial({ owner: stranger.publicKey, profile: profilePda(owner.publicKey) })
        .signers([stranger])
        .rpc(),
      "seeds constraint was violated",
    );
  });

  it("enforces byte lengths for usernames and metadata URIs", async () => {
    for (const [username, uri, error] of [
      ["", "", "UsernameEmpty"],
      ["a".repeat(33), "", "UsernameTooLong"],
      ["valid", "u".repeat(101), "MetadataUriTooLong"],
    ] as const) {
      const wallet = Keypair.generate();
      await fund(wallet);
      await expectFailure(createProfile(wallet, username, uri), error);
      expect(await provider.connection.getAccountInfo(profilePda(wallet.publicKey))).to.equal(null);
    }
  });

  it("rolls back an underfunded judgment completely", async () => {
    const actor = Keypair.generate();
    await fund(actor);
    await createProfile(actor);
    const balance = await provider.connection.getBalance(actor.publicKey);
    const transfer = SystemProgram.transfer({
      fromPubkey: actor.publicKey,
      toPubkey: provider.wallet.publicKey,
      lamports: balance - 1_000_000,
    });
    await provider.sendAndConfirm(new anchor.web3.Transaction().add(transfer), [actor]);
    const beforePool = await provider.connection.getBalance(spitePool);
    const beforeCount = (await program.account.profile.fetch(profilePda(actor.publicKey))).judgmentCount.toString();
    const address = judgmentPda(actor.publicKey, 0);
    await expectFailure(createJudgment("boo", actor, Keypair.generate().publicKey), "insufficient lamports");
    expect(await provider.connection.getAccountInfo(address)).to.equal(null);
    expect((await program.account.profile.fetch(profilePda(actor.publicKey))).judgmentCount.toString()).to.equal(beforeCount);
    expect(await provider.connection.getBalance(spitePool)).to.equal(beforePool);
  });

  it("rejects a fake spite pool address", async () => {
    const actor = Keypair.generate();
    await fund(actor);
    await createProfile(actor);
    await expectFailure(
      createJudgment("boo", actor, Keypair.generate().publicKey, undefined, Keypair.generate().publicKey),
      "seeds constraint was violated",
    );
  });

  it("keeps the exact 205/108 account layouts and documented raw offsets", async () => {
    const actor = Keypair.generate();
    const target = Keypair.generate().publicKey;
    await fund(actor);
    await createProfile(actor);
    await createJudgment("boo", actor, target);

    const profileInfo = await provider.connection.getAccountInfo(profilePda(actor.publicKey));
    const judgmentAddress = judgmentPda(actor.publicKey, 0);
    const judgmentInfo = await provider.connection.getAccountInfo(judgmentAddress);
    expect(profileInfo?.data.length).to.equal(205);
    expect(judgmentInfo?.data.length).to.equal(108);
    const data = judgmentInfo!.data;
    const decoded = await program.account.judgment.fetch(judgmentAddress);
    expect(new PublicKey(data.subarray(16, 48)).equals(decoded.actor)).to.equal(true);
    expect(new PublicKey(data.subarray(48, 80)).equals(decoded.target)).to.equal(true);
    expect(data[80]).to.equal(1);
    expect(data.readBigUInt64LE(81).toString()).to.equal(decoded.amount.toString());
    expect(data[89]).to.equal(0);
  });
});
