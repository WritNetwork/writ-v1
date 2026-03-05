/**
 * integrate-gate.ts — Shows how another Solana program integrates the HAND gate.
 *
 * This file demonstrates the Cross-Program Invocation (CPI) pattern that any
 * Solana program can use to verify that an incoming agent wallet is backed by
 * a valid HAND identity with sufficient reputation.
 *
 * The flow:
 *   1. Your program receives a transaction from an agent
 *   2. Your instruction includes the agent's delegation, hand, and reputation accounts
 *   3. You CPI into the hand_gate program's verify_agent instruction
 *   4. If the CPI succeeds, the agent is verified; if it fails, the tx reverts
 *
 * This is NOT a standalone runnable script — it's a reference showing the Rust
 * program-side integration and the corresponding TypeScript client code.
 *
 * Usage:
 *   Read this file to understand the integration pattern.
 */

// ============================================================================
// PART 1: Rust Program Integration (what your Anchor program looks like)
// ============================================================================

/*
// -- Cargo.toml dependency --
//
// [dependencies]
// hand_gate = { path = "../hand-gate", features = ["cpi"] }
// # or from crates.io once published:
// # hand_gate = { version = "0.4", features = ["cpi"] }

// -- Your program's instruction handler --

use anchor_lang::prelude::*;
use hand_gate::cpi::accounts::VerifyAgent;
use hand_gate::program::HandGate;

/// Accounts struct for a gated instruction in YOUR program.
/// The agent calls your program, and your program CPIs into hand_gate
/// to verify the agent before executing the business logic.
#[derive(Accounts)]
pub struct GatedSwap<'info> {
    /// The agent wallet executing this swap.
    /// Must have a valid delegation from a HAND identity.
    #[account(mut)]
    pub agent: Signer<'info>,

    // -- HAND verification accounts (passed through to the gate CPI) --

    /// The delegation PDA linking this agent to a Hand.
    /// CHECK: Verified by the hand_gate program during CPI.
    pub delegation: AccountInfo<'info>,

    /// The Hand identity PDA.
    /// CHECK: Verified by the hand_gate program during CPI.
    pub hand: AccountInfo<'info>,

    /// The reputation account for this Hand.
    /// CHECK: Verified by the hand_gate program during CPI.
    pub reputation: AccountInfo<'info>,

    /// The hand_gate program — needed for CPI.
    pub hand_gate_program: Program<'info, HandGate>,

    /// Clock sysvar — needed by the gate to check delegation expiry.
    pub clock: AccountInfo<'info>,

    // -- Your program's own accounts --

    /// The token account to swap from
    #[account(mut)]
    pub source_token: AccountInfo<'info>,

    /// The token account to swap into
    #[account(mut)]
    pub destination_token: AccountInfo<'info>,

    // ... other accounts your swap needs
}

pub fn handler(ctx: Context<GatedSwap>, amount: u64) -> Result<()> {
    // Step 1: CPI into hand_gate to verify the agent
    let cpi_accounts = VerifyAgent {
        agent: ctx.accounts.agent.to_account_info(),
        delegation: ctx.accounts.delegation.to_account_info(),
        hand: ctx.accounts.hand.to_account_info(),
        reputation: ctx.accounts.reputation.to_account_info(),
        clock: ctx.accounts.clock.to_account_info(),
    };

    let cpi_program = ctx.accounts.hand_gate_program.to_account_info();
    let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);

    // Require swap permission (ACTION_SWAP = 1), minimum 50% reputation,
    // and verify the target program (your own program ID)
    hand_gate::cpi::verify_agent(
        cpi_ctx,
        5000,                    // min_reputation_score: 50%
        1,                       // required_action: ACTION_SWAP
        ctx.program_id.clone(),  // target_program: your program
    )?;

    // If we reach here, the agent is verified.
    // Step 2: Execute your swap logic
    msg!("Agent verified! Executing swap of {} lamports", amount);

    // ... your swap implementation ...

    Ok(())
}
*/

