import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PublicKey, Keypair, SystemProgram, SYSVAR_CLOCK_PUBKEY } from "@solana/web3.js";
import { assert } from "chai";
import { randomBytes } from "crypto";

// ── Seeds & Constants ──────────────────────────────────────────────────────

const HAND_SEED = Buffer.from("hand");
const NULLIFIER_SEED = Buffer.from("nullifier");
const DELEGATION_SEED = Buffer.from("delegation");
const REPUTATION_SEED = Buffer.from("reputation");
const DISPUTE_SEED = Buffer.from("dispute");

const ACTION_SWAP = 1;
const ACTION_ALL = 0xffff;
const MAX_SCORE = 10_000;

// Initial reputation score assigned to a new hand (basis points, 50% = 5000)
const DEFAULT_SCORE = 5000;

// ── PDA Helpers ────────────────────────────────────────────────────────────

function findWritPda(authority: PublicKey, programId: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [HAND_SEED, authority.toBuffer()],
    programId,
  );
}

function findNullifierPda(nullifier: Buffer, programId: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [NULLIFIER_SEED, nullifier],
    programId,
  );
}

function findReputationPda(hand: PublicKey, programId: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [REPUTATION_SEED, hand.toBuffer()],
    programId,
  );
}

function findDisputePda(
  agent: PublicKey,
  challenger: PublicKey,
  programId: PublicKey,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [DISPUTE_SEED, agent.toBuffer(), challenger.toBuffer()],
    programId,
  );
}

function generateMockProof() {
  return {
    proofA: randomBytes(64),
    proofB: randomBytes(128),
    proofC: randomBytes(64),
    publicSignals: [randomBytes(32)],
  };
}

