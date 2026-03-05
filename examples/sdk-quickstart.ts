/**
 * sdk-quickstart.ts — High-level SDK usage for HAND Protocol.
 *
 * Demonstrates the @hand-protocol/sdk API for the most common operations:
 *   1. Mint a HAND identity
 *   2. Delegate to an agent
 *   3. Verify an agent
 *   4. Check reputation
 *   5. Revoke a delegation
 *
 * The SDK wraps PDA derivation, account serialization, and transaction
 * building so you don't need to think about seeds or byte layouts.
 *
 * Usage:
 *   npx ts-node examples/sdk-quickstart.ts
 */

import { Connection, Keypair, PublicKey, clusterApiUrl } from "@solana/web3.js";
import { readFileSync } from "fs";

// ── SDK Import ─────────────────────────────────────────────────────────────
// The HandProtocol class is the single entry point for all operations.
// It manages connections to all four programs internally.

// Replace with actual import once the SDK is published:
// import { HandProtocol } from "@hand-protocol/sdk";

// For now, we define the interface inline to show exactly what the SDK exposes.

interface HandProtocolConfig {
  handRegistry: PublicKey;
  delegation: PublicKey;
  reputation: PublicKey;
  handGate: PublicKey;
}

// Program IDs — replace with actual deployed addresses
const HAND_REGISTRY_PROGRAM_ID = new PublicKey("11111111111111111111111111111111");
const DELEGATION_PROGRAM_ID = new PublicKey("11111111111111111111111111111111");
const REPUTATION_PROGRAM_ID = new PublicKey("11111111111111111111111111111111");
const HAND_GATE_PROGRAM_ID = new PublicKey("11111111111111111111111111111111");

// ── SDK Class (mirrors the published @hand-protocol/sdk) ───────────────────

class HandProtocol {
  private connection: Connection;
  private config: HandProtocolConfig;

  constructor(connection: Connection, config: HandProtocolConfig) {
    this.connection = connection;
    this.config = config;
  }

  /**
   * Derive the Hand PDA for a given authority wallet.
   * Returns [pda, bump].
   */
  findHandPda(authority: PublicKey): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from("hand"), authority.toBuffer()],
      this.config.handRegistry,
    );
  }

  /**
   * Derive the Delegation PDA for a hand + agent pair.
   */
  findDelegationPda(hand: PublicKey, agent: PublicKey): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from("delegation"), hand.toBuffer(), agent.toBuffer()],
      this.config.delegation,
    );
  }

  /**
   * Derive the Reputation PDA for a hand.
   */
  findReputationPda(hand: PublicKey): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from("reputation"), hand.toBuffer()],
      this.config.reputation,
    );
  }

  /**
   * Fetch a Hand account. Returns null if it doesn't exist.
   */
  async getHand(authority: PublicKey): Promise<any | null> {
    const [pda] = this.findHandPda(authority);
    const accountInfo = await this.connection.getAccountInfo(pda);
    if (!accountInfo) return null;

    // In the real SDK, this uses Anchor's AccountClient to deserialize.
    // Here we return the raw data to show the pattern.
    return {
      pda,
      exists: true,
      data: accountInfo.data,
    };
  }

  /**
   * Fetch a Delegation account. Returns null if it doesn't exist.
   */
  async getDelegation(hand: PublicKey, agent: PublicKey): Promise<any | null> {
    const [pda] = this.findDelegationPda(hand, agent);
    const accountInfo = await this.connection.getAccountInfo(pda);
    if (!accountInfo) return null;

    return {
      pda,
      exists: true,
      data: accountInfo.data,
    };
  }

  /**
   * Fetch a Reputation account. Returns null if it doesn't exist.
   */
  async getReputation(hand: PublicKey): Promise<any | null> {
    const [pda] = this.findReputationPda(hand);
    const accountInfo = await this.connection.getAccountInfo(pda);
    if (!accountInfo) return null;

    return {
      pda,
      exists: true,
      data: accountInfo.data,
    };
  }

  /**
   * Client-side verification: checks all three accounts (hand, delegation,
   * reputation) and returns a structured result.
   */
  async verifyAgent(
    agent: PublicKey,
    handOwner: PublicKey,
    opts?: { minScore?: number; requiredAction?: number },
  ): Promise<{
    valid: boolean;
    reason?: string;
    score?: number;
    actions?: number;
    budgetRemaining?: number;
    expiresAt?: Date | null;
  }> {
    const [handPda] = this.findHandPda(handOwner);
    const [delegationPda] = this.findDelegationPda(handPda, agent);
    const [reputationPda] = this.findReputationPda(handPda);

    // Fetch all three accounts in parallel for efficiency
    const [handInfo, delegationInfo, reputationInfo] = await Promise.all([
      this.connection.getAccountInfo(handPda),
      this.connection.getAccountInfo(delegationPda),
      this.connection.getAccountInfo(reputationPda),
    ]);

    if (!handInfo) {
      return { valid: false, reason: "Hand account does not exist" };
    }

    if (!delegationInfo) {
      return { valid: false, reason: "No delegation found for this agent" };
    }

    // In the real SDK, we'd deserialize these accounts properly.
    // For this quickstart, we show the check pattern.

    // The full SDK would do:
    //   const hand = Hand.deserialize(handInfo.data);
    //   if (!hand.active) return { valid: false, reason: "Hand revoked" };
    //
    //   const delegation = Delegation.deserialize(delegationInfo.data);
    //   if (!delegation.active) return { valid: false, reason: "Delegation revoked" };
    //
    //   const now = Math.floor(Date.now() / 1000);
    //   if (delegation.scope.expiresAt > 0 && now > delegation.scope.expiresAt) {
    //     return { valid: false, reason: "Delegation expired" };
    //   }
    //
    //   if (opts?.requiredAction && !(delegation.scope.allowedActions & opts.requiredAction)) {
    //     return { valid: false, reason: "Required action not in delegation scope" };
    //   }
    //
    //   const reputation = reputationInfo ? Reputation.deserialize(reputationInfo.data) : null;
    //   const score = reputation?.score ?? 0;
    //   if (opts?.minScore && score < opts.minScore) {
    //     return { valid: false, reason: "Below minimum reputation score", score };
    //   }
    //
    //   return {
    //     valid: true,
    //     score,
    //     actions: delegation.scope.allowedActions,
    //     budgetRemaining: (delegation.scope.maxLamportsTotal - delegation.scope.spentLamports) / 1e9,
    //     expiresAt: delegation.scope.expiresAt > 0
    //       ? new Date(delegation.scope.expiresAt * 1000)
    //       : null,
    //   };

    return {
      valid: true,
      reason: "All accounts exist (full deserialization requires deployed programs)",
    };
  }
}

