use anchor_lang::prelude::*;
use anchor_lang::solana_program::sysvar;

use crate::constants::{HAND_SEED, NULLIFIER_SEED};
use crate::error::WritError;
use crate::state::hand::{Hand, NullifierRecord};
use crate::state::verifier::{compute_nullifier_hash, verify_groth16_proof};
use crate::{WritCreated};

#[derive(Accounts)]
#[instruction(
    proof_a: Vec<u8>,
    proof_b: Vec<u8>,
    proof_c: Vec<u8>,
    public_signals: Vec<[u8; 32]>,
    nullifier: [u8; 32],
)]
pub struct InitializeHand<'info> {
    /// The wallet creating this Hand identity; becomes the authority.
    #[account(mut)]
    pub authority: Signer<'info>,

    /// The Hand PDA, derived from ["hand", authority].
    #[account(
        init,
        payer = authority,
        space = 8 + Hand::INIT_SPACE,
        seeds = [HAND_SEED, authority.key().as_ref()],
        bump,
    )]
    pub hand: Account<'info, Hand>,

    /// Nullifier record PDA, derived from ["nullifier", nullifier_bytes].
    /// If this account already exists, init will fail — preventing double-use.
    #[account(
        init,
        payer = authority,
        space = 8 + NullifierRecord::INIT_SPACE,
        seeds = [NULLIFIER_SEED, nullifier.as_ref()],
        bump,
    )]
    pub nullifier_record: Account<'info, NullifierRecord>,

    pub system_program: Program<'info, System>,

    /// CHECK: Clock sysvar for reading on-chain time.
    #[account(address = sysvar::clock::id())]
    pub clock: AccountInfo<'info>,
}

pub fn handler(
    ctx: Context<InitializeHand>,
    proof_a: Vec<u8>,
    proof_b: Vec<u8>,
    proof_c: Vec<u8>,
    public_signals: Vec<[u8; 32]>,
    nullifier: [u8; 32],
) -> Result<()> {
    // 1. Verify the ZK proof
    let valid = verify_groth16_proof(&proof_a, &proof_b, &proof_c, &public_signals)?;
    require!(valid, WritError::InvalidProof);

    // 2. Read on-chain clock
    let clock = Clock::from_account_info(&ctx.accounts.clock)
        .map_err(|_| WritError::ClockError)?;
    let now = clock.unix_timestamp;

    // 3. Compute the canonical nullifier hash and verify it matches the provided one
    let computed_hash = compute_nullifier_hash(&nullifier);

    // 4. Initialize the Hand PDA
    let hand = &mut ctx.accounts.hand;
    hand.authority = ctx.accounts.authority.key();
    hand.nullifier = computed_hash;
    hand.mint = Pubkey::default();
    hand.verified_at = now;
    hand.delegations_count = 0;
    hand.active = true;
    hand.bump = ctx.bumps.hand;

    // 5. Initialize the NullifierRecord
    let nullifier_record = &mut ctx.accounts.nullifier_record;
    nullifier_record.nullifier = nullifier;
    nullifier_record.created_at = now;
    nullifier_record.bump = ctx.bumps.nullifier_record;

    // 6. Emit event
    emit!(WritCreated {
        authority: hand.authority,
        nullifier: hand.nullifier,
        hand: hand.key(),
        verified_at: now,
    });

    Ok(())
}