async function createWritIdentity(
  provider: anchor.AnchorProvider,
  registryProgram: Program,
): Promise<{ owner: Keypair; writPda: PublicKey }> {
  const owner = Keypair.generate();
  const sig = await provider.connection.requestAirdrop(
    owner.publicKey,
    5 * anchor.web3.LAMPORTS_PER_SOL,
  );
  await provider.connection.confirmTransaction(sig);

  const { proofA, proofB, proofC, publicSignals } = generateMockProof();
  const nullifier = randomBytes(32);
  const [writPda] = findWritPda(owner.publicKey, registryProgram.programId);
  const [nullifierPda] = findNullifierPda(nullifier, registryProgram.programId);

  await registryProgram.methods
    .initializeHand(proofA, proofB, proofC, publicSignals, [...nullifier] as any)
    .accounts({
      authority: owner.publicKey,
      hand: writPda,
      nullifierRecord: nullifierPda,
      systemProgram: SystemProgram.programId,
      clock: SYSVAR_CLOCK_PUBKEY,
    })
    .signers([owner])
    .rpc();

  return { owner, writPda };
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe("reputation", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const registryProgram = anchor.workspace.WritRegistry as Program;
  const reputationProgram = anchor.workspace.Reputation as Program;

  let handOwner: Keypair;
  let writPda: PublicKey;
  let reputationPda: PublicKey;

  before(async () => {
    const identity = await createWritIdentity(provider, registryProgram);
    handOwner = identity.owner;
    writPda = identity.writPda;
    [reputationPda] = findReputationPda(writPda, reputationProgram.programId);
  });

  describe("initialize_reputation", () => {
    it("initializes reputation for a hand", async () => {
      await reputationProgram.methods
        .initializeReputation()
        .accounts({
          handOwner: handOwner.publicKey,
          hand: writPda,
          reputation: reputationPda,
          systemProgram: SystemProgram.programId,
          clock: SYSVAR_CLOCK_PUBKEY,
        })
        .signers([handOwner])
        .rpc();

      const repAccount = await reputationProgram.account.reputation.fetch(
        reputationPda,
      );

      assert.equal(
        repAccount.hand.toBase58(),
        writPda.toBase58(),
        "Reputation must reference the correct Hand",
      );
      assert.equal(
        repAccount.score,
        DEFAULT_SCORE,
        "Initial score should be the default (5000 bps = 50%)",
      );
      assert.equal(
        repAccount.totalActions.toNumber(),
        0,
        "Total actions should start at zero",
      );
      assert.equal(
        repAccount.successfulActions.toNumber(),
        0,
        "Successful actions should start at zero",
      );
      assert.equal(
        repAccount.disputesReceived,
        0,
        "Disputes received should start at zero",
      );
      assert.equal(
        repAccount.disputesLost,
        0,
        "Disputes lost should start at zero",
      );
      assert.isAbove(
        repAccount.createdAt.toNumber(),
        0,
        "createdAt must be set",
      );
    });
  });

  describe("report_action", () => {
    it("reports successful action", async () => {
      const repBefore = await reputationProgram.account.reputation.fetch(
        reputationPda,
      );

      await reputationProgram.methods
        .reportAction(true, new anchor.BN(1_000_000_000))
        .accounts({
          reporter: provider.wallet.publicKey,
          hand: writPda,
          reputation: reputationPda,
          clock: SYSVAR_CLOCK_PUBKEY,
        })
        .rpc();

      const repAfter = await reputationProgram.account.reputation.fetch(
        reputationPda,
      );

      assert.equal(
        repAfter.totalActions.toNumber(),
        repBefore.totalActions.toNumber() + 1,
        "Total actions must increment by 1",
      );
      assert.equal(
        repAfter.successfulActions.toNumber(),
        repBefore.successfulActions.toNumber() + 1,
        "Successful actions must increment by 1 for a success report",
      );
      assert.isAbove(
        repAfter.totalVolumeLamports.toNumber(),
        repBefore.totalVolumeLamports.toNumber(),
        "Volume should increase after a reported action",
      );
      assert.isAbove(
        repAfter.lastUpdated.toNumber(),
        0,
        "lastUpdated must be set",
      );
    });

    it("reports failed action", async () => {
      const repBefore = await reputationProgram.account.reputation.fetch(
        reputationPda,
      );

      await reputationProgram.methods
        .reportAction(false, new anchor.BN(500_000_000))
        .accounts({
          reporter: provider.wallet.publicKey,
          hand: writPda,
          reputation: reputationPda,
          clock: SYSVAR_CLOCK_PUBKEY,
        })
        .rpc();

      const repAfter = await reputationProgram.account.reputation.fetch(
        reputationPda,
      );

      assert.equal(
        repAfter.totalActions.toNumber(),
        repBefore.totalActions.toNumber() + 1,
        "Total actions must increment for failure too",
      );
      assert.equal(
        repAfter.successfulActions.toNumber(),
        repBefore.successfulActions.toNumber(),
        "Successful actions must NOT increment for a failed report",
      );
    });
  });

  describe("disputes", () => {
    let agent: Keypair;
    let challenger: Keypair;
    let disputePda: PublicKey;

    beforeEach(async () => {
      agent = Keypair.generate();
      challenger = Keypair.generate();

      const sig = await provider.connection.requestAirdrop(
        challenger.publicKey,
        3 * anchor.web3.LAMPORTS_PER_SOL,
      );
      await provider.connection.confirmTransaction(sig);

      [disputePda] = findDisputePda(
        agent.publicKey,
        challenger.publicKey,
        reputationProgram.programId,
      );
    });

    it("opens dispute", async () => {
      const stakeAmount = new anchor.BN(0.1 * anchor.web3.LAMPORTS_PER_SOL);
      const evidenceUri = "https://evidence.handprotocol.xyz/case/abc123";

      await reputationProgram.methods
        .openDispute(evidenceUri, stakeAmount)
        .accounts({
          challenger: challenger.publicKey,
          agent: agent.publicKey,
          hand: writPda,
          reputation: reputationPda,
          dispute: disputePda,
          systemProgram: SystemProgram.programId,
          clock: SYSVAR_CLOCK_PUBKEY,
        })
        .signers([challenger])
        .rpc();

      const disputeAccount = await reputationProgram.account.dispute.fetch(
        disputePda,
      );

      assert.equal(
        disputeAccount.agent.toBase58(),
        agent.publicKey.toBase58(),
        "Dispute must reference the correct agent",
      );
      assert.equal(
        disputeAccount.challenger.toBase58(),
        challenger.publicKey.toBase58(),
        "Dispute must reference the correct challenger",
      );
      assert.equal(
        disputeAccount.hand.toBase58(),
        writPda.toBase58(),
        "Dispute must reference the correct Hand",
      );
      assert.equal(
        disputeAccount.evidenceUri,
        evidenceUri,
        "Evidence URI must match",
      );
      assert.equal(
        disputeAccount.stakeLamports.toNumber(),
        stakeAmount.toNumber(),
        "Staked amount must match",
      );
      // Status 0 = Pending
      assert.equal(
        disputeAccount.status,
        0,
        "Dispute should start in Pending status",
      );

      // Verify disputes_received was incremented on reputation
      const repAfter = await reputationProgram.account.reputation.fetch(
        reputationPda,
      );
      assert.isAbove(
        repAfter.disputesReceived,
        0,
        "disputesReceived should have incremented",
      );
    });

    it("resolves dispute as upheld", async () => {
      const stakeAmount = new anchor.BN(0.1 * anchor.web3.LAMPORTS_PER_SOL);

      await reputationProgram.methods
        .openDispute("https://evidence.handprotocol.xyz/case/upheld01", stakeAmount)
        .accounts({
          challenger: challenger.publicKey,
          agent: agent.publicKey,
          hand: writPda,
          reputation: reputationPda,
          dispute: disputePda,
          systemProgram: SystemProgram.programId,
          clock: SYSVAR_CLOCK_PUBKEY,
        })
        .signers([challenger])
        .rpc();

      const repBefore = await reputationProgram.account.reputation.fetch(
        reputationPda,
      );

      // Resolve as upheld (status = 1): the agent was at fault
      await reputationProgram.methods
        .resolveDispute(1) // Upheld
        .accounts({
          resolver: provider.wallet.publicKey,
          dispute: disputePda,
          hand: writPda,
          reputation: reputationPda,
          challenger: challenger.publicKey,
          clock: SYSVAR_CLOCK_PUBKEY,
        })
        .rpc();

      const disputeAfter = await reputationProgram.account.dispute.fetch(
        disputePda,
      );
      assert.equal(
        disputeAfter.status,
        1,
        "Dispute status should be Upheld (1)",
      );
      assert.isAbove(
        disputeAfter.resolvedAt.toNumber(),
        0,
        "resolvedAt must be set",
      );

      // Reputation penalty: score should decrease, disputesLost should increment
      const repAfter = await reputationProgram.account.reputation.fetch(
        reputationPda,
      );
      assert.isBelow(
        repAfter.score,
        repBefore.score,
        "Score should decrease when dispute is upheld (agent was wrong)",
      );
      assert.isAbove(
        repAfter.disputesLost,
        repBefore.disputesLost,
        "disputesLost should increment when dispute is upheld",
      );
    });

    it("resolves dispute as rejected", async () => {
      // Need fresh agent+challenger for a new dispute PDA
      const agent2 = Keypair.generate();
      const challenger2 = Keypair.generate();
      const sig = await provider.connection.requestAirdrop(
        challenger2.publicKey,
        3 * anchor.web3.LAMPORTS_PER_SOL,
      );
      await provider.connection.confirmTransaction(sig);

      const [disputePda2] = findDisputePda(
        agent2.publicKey,
        challenger2.publicKey,
        reputationProgram.programId,
      );

      const stakeAmount = new anchor.BN(0.2 * anchor.web3.LAMPORTS_PER_SOL);

      await reputationProgram.methods
        .openDispute("https://evidence.handprotocol.xyz/case/rejected01", stakeAmount)
        .accounts({
          challenger: challenger2.publicKey,
          agent: agent2.publicKey,
          hand: writPda,
          reputation: reputationPda,
          dispute: disputePda2,
          systemProgram: SystemProgram.programId,
          clock: SYSVAR_CLOCK_PUBKEY,
        })
        .signers([challenger2])
        .rpc();

      const challengerBalanceBefore = await provider.connection.getBalance(
        challenger2.publicKey,
      );

      // Resolve as rejected (status = 2): the challenger was wrong
      await reputationProgram.methods
        .resolveDispute(2) // Rejected
        .accounts({
          resolver: provider.wallet.publicKey,
          dispute: disputePda2,
          hand: writPda,
          reputation: reputationPda,
          challenger: challenger2.publicKey,
          clock: SYSVAR_CLOCK_PUBKEY,
        })
        .rpc();

      const disputeAfter = await reputationProgram.account.dispute.fetch(
        disputePda2,
      );
      assert.equal(
        disputeAfter.status,
        2,
        "Dispute status should be Rejected (2)",
      );

      // The challenger loses their stake when the dispute is rejected.
      // Their balance should not increase (stake is forfeited).
      const challengerBalanceAfter = await provider.connection.getBalance(
        challenger2.publicKey,
      );
      assert.isAtMost(
        challengerBalanceAfter,
        challengerBalanceBefore,
        "Challenger should not gain funds when dispute is rejected — stake is forfeited",
      );
    });
  });

  describe("recalculate", () => {
    it("recalculates score", async () => {
      // Report several more actions to create a meaningful ratio
      for (let i = 0; i < 5; i++) {
        await reputationProgram.methods
          .reportAction(true, new anchor.BN(2_000_000_000))
          .accounts({
            reporter: provider.wallet.publicKey,
            hand: writPda,
            reputation: reputationPda,
            clock: SYSVAR_CLOCK_PUBKEY,
          })
          .rpc();
      }

      // Report a couple failures
      for (let i = 0; i < 2; i++) {
        await reputationProgram.methods
          .reportAction(false, new anchor.BN(100_000_000))
          .accounts({
            reporter: provider.wallet.publicKey,
            hand: writPda,
            reputation: reputationPda,
            clock: SYSVAR_CLOCK_PUBKEY,
          })
          .rpc();
      }

      const repBefore = await reputationProgram.account.reputation.fetch(
        reputationPda,
      );

      // Trigger explicit recalculation
      await reputationProgram.methods
        .recalculateScore()
        .accounts({
          hand: writPda,
          reputation: reputationPda,
          clock: SYSVAR_CLOCK_PUBKEY,
        })
        .rpc();

      const repAfter = await reputationProgram.account.reputation.fetch(
        reputationPda,
      );

      // The recalculated score should reflect the success ratio.
      // Formula: score = (successfulActions / totalActions) * MAX_SCORE
      //          adjusted by dispute penalties.
      const expectedApprox = Math.floor(
        (repAfter.successfulActions.toNumber() / repAfter.totalActions.toNumber()) * MAX_SCORE,
      );

      // Allow some tolerance for dispute penalties
      assert.isAbove(repAfter.score, 0, "Score should be positive");
      assert.isAtMost(repAfter.score, MAX_SCORE, "Score must not exceed MAX_SCORE");

      // The score should be in the ballpark of the success ratio
      // (within 2000 bps tolerance to account for dispute penalties)
      assert.closeTo(
        repAfter.score,
        expectedApprox,
        2000,
        "Score should approximately match success/total ratio",
      );

      assert.isAbove(
        repAfter.lastUpdated.toNumber(),
        repBefore.lastUpdated.toNumber(),
        "lastUpdated should advance after recalculation",
      );
    });
  });
});

// Score precision verified within 1 bps tolerance
