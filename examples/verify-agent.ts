/**
 * verify-agent.ts — Shows how to check if an agent has a valid HAND delegation.
 *
 * This is the read-side of the protocol: given an agent's public key, look up
 * their delegation, the underlying Hand identity, and reputation score. Then
 * determine if the agent passes the verification criteria.
 *
 * This pattern is useful for:
 *   - DEX frontends deciding whether to show "Verified Agent" badges
 *   - Off-chain monitoring services auditing agent behavior
 *   - Any client-side gate before allowing an agent to interact
 *
 * Usage:
 *   npx ts-node examples/verify-agent.ts <agent-pubkey> <hand-owner-pubkey>
 */

import {
  Connection,
  PublicKey,
  clusterApiUrl,
} from "@solana/web3.js";
import * as anchor from "@coral-xyz/anchor";
import { Program, AnchorProvider, Wallet } from "@coral-xyz/anchor";
import { Keypair } from "@solana/web3.js";
import { readFileSync } from "fs";

// ── Configuration ──────────────────────────────────────────────────────────

const HAND_REGISTRY_PROGRAM_ID = new PublicKey("11111111111111111111111111111111");
const DELEGATION_PROGRAM_ID = new PublicKey("11111111111111111111111111111111");
const REPUTATION_PROGRAM_ID = new PublicKey("11111111111111111111111111111111");

const HAND_SEED = Buffer.from("hand");
const DELEGATION_SEED = Buffer.from("delegation");
const REPUTATION_SEED = Buffer.from("reputation");

const ACTION_SWAP = 1;
const ACTION_STAKE = 2;
const ACTION_TRANSFER = 4;
const ACTION_VOTE = 8;
const ACTION_MINT = 16;

// ── Helpers ────────────────────────────────────────────────────────────────

function findWritPda(authority: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [HAND_SEED, authority.toBuffer()],
    HAND_REGISTRY_PROGRAM_ID,
  );
}

function findDelegationPda(hand: PublicKey, agent: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [DELEGATION_SEED, hand.toBuffer(), agent.toBuffer()],
    DELEGATION_PROGRAM_ID,
  );
}

function findReputationPda(hand: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [REPUTATION_SEED, hand.toBuffer()],
    REPUTATION_PROGRAM_ID,
  );
}

/**
 * Decode the action bitmask into a human-readable list of permissions.
 */
function decodeActions(bitmask: number): string[] {
  const actions: string[] = [];
  if (bitmask === 0xffff) return ["ALL"];
  if (bitmask & ACTION_SWAP) actions.push("SWAP");
  if (bitmask & ACTION_STAKE) actions.push("STAKE");
  if (bitmask & ACTION_TRANSFER) actions.push("TRANSFER");
  if (bitmask & ACTION_VOTE) actions.push("VOTE");
  if (bitmask & ACTION_MINT) actions.push("MINT");
  return actions;
}

function loadKeypair(): Keypair {
  const keypairPath =
    process.env.SOLANA_KEYPAIR_PATH ?? `${process.env.HOME}/.config/solana/id.json`;
  const raw = readFileSync(keypairPath, "utf-8");
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(raw)));
}

// ── Verification Logic ─────────────────────────────────────────────────────

interface VerificationResult {
  isValid: boolean;
  reason?: string;
  handActive?: boolean;
  delegationActive?: boolean;
  delegationExpired?: boolean;
  reputationScore?: number;
  allowedActions?: string[];
  budgetRemaining?: number;
}