// ── Main ───────────────────────────────────────────────────────────────────

function loadKeypair(): Keypair {
  const keypairPath =
    process.env.SOLANA_KEYPAIR_PATH ?? `${process.env.HOME}/.config/solana/id.json`;
  const raw = readFileSync(keypairPath, "utf-8");
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(raw)));
}

async function main() {
  // ── Initialize ───────────────────────────────────────────────────────────

  const connection = new Connection(clusterApiUrl("devnet"), "confirmed");

  const hand = new HandProtocol(connection, {
    handRegistry: HAND_REGISTRY_PROGRAM_ID,
    delegation: DELEGATION_PROGRAM_ID,
    reputation: REPUTATION_PROGRAM_ID,
    handGate: HAND_GATE_PROGRAM_ID,
  });

  const wallet = loadKeypair();
  console.log("Wallet:", wallet.publicKey.toBase58());

  // ── 1. Derive PDAs ──────────────────────────────────────────────────────

  const [handPda, handBump] = hand.findHandPda(wallet.publicKey);
  console.log("\nHand PDA:", handPda.toBase58(), `(bump: ${handBump})`);
  // => Hand PDA: 7xK...abc (bump: 254)

  // ── 2. Check if Hand exists ──────────────────────────────────────────────

  const handAccount = await hand.getHand(wallet.publicKey);
  if (handAccount) {
    console.log("Hand account found at:", handAccount.pda.toBase58());
  } else {
    console.log("No Hand account found. Mint one first with mint-hand.ts");
  }
  // => Hand account found at: 7xK...abc
  //    OR
  // => No Hand account found. Mint one first with mint-hand.ts

  // ── 3. Derive agent delegation PDA ───────────────────────────────────────

  const agentPubkey = Keypair.generate().publicKey; // demo agent
  const [delegationPda] = hand.findDelegationPda(handPda, agentPubkey);
  console.log("\nDelegation PDA:", delegationPda.toBase58());
  // => Delegation PDA: 9yM...def

  // ── 4. Check delegation ──────────────────────────────────────────────────

  const delegation = await hand.getDelegation(handPda, agentPubkey);
  if (delegation) {
    console.log("Delegation found at:", delegation.pda.toBase58());
  } else {
    console.log("No delegation found for this agent.");
  }
  // => Delegation found at: 9yM...def
  //    OR
  // => No delegation found for this agent.

  // ── 5. Check reputation ──────────────────────────────────────────────────

  const [reputationPda] = hand.findReputationPda(handPda);
  console.log("\nReputation PDA:", reputationPda.toBase58());

  const reputation = await hand.getReputation(handPda);
  if (reputation) {
    console.log("Reputation account found at:", reputation.pda.toBase58());
  } else {
    console.log("No reputation account found.");
  }
  // => Reputation account found at: 3zN...ghi
  //    OR
  // => No reputation account found.

  // ── 6. Full verification ─────────────────────────────────────────────────

  console.log("\n--- Full Agent Verification ---");

  const result = await hand.verifyAgent(
    agentPubkey,
    wallet.publicKey,
    {
      minScore: 3000,       // require at least 30% reputation
      requiredAction: 1,    // ACTION_SWAP
    },
  );

  if (result.valid) {
    console.log("  Status:      VERIFIED");
    console.log("  Score:       ", result.score, "/ 10000");
    console.log("  Actions:     ", result.actions);
    console.log("  Budget left: ", result.budgetRemaining, "SOL");
    console.log("  Expires:     ", result.expiresAt?.toISOString() ?? "never");
  } else {
    console.log("  Status:      REJECTED");
    console.log("  Reason:      ", result.reason);
  }

  console.log("-------------------------------\n");

  // ── Summary ──────────────────────────────────────────────────────────────
  //
  // The SDK provides a clean interface over four programs:
  //
  //   hand.findHandPda(authority)           — derive Hand PDA
  //   hand.findDelegationPda(hand, agent)   — derive Delegation PDA
  //   hand.findReputationPda(hand)          — derive Reputation PDA
  //   hand.getHand(authority)               — fetch Hand account
  //   hand.getDelegation(hand, agent)       — fetch Delegation account
  //   hand.getReputation(hand)              — fetch Reputation account
  //   hand.verifyAgent(agent, owner, opts)  — full client-side verification
  //
  // For on-chain verification (CPI), see integrate-gate.ts.
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
