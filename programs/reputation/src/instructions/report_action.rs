use anchor_lang::prelude::*;
use anchor_lang::solana_program::sysvar;

use hand_registry::state::hand::Hand;

use crate::constants::{REPORTER_SEED, REPUTATION_SEED};
use crate::error::ReputationError;
use crate::state::reporter::Reporter;
use crate::state::reputation::Reputation;
use crate::ActionReported;

#[derive(Accounts)]
pub struct ReportAction<'info> {
    /// The caller submitting the report (must be the registered reporter authority).
    pub caller: Signer<'info>,

    /// The Hand whose reputation is being updated.
    #[account(
        constraint = hand.active @ ReputationError::HandNotActive,
    )]
    pub hand: Account<'info, Hand>,

    /// The reporter PDA — must be active.
    #[account(
        mut,
        seeds = [REPORTER_SEED, reporter.program_id.as_ref()],
        bump = reporter.bump,
        constraint = reporter.active @ ReputationError::UnauthorizedReporter,
    )]
    pub reporter: Account<'info, Reporter>,

    /// The reputation PDA for this Hand.
    #[account(
        mut,
        seeds = [REPUTATION_SEED, hand.key().as_ref()],
        bump = reputation.bump,
        constraint = reputation.hand == hand.key() @ ReputationError::ReputationNotFound,
    )]
    pub reputation: Account<'info, Reputation>,

    /// CHECK: Clock sysvar.
    #[account(address = sysvar::clock::id())]
    pub clock: AccountInfo<'info>,
}

pub fn handler(
    ctx: Context<ReportAction>,
    success: bool,
    volume_lamports: u64,
) -> Result<()> {
    let clock = Clock::from_account_info(&ctx.accounts.clock)
        .map_err(|_| ReputationError::ClockError)?;

    let reputation = &mut ctx.accounts.reputation;
    reputation.total_actions = reputation.total_actions
        .checked_add(1)
        .ok_or(ReputationError::ArithmeticOverflow)?;

    if success {
        reputation.successful_actions = reputation.successful_actions
            .checked_add(1)
            .ok_or(ReputationError::ArithmeticOverflow)?;
    }

    reputation.total_volume_lamports = reputation.total_volume_lamports
        .checked_add(volume_lamports as u128)
        .ok_or(ReputationError::ArithmeticOverflow)?;

    reputation.last_updated = clock.unix_timestamp;

    // Increment reporter counter
    let reporter = &mut ctx.accounts.reporter;
    reporter.reports_submitted = reporter.reports_submitted
        .checked_add(1)
        .ok_or(ReputationError::ArithmeticOverflow)?;

    emit!(ActionReported {
        hand: reputation.hand,
        reporter: reporter.key(),
        success,
        volume_lamports,
    });

    Ok(())
}
