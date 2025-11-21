use anchor_lang::prelude::*;

pub mod constants;
pub mod error;
pub mod instructions;
pub mod state;

use instructions::*;

declare_id!("11111111111111111111111111111111");

#[program]
pub mod hand_registry {
    use super::*;

    /// Initialize a new HAND identity by submitting a ZK proof of humanity.
    /// The proof is verified on-chain via Groth16 pairing check, and a unique
    /// nullifier prevents the same human from registering twice.
    pub fn initialize_hand(
        ctx: Context<InitializeHand>,
        proof_a: Vec<u8>,
        proof_b: Vec<u8>,
        proof_c: Vec<u8>,
        public_signals: Vec<[u8; 32]>,
        nullifier: [u8; 32],
    ) -> Result<()> {
        instructions::initialize_hand::handler(
            ctx,
            proof_a,
            proof_b,
            proof_c,
            public_signals,
            nullifier,
        )
    }

    /// Revoke an existing HAND identity. Only the protocol authority can call
    /// this instruction, which deactivates the Hand PDA permanently.
    pub fn revoke_hand(ctx: Context<RevokeHand>) -> Result<()> {
        instructions::revoke_hand::handler(ctx)
    }
}

// ── Events ──────────────────────────────────────────────────────────────────

#[event]
pub struct HandCreated {
    pub authority: Pubkey,
    pub nullifier: [u8; 32],
    pub hand: Pubkey,
    pub verified_at: i64,
}

#[event]
pub struct HandRevoked {
    pub hand: Pubkey,
    pub revoked_at: i64,
}
