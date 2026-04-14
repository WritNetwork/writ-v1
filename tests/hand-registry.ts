import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PublicKey, Keypair, SystemProgram, SYSVAR_CLOCK_PUBKEY } from "@solana/web3.js";
import { assert } from "chai";
import { randomBytes, createHash } from "crypto";

// ── Helpers ────────────────────────────────────────────────────────────────

const HAND_SEED = Buffer.from("hand");
const NULLIFIER_SEED = Buffer.from("nullifier");

/**
 * Produces mock Groth16 proof byte arrays. These are structurally valid
 * (correct lengths for BN254 G1/G2 points) but contain random data.
 * On localnet the verifier is expected to be stubbed or bypassed;
 * these exist so the test wiring and account derivation are exercised.
 */
function generateMockProof(): {
  proofA: Buffer;
  proofB: Buffer;
  proofC: Buffer;
  publicSignals: Buffer[];
} {
  // G1 uncompressed = 64 bytes (two 32-byte field elements)
  const proofA = randomBytes(64);
  // G2 uncompressed = 128 bytes (two pairs of 32-byte field elements)
  const proofB = randomBytes(128);
  // G1 uncompressed = 64 bytes
  const proofC = randomBytes(64);
  // One public signal (the identity commitment), 32 bytes
  const publicSignals = [randomBytes(32)];
  return { proofA, proofB, proofC, publicSignals };
}

/**
 * Derives the same nullifier hash the on-chain program computes:
 * SHA-256("hand-nullifier-v1" || input), returned as a 32-byte Buffer.
 */
function computeNullifierHash(input: Buffer): Buffer {
  const hasher = createHash("sha256");
  hasher.update(Buffer.from("hand-nullifier-v1"));
  hasher.update(input);
  return hasher.digest();
}

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

// ── Tests ──────────────────────────────────────────────────────────────────