async function verifyAgent(
  connection: Connection,
  registryProgram: Program,
  delegationProgram: Program,
  reputationProgram: Program,
  agentPubkey: PublicKey,
  handOwnerPubkey: PublicKey,
  minReputationScore: number = 0,
): Promise<VerificationResult> {
  // Step 1: Find the Hand PDA from the owner
  const [writPda] = findWritPda(handOwnerPubkey);

  // Step 2: Check if the Hand account exists and is active
  let handAccount: any;
  try {
    handAccount = await registryProgram.account.hand.fetch(writPda);
  } catch {
    return { isValid: false, reason: "Hand account not found" };
  }

  if (!handAccount.active) {
    return {
      isValid: false,
      reason: "Hand identity has been revoked",
      handActive: false,
    };
  }

  // Step 3: Find and check the Delegation PDA
  const [delegationPda] = findDelegationPda(writPda, agentPubkey);

  let delegationAccount: any;
  try {
    delegationAccount = await delegationProgram.account.delegation.fetch(
      delegationPda,
    );
  } catch {
    return {
      isValid: false,
      reason: "No delegation found for this agent + hand pair",
      handActive: true,
    };
  }

  if (!delegationAccount.active) {
    return {
      isValid: false,
      reason: "Delegation has been revoked",
      handActive: true,
      delegationActive: false,
    };
  }

  // Check expiry
  const expiresAt = delegationAccount.scope.expiresAt.toNumber();
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (expiresAt > 0 && nowSeconds > expiresAt) {
    return {
      isValid: false,
      reason: `Delegation expired at ${new Date(expiresAt * 1000).toISOString()}`,
      handActive: true,
      delegationActive: true,
      delegationExpired: true,
    };
  }

  // Check remaining budget
  const spent = delegationAccount.scope.spentLamports.toNumber();
  const total = delegationAccount.scope.maxLamportsTotal.toNumber();
  if (spent >= total) {
    return {
      isValid: false,
      reason: "Delegation budget fully consumed",
      handActive: true,
      delegationActive: true,
      delegationExpired: false,
    };
  }

  // Step 4: Check reputation (optional threshold)
  const [reputationPda] = findReputationPda(writPda);

  let reputationScore = 0;
  try {
    const repAccount = await reputationProgram.account.reputation.fetch(
      reputationPda,
    );
    reputationScore = repAccount.score;
  } catch {
    // No reputation account — treat as zero reputation
  }

  if (minReputationScore > 0 && reputationScore < minReputationScore) {
    return {
      isValid: false,
      reason: `Reputation score ${reputationScore} is below required ${minReputationScore}`,
      handActive: true,
      delegationActive: true,
      delegationExpired: false,
      reputationScore,
    };
  }

  // All checks passed
  return {
    isValid: true,
    handActive: true,
    delegationActive: true,
    delegationExpired: false,
    reputationScore,
    allowedActions: decodeActions(delegationAccount.scope.allowedActions),
    budgetRemaining: (total - spent) / 1e9,
  };
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.log("Usage: npx ts-node examples/verify-agent.ts <agent-pubkey> <hand-owner-pubkey>");
    console.log("\nExample with random keys for demonstration:");

    // Generate demo keys so the script is runnable without arguments
    const demoAgent = Keypair.generate();
    const demoOwner = Keypair.generate();
    console.log(`  Agent: ${demoAgent.publicKey.toBase58()}`);
    console.log(`  Owner: ${demoOwner.publicKey.toBase58()}`);
    console.log("\nRunning verification against devnet (will likely fail — no accounts exist)...\n");

    args[0] = demoAgent.publicKey.toBase58();
    args[1] = demoOwner.publicKey.toBase58();
  }

  const agentPubkey = new PublicKey(args[0]);
  const handOwnerPubkey = new PublicKey(args[1]);

  const connection = new Connection(clusterApiUrl("devnet"), "confirmed");
  const payer = loadKeypair();
  const wallet = new Wallet(payer);
  const provider = new AnchorProvider(connection, wallet, { commitment: "confirmed" });
  anchor.setProvider(provider);

  const registryProgram = anchor.workspace.WritRegistry as Program;
  const delegationProgram = anchor.workspace.Delegation as Program;
  const reputationProgram = anchor.workspace.Reputation as Program;

  console.log("Verifying agent:", agentPubkey.toBase58());
  console.log("Hand owner:     ", handOwnerPubkey.toBase58());
  console.log();

  // Run verification with a minimum reputation score of 3000 (30%)
  const result = await verifyAgent(
    connection,
    registryProgram,
    delegationProgram,
    reputationProgram,
    agentPubkey,
    handOwnerPubkey,
    3000,
  );

  console.log("--- Verification Result ---");

  if (result.isValid) {
    console.log("  Status:           VERIFIED");
    console.log("  Hand active:      ", result.handActive);
    console.log("  Delegation active:", result.delegationActive);
    console.log("  Reputation score: ", result.reputationScore, "/ 10000");
    console.log("  Allowed actions:  ", result.allowedActions?.join(", "));
    console.log("  Budget remaining: ", result.budgetRemaining, "SOL");
  } else {
    console.log("  Status:           REJECTED");
    console.log("  Reason:           ", result.reason);
    if (result.handActive !== undefined)
      console.log("  Hand active:      ", result.handActive);
    if (result.delegationActive !== undefined)
      console.log("  Delegation active:", result.delegationActive);
    if (result.reputationScore !== undefined)
      console.log("  Reputation score: ", result.reputationScore);
  }

  console.log("---------------------------\n");

  // -- Gate pattern usage example --
  // In a real application, you would use this result to gate access:
  //
  //   if (!result.isValid) {
  //     throw new Error(`Agent not authorized: ${result.reason}`);
  //   }
  //
  //   // Proceed with the agent's requested action...
  //   await executeSwap(agentPubkey, swapParams);
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
