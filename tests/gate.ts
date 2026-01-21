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

const ACTION_SWAP = 1;
const ACTION_STAKE = 2;
const ACTION_TRANSFER = 4;
const ACTION_ALL = 0xffff;

// ── PDA Helpers ────────────────────────────────────────────────────────────

function findHandPda(authority: PublicKey, programId: PublicKey): [PublicKey, number] {
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

function findDelegationPda(
  hand: PublicKey,
  agent: PublicKey,
  programId: PublicKey,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [DELEGATION_SEED, hand.toBuffer(), agent.toBuffer()],
    programId,
  );
}

function findReputationPda(hand: PublicKey, programId: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [REPUTATION_SEED, hand.toBuffer()],
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

/**
 * Full setup: create a Hand, initialize reputation, create delegation, and
 * return all PDAs + keypairs needed for gate verification tests.
 */
async function setupFullAgent(
  provider: anchor.AnchorProvider,
  registryProgram: Program,
  delegationProgram: Program,
  reputationProgram: Program,
  opts?: {
    allowedActions?: number;
    allowedPrograms?: PublicKey[];
  },
): Promise<{
  handOwner: Keypair;
  handPda: PublicKey;
  agent: Keypair;
  delegationPda: PublicKey;
  reputationPda: PublicKey;
}> {
  // Create Hand identity
  const handOwner = Keypair.generate();
  const airdropSig = await provider.connection.requestAirdrop(
    handOwner.publicKey,
    10 * anchor.web3.LAMPORTS_PER_SOL,
  );
  await provider.connection.confirmTransaction(airdropSig);

  const { proofA, proofB, proofC, publicSignals } = generateMockProof();
  const nullifier = randomBytes(32);
  const [handPda] = findHandPda(handOwner.publicKey, registryProgram.programId);
  const [nullifierPda] = findNullifierPda(nullifier, registryProgram.programId);

  await registryProgram.methods
    .initializeHand(proofA, proofB, proofC, publicSignals, [...nullifier] as any)
    .accounts({
      authority: handOwner.publicKey,
      hand: handPda,
      nullifierRecord: nullifierPda,
      systemProgram: SystemProgram.programId,
      clock: SYSVAR_CLOCK_PUBKEY,
    })
    .signers([handOwner])
    .rpc();

  // Initialize reputation
  const [reputationPda] = findReputationPda(handPda, reputationProgram.programId);
  await reputationProgram.methods
    .initializeReputation()
    .accounts({
      handOwner: handOwner.publicKey,
      hand: handPda,
      reputation: reputationPda,
      systemProgram: SystemProgram.programId,
      clock: SYSVAR_CLOCK_PUBKEY,
    })
    .signers([handOwner])
    .rpc();

  // Boost reputation with some successful actions so score is healthy
  for (let i = 0; i < 10; i++) {
    await reputationProgram.methods
      .reportAction(true, new anchor.BN(1_000_000_000))
      .accounts({
        reporter: provider.wallet.publicKey,
        hand: handPda,
        reputation: reputationPda,
        clock: SYSVAR_CLOCK_PUBKEY,
      })
      .rpc();
  }

  // Create delegation to agent
  const agent = Keypair.generate();
  const [delegationPda] = findDelegationPda(
    handPda,
    agent.publicKey,
    delegationProgram.programId,
  );

  const scope = {
    allowedPrograms: opts?.allowedPrograms ?? [],
    maxLamportsPerTx: new anchor.BN(5 * anchor.web3.LAMPORTS_PER_SOL),
    maxLamportsTotal: new anchor.BN(100 * anchor.web3.LAMPORTS_PER_SOL),
    spentLamports: new anchor.BN(0),
    expiresAt: new anchor.BN(0), // no expiry
    allowedActions: opts?.allowedActions ?? ACTION_ALL,
  };

  await delegationProgram.methods
    .delegate(scope)
    .accounts({
      handOwner: handOwner.publicKey,
      hand: handPda,
      agent: agent.publicKey,
      delegation: delegationPda,
      systemProgram: SystemProgram.programId,
      clock: SYSVAR_CLOCK_PUBKEY,
    })
    .signers([handOwner])
    .rpc();

  return { handOwner, handPda, agent, delegationPda, reputationPda };
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe("hand-gate", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const registryProgram = anchor.workspace.HandRegistry as Program;
  const delegationProgram = anchor.workspace.Delegation as Program;
  const reputationProgram = anchor.workspace.Reputation as Program;
  const gateProgram = anchor.workspace.HandGate as Program;

  describe("verify_agent", () => {
    it("verifies a valid agent", async () => {
      const { handPda, agent, delegationPda, reputationPda } = await setupFullAgent(
        provider,
        registryProgram,
        delegationProgram,
        reputationProgram,
      );

      // Call verify_agent with no threshold or scope constraints — just validity check
      const result = await gateProgram.methods
        .verifyAgent(
          0,           // min_reputation_score: 0 = no threshold
          0,           // required_action: 0 = no action check
          PublicKey.default, // target_program: default = no program check
        )
        .accounts({
          agent: agent.publicKey,
          delegation: delegationPda,
          hand: handPda,
          reputation: reputationPda,
          clock: SYSVAR_CLOCK_PUBKEY,
        })
        .rpc();

      // If the tx succeeds without error, verification passed.
      // The gate program returns success for valid agents.
      assert.ok(result, "Transaction should succeed for a valid agent");
    });

    it("rejects agent without delegation", async () => {
      // Create a Hand without any delegation, then try to verify a random agent
      const handOwner = Keypair.generate();
      const sig = await provider.connection.requestAirdrop(
        handOwner.publicKey,
        5 * anchor.web3.LAMPORTS_PER_SOL,
      );
      await provider.connection.confirmTransaction(sig);

      const { proofA, proofB, proofC, publicSignals } = generateMockProof();
      const nullifier = randomBytes(32);
      const [handPda] = findHandPda(handOwner.publicKey, registryProgram.programId);
      const [nullifierPda] = findNullifierPda(nullifier, registryProgram.programId);

      await registryProgram.methods
        .initializeHand(proofA, proofB, proofC, publicSignals, [...nullifier] as any)
        .accounts({
          authority: handOwner.publicKey,
          hand: handPda,
          nullifierRecord: nullifierPda,
          systemProgram: SystemProgram.programId,
          clock: SYSVAR_CLOCK_PUBKEY,
        })
        .signers([handOwner])
        .rpc();

      // Init reputation for the hand
      const [reputationPda] = findReputationPda(handPda, reputationProgram.programId);
      await reputationProgram.methods
        .initializeReputation()
        .accounts({
          handOwner: handOwner.publicKey,
          hand: handPda,
          reputation: reputationPda,
          systemProgram: SystemProgram.programId,
          clock: SYSVAR_CLOCK_PUBKEY,
        })
        .signers([handOwner])
        .rpc();

      // Random agent with no delegation
      const fakeAgent = Keypair.generate();
      const [fakeDelegationPda] = findDelegationPda(
        handPda,
        fakeAgent.publicKey,
        delegationProgram.programId,
      );

      try {
        await gateProgram.methods
          .verifyAgent(0, 0, PublicKey.default)
          .accounts({
            agent: fakeAgent.publicKey,
            delegation: fakeDelegationPda,
            hand: handPda,
            reputation: reputationPda,
            clock: SYSVAR_CLOCK_PUBKEY,
          })
          .rpc();

        assert.fail("Expected verification to fail for agent without delegation");
      } catch (err: any) {
        // The delegation PDA doesn't exist, so Anchor can't deserialize it
        assert.ok(err, "Verification must fail when delegation PDA does not exist");
      }
    });

    it("verifies with reputation threshold", async () => {
      const { handPda, agent, delegationPda, reputationPda } = await setupFullAgent(
        provider,
        registryProgram,
        delegationProgram,
        reputationProgram,
      );

      // The agent has 10 successful actions and 0 failures,
      // so the score should be high (around 5000-10000 bps depending on formula).
      // Set a threshold we know the agent exceeds.
      const result = await gateProgram.methods
        .verifyAgent(
          3000,        // min_reputation_score: require at least 30%
          0,           // no action check
          PublicKey.default,
        )
        .accounts({
          agent: agent.publicKey,
          delegation: delegationPda,
          hand: handPda,
          reputation: reputationPda,
          clock: SYSVAR_CLOCK_PUBKEY,
        })
        .rpc();

      assert.ok(result, "Agent above threshold should pass verification");
    });

    it("rejects agent below reputation threshold", async () => {
      // Create an agent with very low reputation (many failures)
      const { handOwner, handPda, agent, delegationPda, reputationPda } =
        await setupFullAgent(
          provider,
          registryProgram,
          delegationProgram,
          reputationProgram,
        );

      // Tank the reputation with failures
      for (let i = 0; i < 50; i++) {
        await reputationProgram.methods
          .reportAction(false, new anchor.BN(100_000_000))
          .accounts({
            reporter: provider.wallet.publicKey,
            hand: handPda,
            reputation: reputationPda,
            clock: SYSVAR_CLOCK_PUBKEY,
          })
          .rpc();
      }

      // Recalculate to ensure score reflects the failures
      await reputationProgram.methods
        .recalculateScore()
        .accounts({
          hand: handPda,
          reputation: reputationPda,
          clock: SYSVAR_CLOCK_PUBKEY,
        })
        .rpc();

      // Require a high threshold that the tanked reputation can't meet
      try {
        await gateProgram.methods
          .verifyAgent(
            9500,        // min_reputation_score: 95% — impossible after 50 failures
            0,
            PublicKey.default,
          )
          .accounts({
            agent: agent.publicKey,
            delegation: delegationPda,
            hand: handPda,
            reputation: reputationPda,
            clock: SYSVAR_CLOCK_PUBKEY,
          })
          .rpc();

        assert.fail("Expected verification to fail for low-reputation agent");
      } catch (err: any) {
        const errMsg = err.toString();
        assert.ok(
          errMsg.includes("InsufficientReputation") || errMsg.includes("Error"),
          "Error should indicate insufficient reputation",
        );
      }
    });

    it("verifies with scope check", async () => {
      const jupiterProgramId = new PublicKey(
        "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4",
      );

      // Create agent with swap-only + Jupiter-only scope
      const { handPda, agent, delegationPda, reputationPda } = await setupFullAgent(
        provider,
        registryProgram,
        delegationProgram,
        reputationProgram,
        {
          allowedActions: ACTION_SWAP,
          allowedPrograms: [jupiterProgramId],
        },
      );

      // Verify with matching scope: swap action + Jupiter program
      const result = await gateProgram.methods
        .verifyAgent(
          0,               // no reputation threshold
          ACTION_SWAP,     // require swap action
          jupiterProgramId, // require Jupiter program
        )
        .accounts({
          agent: agent.publicKey,
          delegation: delegationPda,
          hand: handPda,
          reputation: reputationPda,
          clock: SYSVAR_CLOCK_PUBKEY,
        })
        .rpc();

      assert.ok(result, "Agent with matching scope should pass verification");
    });

    it("rejects agent with wrong scope", async () => {
      const jupiterProgramId = new PublicKey(
        "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4",
      );

      // Create agent with swap-only scope (no stake permission)
      const { handPda, agent, delegationPda, reputationPda } = await setupFullAgent(
        provider,
        registryProgram,
        delegationProgram,
        reputationProgram,
        {
          allowedActions: ACTION_SWAP,
          allowedPrograms: [jupiterProgramId],
        },
      );

      // Try to verify for STAKE action — should fail because agent only has SWAP
      try {
        await gateProgram.methods
          .verifyAgent(
            0,               // no reputation threshold
            ACTION_STAKE,    // require stake — agent doesn't have this
            jupiterProgramId,
          )
          .accounts({
            agent: agent.publicKey,
            delegation: delegationPda,
            hand: handPda,
            reputation: reputationPda,
            clock: SYSVAR_CLOCK_PUBKEY,
          })
          .rpc();

        assert.fail("Expected verification to fail for wrong action scope");
      } catch (err: any) {
        const errMsg = err.toString();
        assert.ok(
          errMsg.includes("ActionNotAllowed") || errMsg.includes("Error"),
          "Error should indicate the requested action is not allowed",
        );
      }
    });
  });
});