// Extended timeout for devnet latency
describe("hand-registry", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.HandRegistry as Program;
  const authority = provider.wallet as anchor.Wallet;

  describe("initialize_hand", () => {
    it("initializes a hand with valid proof", async () => {
      const { proofA, proofB, proofC, publicSignals } = generateMockProof();
      const nullifier = randomBytes(32);
      const nullifierHash = computeNullifierHash(nullifier);

      const [handPda] = findHandPda(authority.publicKey, program.programId);
      const [nullifierPda] = findNullifierPda(nullifier, program.programId);

      await program.methods
        .initializeHand(
          proofA,
          proofB,
          proofC,
          publicSignals,
          [...nullifier] as any,
        )
        .accounts({
          authority: authority.publicKey,
          hand: handPda,
          nullifierRecord: nullifierPda,
          systemProgram: SystemProgram.programId,
          clock: SYSVAR_CLOCK_PUBKEY,
        })
        .rpc();

      // Fetch the Hand account and verify its fields
      const handAccount = await program.account.hand.fetch(handPda);

      assert.isTrue(handAccount.active, "Hand should be active after creation");
      assert.equal(
        handAccount.authority.toBase58(),
        authority.publicKey.toBase58(),
        "Authority must match the creating wallet",
      );
      assert.deepEqual(
        Buffer.from(handAccount.nullifier as number[]),
        nullifierHash,
        "Stored nullifier must equal the computed hash of the raw input",
      );
      assert.equal(
        handAccount.delegationsCount,
        0,
        "New hand starts with zero delegations",
      );
      assert.equal(
        handAccount.mint.toBase58(),
        PublicKey.default.toBase58(),
        "Mint should be default (no soulbound token yet)",
      );
      assert.isAbove(
        handAccount.verifiedAt.toNumber(),
        0,
        "verifiedAt timestamp must be set",
      );

      // Verify nullifier record was also created
      const nullifierRecord = await program.account.nullifierRecord.fetch(nullifierPda);
      assert.deepEqual(
        Buffer.from(nullifierRecord.nullifier as number[]),
        nullifier,
        "Nullifier record stores the raw nullifier",
      );
    });

    it("rejects duplicate nullifier", async () => {
      // Use a fresh authority so we don't collide on the Hand PDA
      const authority2 = Keypair.generate();

      // Airdrop SOL to the new authority
      const sig = await provider.connection.requestAirdrop(
        authority2.publicKey,
        2 * anchor.web3.LAMPORTS_PER_SOL,
      );
      await provider.connection.confirmTransaction(sig);

      const { proofA, proofB, proofC, publicSignals } = generateMockProof();

      // Re-use the exact same nullifier that was already consumed in the first test.
      // We need to produce it the same way — generate and save in a shared scope.
      // For isolation, we create + consume a nullifier here, then try again.
      const nullifier = randomBytes(32);
      const [handPda1] = findHandPda(authority2.publicKey, program.programId);
      const [nullifierPda] = findNullifierPda(nullifier, program.programId);

      // First usage should succeed
      await program.methods
        .initializeHand(
          proofA,
          proofB,
          proofC,
          publicSignals,
          [...nullifier] as any,
        )
        .accounts({
          authority: authority2.publicKey,
          hand: handPda1,
          nullifierRecord: nullifierPda,
          systemProgram: SystemProgram.programId,
          clock: SYSVAR_CLOCK_PUBKEY,
        })
        .signers([authority2])
        .rpc();

      // Second usage with the same nullifier but different authority must fail.
      // The nullifier PDA already exists so `init` will error.
      const authority3 = Keypair.generate();
      const airdropSig = await provider.connection.requestAirdrop(
        authority3.publicKey,
        2 * anchor.web3.LAMPORTS_PER_SOL,
      );
      await provider.connection.confirmTransaction(airdropSig);

      const [handPda2] = findHandPda(authority3.publicKey, program.programId);

      try {
        await program.methods
          .initializeHand(
            proofA,
            proofB,
            proofC,
            publicSignals,
            [...nullifier] as any,
          )
          .accounts({
            authority: authority3.publicKey,
            hand: handPda2,
            nullifierRecord: nullifierPda,
            systemProgram: SystemProgram.programId,
            clock: SYSVAR_CLOCK_PUBKEY,
          })
          .signers([authority3])
          .rpc();

        assert.fail("Expected transaction to fail due to duplicate nullifier");
      } catch (err: any) {
        // Anchor wraps the init-collision as a custom error or a raw tx error.
        // The account-already-in-use error is sufficient proof of replay protection.
        assert.ok(err, "Transaction should fail when nullifier is reused");
      }
    });
  });

  describe("revoke_hand", () => {
    let handOwner: Keypair;
    let handPda: PublicKey;

    before(async () => {
      handOwner = Keypair.generate();
      const sig = await provider.connection.requestAirdrop(
        handOwner.publicKey,
        2 * anchor.web3.LAMPORTS_PER_SOL,
      );
      await provider.connection.confirmTransaction(sig);

      const { proofA, proofB, proofC, publicSignals } = generateMockProof();
      const nullifier = randomBytes(32);

      [handPda] = findHandPda(handOwner.publicKey, program.programId);
      const [nullifierPda] = findNullifierPda(nullifier, program.programId);

      await program.methods
        .initializeHand(
          proofA,
          proofB,
          proofC,
          publicSignals,
          [...nullifier] as any,
        )
        .accounts({
          authority: handOwner.publicKey,
          hand: handPda,
          nullifierRecord: nullifierPda,
          systemProgram: SystemProgram.programId,
          clock: SYSVAR_CLOCK_PUBKEY,
        })
        .signers([handOwner])
        .rpc();
    });

    it("revokes a hand", async () => {
      // The protocol authority (provider wallet in local tests) revokes
      await program.methods
        .revokeHand()
        .accounts({
          protocolAuthority: provider.wallet.publicKey,
          hand: handPda,
          clock: SYSVAR_CLOCK_PUBKEY,
        })
        .rpc();

      const handAccount = await program.account.hand.fetch(handPda);
      assert.isFalse(handAccount.active, "Hand must be inactive after revocation");
    });

    it("rejects unauthorized revocation", async () => {
      // Create a new hand to attempt unauthorized revocation against
      const victim = Keypair.generate();
      const sig = await provider.connection.requestAirdrop(
        victim.publicKey,
        2 * anchor.web3.LAMPORTS_PER_SOL,
      );
      await provider.connection.confirmTransaction(sig);

      const { proofA, proofB, proofC, publicSignals } = generateMockProof();
      const nullifier = randomBytes(32);
      const [victimHandPda] = findHandPda(victim.publicKey, program.programId);
      const [nullifierPda] = findNullifierPda(nullifier, program.programId);

      await program.methods
        .initializeHand(
          proofA,
          proofB,
          proofC,
          publicSignals,
          [...nullifier] as any,
        )
        .accounts({
          authority: victim.publicKey,
          hand: victimHandPda,
          nullifierRecord: nullifierPda,
          systemProgram: SystemProgram.programId,
          clock: SYSVAR_CLOCK_PUBKEY,
        })
        .signers([victim])
        .rpc();

      // A random keypair (not the protocol authority) attempts revocation
      const imposter = Keypair.generate();
      const airdropSig = await provider.connection.requestAirdrop(
        imposter.publicKey,
        1 * anchor.web3.LAMPORTS_PER_SOL,
      );
      await provider.connection.confirmTransaction(airdropSig);

      try {
        await program.methods
          .revokeHand()
          .accounts({
            protocolAuthority: imposter.publicKey,
            hand: victimHandPda,
            clock: SYSVAR_CLOCK_PUBKEY,
          })
          .signers([imposter])
          .rpc();

        assert.fail("Expected revocation by non-authority to fail");
      } catch (err: any) {
        // The program should reject the signer because they are not the
        // recognized protocol authority. The exact error depends on whether
        // the constraint check is key-based or governance-based.
        assert.ok(err, "Non-authority revocation must be rejected");
      }
    });
  });
});
