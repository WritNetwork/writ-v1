/**
 * mint-writ.ts — Standalone script demonstrating how to mint a HAND identity.
 *
 * This script walks through the full flow:
 *   1. Load or generate a Solana keypair
 *   2. Derive the Hand and NullifierRecord PDAs
 *   3. Build a mock ZK proof (replace with real proof generation in production)
 *   4. Send the initialize_hand transaction
 *   5. Read back and display the on-chain Hand account
 *
 * Usage:
 *   npx ts-node examples/mint-writ.ts
 *
 * Requires a funded devnet wallet at ~/.config/solana/id.json
 * or set SOLANA_KEYPAIR_PATH env variable.
 */

import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  SYSVAR_CLOCK_PUBKEY,
  Transaction,
  TransactionInstruction,
  clusterApiUrl,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import * as anchor from "@coral-xyz/anchor";
import { Program, AnchorProvider, Wallet } from "@coral-xyz/anchor";
import { readFileSync } from "fs";
import { randomBytes, createHash } from "crypto";

// ── Configuration ──────────────────────────────────────────────────────────

// Replace with actual deployed program ID
const HAND_REGISTRY_PROGRAM_ID = new PublicKey(
  "11111111111111111111111111111111",
);

const HAND_SEED = Buffer.from("hand");
const NULLIFIER_SEED = Buffer.from("nullifier");

// ── Keypair Loading ────────────────────────────────────────────────────────

function loadKeypair(): Keypair {
  const keypairPath =
    process.env.SOLANA_KEYPAIR_PATH ?? `${process.env.HOME}/.config/solana/id.json`;
  const raw = readFileSync(keypairPath, "utf-8");
  const secretKey = Uint8Array.from(JSON.parse(raw));
  return Keypair.fromSecretKey(secretKey);
}

// ── PDA Derivation ─────────────────────────────────────────────────────────

function findWritPda(authority: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [HAND_SEED, authority.toBuffer()],
    HAND_REGISTRY_PROGRAM_ID,
  );
}

function findNullifierPda(nullifier: Buffer): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [NULLIFIER_SEED, nullifier],
    HAND_REGISTRY_PROGRAM_ID,
  );
}

// ── Mock Proof Generation ──────────────────────────────────────────────────

/**
 * In production this would call your ZK prover (e.g. snarkjs or a Groth16
 * proving service) with the user's biometric/identity commitment.
 * For this example we generate random bytes of the correct sizes.
 */
function generateProof(): {
  proofA: Buffer;
  proofB: Buffer;
  proofC: Buffer;
  publicSignals: Buffer[];
  nullifier: Buffer;
} {
  return {
    proofA: randomBytes(64),   // G1 uncompressed on BN254
    proofB: randomBytes(128),  // G2 uncompressed on BN254
    proofC: randomBytes(64),   // G1 uncompressed on BN254
    publicSignals: [randomBytes(32)],
    nullifier: randomBytes(32),
  };
}

/**
 * Mirrors the on-chain nullifier hash computation.
 */
function computeNullifierHash(input: Buffer): Buffer {
  const hasher = createHash("sha256");
  hasher.update(Buffer.from("hand-nullifier-v1"));
  hasher.update(input);
  return hasher.digest();
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  // 1. Establish connection and load wallet
  const connection = new Connection(clusterApiUrl("devnet"), "confirmed");
  const payer = loadKeypair();
  const wallet = new Wallet(payer);
  const provider = new AnchorProvider(connection, wallet, {
    commitment: "confirmed",
  });
  anchor.setProvider(provider);

  console.log("Wallet:", payer.publicKey.toBase58());

  // Check balance — minting requires rent for two accounts
  const balance = await connection.getBalance(payer.publicKey);
  const requiredLamports = 0.01 * 1e9; // ~0.01 SOL for rent
  if (balance < requiredLamports) {
    console.error(
      `Insufficient balance: ${balance / 1e9} SOL. Need at least 0.01 SOL.`,
    );
    console.log("Fund your wallet: solana airdrop 2 --url devnet");
    process.exit(1);
  }

  // 2. Generate the ZK proof and nullifier
  const { proofA, proofB, proofC, publicSignals, nullifier } = generateProof();
  const nullifierHash = computeNullifierHash(nullifier);

  console.log("Nullifier hash:", nullifierHash.toString("hex"));

  // 3. Derive PDAs
  const [writPda, writBump] = findWritPda(payer.publicKey);
  const [nullifierPda, nullifierBump] = findNullifierPda(nullifier);

  console.log("Hand PDA:", writPda.toBase58());
  console.log("Nullifier PDA:", nullifierPda.toBase58());

  // 4. Load the program IDL and create the program interface
  // In a real deployment, fetch the IDL from chain or import it statically
  const program = anchor.workspace.WritRegistry as Program;

  // 5. Build and send the initialize_hand transaction
  console.log("\nSending initialize_hand transaction...");

  const txSig = await program.methods
    .initializeHand(
      proofA,
      proofB,
      proofC,
      publicSignals,
      [...nullifier] as any,
    )
    .accounts({
      authority: payer.publicKey,
      hand: writPda,
      nullifierRecord: nullifierPda,
      systemProgram: SystemProgram.programId,
      clock: SYSVAR_CLOCK_PUBKEY,
    })
    .rpc();

  console.log("Transaction confirmed:", txSig);
  console.log(
    `Explorer: https://explorer.solana.com/tx/${txSig}?cluster=devnet`,
  );

  // 6. Read back the Hand account and display its contents
  const handAccount = await program.account.hand.fetch(writPda);

  console.log("\n--- HAND Identity Created ---");
  console.log("  Authority:         ", handAccount.authority.toBase58());
  console.log("  Active:            ", handAccount.active);
  console.log("  Verified at:       ", new Date(handAccount.verifiedAt.toNumber() * 1000).toISOString());
  console.log("  Delegations count: ", handAccount.delegationsCount);
  console.log("  Nullifier (hex):   ", Buffer.from(handAccount.nullifier as number[]).toString("hex"));
  console.log("  Bump:              ", handAccount.bump);
  console.log("  Hand PDA:          ", writPda.toBase58());
  console.log("-----------------------------\n");
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
