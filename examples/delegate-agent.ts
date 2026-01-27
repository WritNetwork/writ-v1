/**
 * delegate-agent.ts — Shows how to delegate a HAND identity to a trading bot.
 *
 * Scenario: You have a verified Hand and want to authorize an AI trading agent
 * to execute swaps on Jupiter, with a budget of 2 SOL per transaction and
 * 50 SOL total, expiring in 72 hours.
 *
 * Usage:
 *   npx ts-node examples/delegate-agent.ts
 */

import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  SYSVAR_CLOCK_PUBKEY,
  clusterApiUrl,
} from "@solana/web3.js";
import * as anchor from "@coral-xyz/anchor";
import { Program, AnchorProvider, Wallet } from "@coral-xyz/anchor";
import { readFileSync } from "fs";

// ── Configuration ──────────────────────────────────────────────────────────

const HAND_REGISTRY_PROGRAM_ID = new PublicKey("11111111111111111111111111111111");
const DELEGATION_PROGRAM_ID = new PublicKey("11111111111111111111111111111111");

const HAND_SEED = Buffer.from("hand");
const DELEGATION_SEED = Buffer.from("delegation");

// Jupiter v6 program on mainnet — the only program this delegation will allow
const JUPITER_PROGRAM_ID = new PublicKey(
  "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4",
);

// Action bitmask flags
const ACTION_SWAP = 1;

// ── Helpers ────────────────────────────────────────────────────────────────

function loadKeypair(): Keypair {
  const keypairPath =
    process.env.SOLANA_KEYPAIR_PATH ?? `${process.env.HOME}/.config/solana/id.json`;
  const raw = readFileSync(keypairPath, "utf-8");
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(raw)));
}

function findHandPda(authority: PublicKey): [PublicKey, number] {
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

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const connection = new Connection(clusterApiUrl("devnet"), "confirmed");
  const payer = loadKeypair();
  const wallet = new Wallet(payer);
  const provider = new AnchorProvider(connection, wallet, { commitment: "confirmed" });
  anchor.setProvider(provider);

  // The agent wallet — in production this would be the trading bot's pubkey.
  // Here we generate one for demonstration; in practice you'd load the bot's
  // known public key from config.
  const agentKeypair = Keypair.generate();
  const agentPubkey = agentKeypair.publicKey;

  console.log("Hand owner:", payer.publicKey.toBase58());
  console.log("Agent:     ", agentPubkey.toBase58());

  // 1. Find the Hand PDA — must already exist (minted via mint-hand.ts)
  const [handPda] = findHandPda(payer.publicKey);
  console.log("Hand PDA:  ", handPda.toBase58());

  // Verify the Hand exists and is active
  const registryProgram = anchor.workspace.HandRegistry as Program;
  const handAccount = await registryProgram.account.hand.fetch(handPda);

  if (!handAccount.active) {
    console.error("Hand is not active. Cannot delegate.");
    process.exit(1);
  }

  console.log("Hand is active. Current delegations:", handAccount.delegationsCount);

  // 2. Define the delegation scope
  //    - Jupiter only: the agent can only call Jupiter's swap program
  //    - 2 SOL per transaction: limits damage from a single bad trade
  //    - 50 SOL total: lifetime budget for this delegation
  //    - 72 hour expiry: delegation auto-invalidates after 3 days
  //    - Swap only: agent cannot stake, transfer, vote, or mint
  const nowSeconds = Math.floor(Date.now() / 1000);
  const seventyTwoHours = 72 * 60 * 60;

  const scope = {
    allowedPrograms: [JUPITER_PROGRAM_ID],
    maxLamportsPerTx: new anchor.BN(2 * anchor.web3.LAMPORTS_PER_SOL),
    maxLamportsTotal: new anchor.BN(50 * anchor.web3.LAMPORTS_PER_SOL),
    spentLamports: new anchor.BN(0),
    expiresAt: new anchor.BN(nowSeconds + seventyTwoHours),
    allowedActions: ACTION_SWAP,
  };

  // 3. Derive the delegation PDA
  const [delegationPda] = findDelegationPda(handPda, agentPubkey);
  console.log("Delegation PDA:", delegationPda.toBase58());

  // 4. Build and send the delegate transaction
  const delegationProgram = anchor.workspace.Delegation as Program;

  console.log("\nSending delegate transaction...");

  const txSig = await delegationProgram.methods
    .delegate(scope)
    .accounts({
      handOwner: payer.publicKey,
      hand: handPda,
      agent: agentPubkey,
      delegation: delegationPda,
      systemProgram: SystemProgram.programId,
      clock: SYSVAR_CLOCK_PUBKEY,
    })
    .rpc();

  console.log("Transaction confirmed:", txSig);
  console.log(
    `Explorer: https://explorer.solana.com/tx/${txSig}?cluster=devnet`,
  );

  // 5. Read back and display the delegation details
  const delegationAccount = await delegationProgram.account.delegation.fetch(
    delegationPda,
  );

  const expiresDate = new Date(
    delegationAccount.scope.expiresAt.toNumber() * 1000,
  );

  console.log("\n--- Delegation Details ---");
  console.log("  Hand:              ", delegationAccount.hand.toBase58());
  console.log("  Agent:             ", delegationAccount.agent.toBase58());
  console.log("  Active:            ", delegationAccount.active);
  console.log("  Delegated at:      ", new Date(delegationAccount.delegatedAt.toNumber() * 1000).toISOString());
  console.log("  Expires at:        ", expiresDate.toISOString());
  console.log("  Allowed programs:  ", delegationAccount.scope.allowedPrograms.map((p: PublicKey) => p.toBase58()));
  console.log("  Allowed actions:   ", delegationAccount.scope.allowedActions, "(1 = SWAP only)");
  console.log("  Max per tx:        ", delegationAccount.scope.maxLamportsPerTx.toNumber() / 1e9, "SOL");
  console.log("  Max total:         ", delegationAccount.scope.maxLamportsTotal.toNumber() / 1e9, "SOL");
  console.log("  Spent so far:      ", delegationAccount.scope.spentLamports.toNumber() / 1e9, "SOL");
  console.log("--------------------------\n");

  // Save the agent keypair so the bot can use it
  console.log("Agent secret key (base58) — share securely with the bot:");
  console.log("  ", Buffer.from(agentKeypair.secretKey).toString("base64"));
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