// ============================================================================
// PART 2: TypeScript Client (calling the gated instruction)
// ============================================================================

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

// Program IDs (replace with real deployed addresses)
const YOUR_PROGRAM_ID = new PublicKey("11111111111111111111111111111111");
const HAND_REGISTRY_PROGRAM_ID = new PublicKey("11111111111111111111111111111111");
const DELEGATION_PROGRAM_ID = new PublicKey("11111111111111111111111111111111");
const REPUTATION_PROGRAM_ID = new PublicKey("11111111111111111111111111111111");
const HAND_GATE_PROGRAM_ID = new PublicKey("11111111111111111111111111111111");

const HAND_SEED = Buffer.from("hand");
const DELEGATION_SEED = Buffer.from("delegation");
const REPUTATION_SEED = Buffer.from("reputation");

// ── Helpers ────────────────────────────────────────────────────────────────

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

function findReputationPda(hand: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [REPUTATION_SEED, hand.toBuffer()],
    REPUTATION_PROGRAM_ID,
  );
}

function loadKeypair(): Keypair {
  const keypairPath =
    process.env.SOLANA_KEYPAIR_PATH ?? `${process.env.HOME}/.config/solana/id.json`;
  const raw = readFileSync(keypairPath, "utf-8");
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(raw)));
}

// ── Example: Calling a HAND-gated instruction ──────────────────────────────

async function main() {
  const connection = new Connection(clusterApiUrl("devnet"), "confirmed");

  // The agent keypair — this is the bot's wallet
  const agentKeypair = loadKeypair();
  const wallet = new Wallet(agentKeypair);
  const provider = new AnchorProvider(connection, wallet, { commitment: "confirmed" });
  anchor.setProvider(provider);

  // The Hand owner who delegated to this agent.
  // In practice, the agent knows which Hand it's delegated from (stored in config).
  const handOwnerPubkey = new PublicKey(
    process.env.HAND_OWNER_PUBKEY ?? "11111111111111111111111111111111",
  );

  // Derive all the HAND-related PDAs
  const [handPda] = findHandPda(handOwnerPubkey);
  const [delegationPda] = findDelegationPda(handPda, agentKeypair.publicKey);
  const [reputationPda] = findReputationPda(handPda);

  console.log("Agent:          ", agentKeypair.publicKey.toBase58());
  console.log("Hand PDA:       ", handPda.toBase58());
  console.log("Delegation PDA: ", delegationPda.toBase58());
  console.log("Reputation PDA: ", reputationPda.toBase58());

  // Load your program (the one that has the gated instruction)
  const yourProgram = anchor.workspace.YourProgram as Program;

  // Build the transaction that calls your gated_swap instruction.
  // The HAND verification accounts are passed alongside your own accounts.
  // The hand_gate CPI happens inside your program — no separate tx needed.

  console.log("\nBuilding gated swap transaction...");

  const swapAmount = new anchor.BN(1 * anchor.web3.LAMPORTS_PER_SOL);

  // Mock token accounts for this example
  const sourceToken = Keypair.generate().publicKey;
  const destinationToken = Keypair.generate().publicKey;

  const txSig = await yourProgram.methods
    .gatedSwap(swapAmount)
    .accounts({
      // Agent is the signer
      agent: agentKeypair.publicKey,

      // HAND verification accounts — the gate CPI reads these
      delegation: delegationPda,
      hand: handPda,
      reputation: reputationPda,
      handGateProgram: HAND_GATE_PROGRAM_ID,
      clock: SYSVAR_CLOCK_PUBKEY,

      // Your program's own accounts
      sourceToken,
      destinationToken,
    })
    .rpc();

  console.log("Gated swap executed:", txSig);
  console.log(
    `Explorer: https://explorer.solana.com/tx/${txSig}?cluster=devnet`,
  );

  // The key insight: your program doesn't need to understand ZK proofs
  // or implement its own identity system. It just CPIs into hand_gate
  // and the verification happens transparently. If the agent isn't valid,
  // the CPI fails and the entire transaction reverts.
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
