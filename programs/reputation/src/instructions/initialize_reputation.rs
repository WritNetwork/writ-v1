use anchor_lang::prelude::*;
use anchor_lang::solana_program::sysvar;

use hand_registry::state::hand::Hand;

use crate::constants::{MAX_SCORE, REPUTATION_SEED};
use crate::error::ReputationError;
use crate::state::reputation::Reputation;
use crate::ReputationInitialized;

#[derive(Accounts)]
pub struct InitializeReputation<'info> {
    /// The Hand owner paying for the account.
    #[account(mut)]
    pub payer: Signer<'info>,

    /// The Hand this reputation is for.
    #[account(
        constraint = hand.active @ ReputationError::HandNotActive,
    )]
    pub hand: Account<'info, Hand>,

    /// Reputation PDA, seeded by ["reputation", hand].
    #[account(
        init,
        payer = payer,
        space = 8 + Reputation::INIT_SPACE,
        seeds = [REPUTATION_SEED, hand.key().as_ref()],
        bump,
    )]
    pub reputation: Account<'info, Reputation>,

    pub system_program: Program<'info, System>,

    /// CHECK: Clock sysvar.
    #[account(address = sysvar::clock::id())]
    pub clock: AccountInfo<'info>,
}

pub fn handler(ctx: Context<InitializeReputation>) -> Result<()> {
    let clock = Clock::from_account_info(&ctx.accounts.clock)
        .map_err(|_| ReputationError::ClockError)?;
    let now = clock.unix_timestamp;

    let initial_score: u32 = 5000; // neutral start

    let reputation = &mut ctx.accounts.reputation;
    reputation.hand = ctx.accounts.hand.key();
    reputation.total_actions = 0;
    reputation.successful_actions = 0;
    reputation.total_volume_lamports = 0;
    reputation.disputes_received = 0;
    reputation.disputes_lost = 0;
    reputation.score = initial_score;
    reputation.last_updated = now;
    reputation.created_at = now;
    reputation.bump = ctx.bumps.reputation;

    emit!(ReputationInitialized {
        hand: reputation.hand,
        reputation: reputation.key(),
        initial_score,
    });

    Ok(())
}
