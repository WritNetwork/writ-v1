use anchor_lang::prelude::*;
use anchor_lang::solana_program::sysvar;

use crate::constants::{AGE_BONUS_PER_DAY, MAX_AGE_BONUS, MAX_SCORE, PENALTY_PER_LOST_DISPUTE, REPUTATION_SEED};
use crate::error::ReputationError;
use crate::state::reputation::Reputation;
use crate::ScoreRecalculated;

#[derive(Accounts)]
pub struct RecalculateScore<'info> {
    /// Anyone can trigger a recalculation.
    pub caller: Signer<'info>,

    /// The reputation account to recalculate.
    #[account(
        mut,
        seeds = [REPUTATION_SEED, reputation.hand.as_ref()],
        bump = reputation.bump,
    )]
    pub reputation: Account<'info, Reputation>,

    /// CHECK: Clock sysvar.
    #[account(address = sysvar::clock::id())]
    pub clock: AccountInfo<'info>,
}

pub fn handler(ctx: Context<RecalculateScore>) -> Result<()> {
    let clock = Clock::from_account_info(&ctx.accounts.clock)
        .map_err(|_| ReputationError::ClockError)?;
    let now = clock.unix_timestamp;

    let reputation = &mut ctx.accounts.reputation;

    // Base score: success rate scaled to 10000
    let base: u32 = if reputation.total_actions > 0 {
        ((reputation.successful_actions as u128 * 10_000) / reputation.total_actions as u128) as u32
    } else {
        5000 // neutral start
    };

    // Penalty for lost disputes
    let penalty = (reputation.disputes_lost as u32)
        .saturating_mul(PENALTY_PER_LOST_DISPUTE);

    // Age bonus: days since creation * bonus per day, capped
    let seconds_alive = now.saturating_sub(reputation.created_at).max(0);
    let days = (seconds_alive / 86400) as u32;
    let age_bonus = core::cmp::min(
        days.saturating_mul(AGE_BONUS_PER_DAY),
        MAX_AGE_BONUS,
    );

    // Final score
    let score = base
        .saturating_sub(penalty)
        .saturating_add(age_bonus)
        .min(MAX_SCORE);

    reputation.score = score;
    reputation.last_updated = now;

    emit!(ScoreRecalculated {
        hand: reputation.hand,
        new_score: score,
    });

    Ok(())
}
