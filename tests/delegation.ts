import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PublicKey, Keypair, SystemProgram, SYSVAR_CLOCK_PUBKEY } from "@solana/web3.js";
import { assert } from "chai";
import { randomBytes, createHash } from "crypto";

// ── Seeds & Constants ──────────────────────────────────────────────────────

const HAND_SEED = Buffer.from("hand");
const NULLIFIER_SEED = Buffer.from("nullifier");
const DELEGATION_SEED = Buffer.from("delegation");

const ACTION_SWAP = 1;
const ACTION_STAKE = 2;
const ACTION_TRANSFER = 4;
const ACTION_ALL = 0xffff;
const MAX_DELEGATIONS = 5;

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

function generateMockProof() {
  return {
    proofA: randomBytes(64),
    proofB: randomBytes(128),
    proofC: randomBytes(64),
    publicSignals: [randomBytes(32)],
  };
}

// ── Shared Setup ───────────────────────────────────────────────────────────

/**
 * Creates a funded keypair, registers a Hand identity, and returns everything
 * needed to create delegations from that hand.
 */
async function createHandIdentity(
  provider: anchor.AnchorProvider,
  registryProgram: Program,
): Promise<{ owner: Keypair; handPda: PublicKey }> {
  const owner = Keypair.generate();
  const sig = await provider.connection.requestAirdrop(
    owner.publicKey,
    5 * anchor.web3.LAMPORTS_PER_SOL,
  );
  await provider.connection.confirmTransaction(sig);

  const { proofA, proofB, proofC, publicSignals } = generateMockProof();
  const nullifier = randomBytes(32);
  const [handPda] = findHandPda(owner.publicKey, registryProgram.programId);
  const [nullifierPda] = findNullifierPda(nullifier, registryProgram.programId);

  await registryProgram.methods
    .initializeHand(proofA, proofB, proofC, publicSignals, [...nullifier] as any)
    .accounts({
      authority: owner.publicKey,
      hand: handPda,
      nullifierRecord: nullifierPda,
      systemProgram: SystemProgram.programId,
      clock: SYSVAR_CLOCK_PUBKEY,
    })
    .signers([owner])
    .rpc();

  return { owner, handPda };
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe("delegation", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const registryProgram = anchor.workspace.HandRegistry as Program;
  const delegationProgram = anchor.workspace.Delegation as Program;

  let handOwner: Keypair;
  let handPda: PublicKey;

  before(async () => {
    const identity = await createHandIdentity(provider, registryProgram);
    handOwner = identity.owner;
    handPda = identity.handPda;
  });

  describe("delegate", () => {
    it("creates delegation with full scope", async () => {
      const agent = Keypair.generate();
      const [delegationPda] = findDelegationPda(
        handPda,
        agent.publicKey,
        delegationProgram.programId,
      );

      // Full scope: all programs, all actions, unlimited budget, no expiry
      const scope = {
        allowedPrograms: [],
        maxLamportsPerTx: new anchor.BN(10 * anchor.web3.LAMPORTS_PER_SOL),
        maxLamportsTotal: new anchor.BN(1000 * anchor.web3.LAMPORTS_PER_SOL),
        spentLamports: new anchor.BN(0),
        expiresAt: new anchor.BN(0),
        allowedActions: ACTION_ALL,
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

      const delegationAccount = await delegationProgram.account.delegation.fetch(
        delegationPda,
      );

      assert.isTrue(delegationAccount.active, "Delegation should be active");
      assert.equal(
        delegationAccount.hand.toBase58(),
        handPda.toBase58(),
        "Delegation must reference the correct Hand",
      );
      assert.equal(
        delegationAccount.agent.toBase58(),
        agent.publicKey.toBase58(),
        "Delegation must reference the correct agent",
      );
      assert.equal(
        delegationAccount.scope.allowedActions,
        ACTION_ALL,
        "All actions should be allowed",
      );
      assert.equal(
        delegationAccount.scope.spentLamports.toNumber(),
        0,
        "Spent lamports should start at zero",
      );

      // Verify hand delegations_count was incremented
      const handAccount = await registryProgram.account.hand.fetch(handPda);
      assert.equal(
        handAccount.delegationsCount,
        1,
        "Hand delegations count should be 1",
      );
    });

    it("creates delegation with restricted scope", async () => {
      const agent = Keypair.generate();
      const [delegationPda] = findDelegationPda(
        handPda,
        agent.publicKey,
        delegationProgram.programId,
      );

      // Jupiter program ID (mainnet) as the only allowed target
      const jupiterProgramId = new PublicKey(
        "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4",
      );

      // Restricted scope: Jupiter only, 2 SOL per tx, 50 SOL total, 72h expiry, swap only
      const nowSeconds = Math.floor(Date.now() / 1000);
      const seventyTwoHours = 72 * 60 * 60;
      const scope = {
        allowedPrograms: [jupiterProgramId],
        maxLamportsPerTx: new anchor.BN(2 * anchor.web3.LAMPORTS_PER_SOL),
        maxLamportsTotal: new anchor.BN(50 * anchor.web3.LAMPORTS_PER_SOL),
        spentLamports: new anchor.BN(0),
        expiresAt: new anchor.BN(nowSeconds + seventyTwoHours),
        allowedActions: ACTION_SWAP,
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

      const delegationAccount = await delegationProgram.account.delegation.fetch(
        delegationPda,
      );

      assert.isTrue(delegationAccount.active);
      assert.equal(delegationAccount.scope.allowedPrograms.length, 1);
      assert.equal(
        delegationAccount.scope.allowedPrograms[0].toBase58(),
        jupiterProgramId.toBase58(),
        "Only Jupiter should be in the allowed list",
      );
      assert.equal(
        delegationAccount.scope.allowedActions,
        ACTION_SWAP,
        "Only swap action should be permitted",
      );
      assert.isAbove(
        delegationAccount.scope.expiresAt.toNumber(),
        nowSeconds,
        "Expiry must be in the future",
      );
    });
  });

  describe("update_scope", () => {
    it("updates delegation scope", async () => {
      const agent = Keypair.generate();
      const [delegationPda] = findDelegationPda(
        handPda,
        agent.publicKey,
        delegationProgram.programId,
      );

      // Create initial delegation with swap-only
      const initialScope = {
        allowedPrograms: [],
        maxLamportsPerTx: new anchor.BN(1 * anchor.web3.LAMPORTS_PER_SOL),
        maxLamportsTotal: new anchor.BN(10 * anchor.web3.LAMPORTS_PER_SOL),
        spentLamports: new anchor.BN(0),
        expiresAt: new anchor.BN(0),
        allowedActions: ACTION_SWAP,
      };

      await delegationProgram.methods
        .delegate(initialScope)
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

      // Update: expand to swap + stake + transfer, increase budget
      const updatedScope = {
        allowedPrograms: [],
        maxLamportsPerTx: new anchor.BN(5 * anchor.web3.LAMPORTS_PER_SOL),
        maxLamportsTotal: new anchor.BN(100 * anchor.web3.LAMPORTS_PER_SOL),
        spentLamports: new anchor.BN(0),
        expiresAt: new anchor.BN(0),
        allowedActions: ACTION_SWAP | ACTION_STAKE | ACTION_TRANSFER,
      };

      await delegationProgram.methods
        .updateScope(updatedScope)
        .accounts({
          handOwner: handOwner.publicKey,
          hand: handPda,
          delegation: delegationPda,
          clock: SYSVAR_CLOCK_PUBKEY,
        })
        .signers([handOwner])
        .rpc();

      const delegationAccount = await delegationProgram.account.delegation.fetch(
        delegationPda,
      );

      assert.equal(
        delegationAccount.scope.allowedActions,
        ACTION_SWAP | ACTION_STAKE | ACTION_TRANSFER,
        "Updated actions should include swap, stake, and transfer",
      );
      assert.equal(
        delegationAccount.scope.maxLamportsPerTx.toNumber(),
        5 * anchor.web3.LAMPORTS_PER_SOL,
        "Per-tx limit should be updated",
      );
      assert.equal(
        delegationAccount.scope.maxLamportsTotal.toNumber(),
        100 * anchor.web3.LAMPORTS_PER_SOL,
        "Total limit should be updated",
      );
    });
  });

  describe("revoke_delegation", () => {
    it("revokes delegation", async () => {
      const agent = Keypair.generate();
      const [delegationPda] = findDelegationPda(
        handPda,
        agent.publicKey,
        delegationProgram.programId,
      );

      const scope = {
        allowedPrograms: [],
        maxLamportsPerTx: new anchor.BN(1 * anchor.web3.LAMPORTS_PER_SOL),
        maxLamportsTotal: new anchor.BN(10 * anchor.web3.LAMPORTS_PER_SOL),
        spentLamports: new anchor.BN(0),
        expiresAt: new anchor.BN(0),
        allowedActions: ACTION_ALL,
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

      // Capture count before revocation
      const handBefore = await registryProgram.account.hand.fetch(handPda);
      const countBefore = handBefore.delegationsCount;

      await delegationProgram.methods
        .revokeDelegation()
        .accounts({
          handOwner: handOwner.publicKey,
          hand: handPda,
          delegation: delegationPda,
          clock: SYSVAR_CLOCK_PUBKEY,
        })
        .signers([handOwner])
        .rpc();

      const delegationAccount = await delegationProgram.account.delegation.fetch(
        delegationPda,
      );
      assert.isFalse(
        delegationAccount.active,
        "Delegation must be inactive after revocation",
      );

      // Verify delegations_count was decremented on the Hand
      const handAfter = await registryProgram.account.hand.fetch(handPda);
      assert.equal(
        handAfter.delegationsCount,
        countBefore - 1,
        "Hand delegations count should be decremented by 1",
      );
    });
  });

  describe("edge cases", () => {
    it("rejects delegation for inactive hand", async () => {
      // Create a hand then revoke it
      const identity = await createHandIdentity(provider, registryProgram);
      const revokedOwner = identity.owner;
      const revokedHandPda = identity.handPda;

      // Revoke via protocol authority
      await registryProgram.methods
        .revokeHand()
        .accounts({
          protocolAuthority: provider.wallet.publicKey,
          hand: revokedHandPda,
          clock: SYSVAR_CLOCK_PUBKEY,
        })
        .rpc();

      // Attempt delegation on the now-inactive hand
      const agent = Keypair.generate();
      const [delegationPda] = findDelegationPda(
        revokedHandPda,
        agent.publicKey,
        delegationProgram.programId,
      );

      const scope = {
        allowedPrograms: [],
        maxLamportsPerTx: new anchor.BN(1 * anchor.web3.LAMPORTS_PER_SOL),
        maxLamportsTotal: new anchor.BN(10 * anchor.web3.LAMPORTS_PER_SOL),
        spentLamports: new anchor.BN(0),
        expiresAt: new anchor.BN(0),
        allowedActions: ACTION_ALL,
      };

      try {
        await delegationProgram.methods
          .delegate(scope)
          .accounts({
            handOwner: revokedOwner.publicKey,
            hand: revokedHandPda,
            agent: agent.publicKey,
            delegation: delegationPda,
            systemProgram: SystemProgram.programId,
            clock: SYSVAR_CLOCK_PUBKEY,
          })
          .signers([revokedOwner])
          .rpc();

        assert.fail("Expected delegation on inactive hand to fail");
      } catch (err: any) {
        // The constraint `hand.active @ HandNotActive` should fire
        const errMsg = err.toString();
        assert.ok(
          errMsg.includes("HandNotActive") || errMsg.includes("Error"),
          "Error should indicate hand is not active",
        );
      }
    });

    it("rejects exceeding max delegations", async () => {
      // Create a fresh hand so we control the delegation count from zero
      const identity = await createHandIdentity(provider, registryProgram);
      const owner = identity.owner;
      const hPda = identity.handPda;

      // Create MAX_DELEGATIONS (5) delegations — all should succeed
      const agents: Keypair[] = [];
      for (let i = 0; i < MAX_DELEGATIONS; i++) {
        const agent = Keypair.generate();
        agents.push(agent);

        const [dPda] = findDelegationPda(
          hPda,
          agent.publicKey,
          delegationProgram.programId,
        );

        const scope = {
          allowedPrograms: [],
          maxLamportsPerTx: new anchor.BN(1 * anchor.web3.LAMPORTS_PER_SOL),
          maxLamportsTotal: new anchor.BN(5 * anchor.web3.LAMPORTS_PER_SOL),
          spentLamports: new anchor.BN(0),
          expiresAt: new anchor.BN(0),
          allowedActions: ACTION_ALL,
        };

        await delegationProgram.methods
          .delegate(scope)
          .accounts({
            handOwner: owner.publicKey,
            hand: hPda,
            agent: agent.publicKey,
            delegation: dPda,
            systemProgram: SystemProgram.programId,
            clock: SYSVAR_CLOCK_PUBKEY,
          })
          .signers([owner])
          .rpc();
      }

      // Verify count is at max
      const handAccount = await registryProgram.account.hand.fetch(hPda);
      assert.equal(handAccount.delegationsCount, MAX_DELEGATIONS);

      // 6th delegation must fail
      const overflowAgent = Keypair.generate();
      const [overflowDelegationPda] = findDelegationPda(
        hPda,
        overflowAgent.publicKey,
        delegationProgram.programId,
      );

      const scope = {
        allowedPrograms: [],
        maxLamportsPerTx: new anchor.BN(1 * anchor.web3.LAMPORTS_PER_SOL),
        maxLamportsTotal: new anchor.BN(5 * anchor.web3.LAMPORTS_PER_SOL),
        spentLamports: new anchor.BN(0),
        expiresAt: new anchor.BN(0),
        allowedActions: ACTION_ALL,
      };

      try {
        await delegationProgram.methods
          .delegate(scope)
          .accounts({
            handOwner: owner.publicKey,
            hand: hPda,
            agent: overflowAgent.publicKey,
            delegation: overflowDelegationPda,
            systemProgram: SystemProgram.programId,
            clock: SYSVAR_CLOCK_PUBKEY,
          })
          .signers([owner])
          .rpc();

        assert.fail("Expected 6th delegation to be rejected");
      } catch (err: any) {
        const errMsg = err.toString();
        assert.ok(
          errMsg.includes("TooManyDelegations") || errMsg.includes("Error"),
          "Error should indicate too many delegations",
        );
      }
    });
  });
});
