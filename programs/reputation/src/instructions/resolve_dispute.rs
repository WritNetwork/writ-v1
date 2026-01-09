use anchor_lang::prelude::*;
use anchor_lang::solana_program::sysvar;

use crate::constants::{DISPUTE_SEED, REPUTATION_SEED};
use crate::error::ReputationError;
use crate::state::dispute::{Dispute, DisputeStatus};
use crate::state::reputation::Reputation;
use crate::DisputeResolved;

#[derive(Accounts)]
pub struct ResolveDispute<'info> {
    /// Protocol authority resolving the dispute.
    #[account(mut)]
    pub authority: Signer<'info>,

    /// The reputation for the disputed Hand.
    #[account(
        mut,
        seeds = [REPUTATION_SEED, reputation.hand.as_ref()],
        bump = reputation.bump,
    )]
    pub reputation: Account<'info, Reputation>,

    /// The dispute to resolve.
    #[account(
        mut,
        seeds = [DISPUTE_SEED, dispute.hand.as_ref(), dispute.challenger.as_ref()],
        bump = dispute.bump,
        constraint = dispute.status == DisputeStatus::Pending @ ReputationError::DisputeNotPending,
    )]
    pub dispute: Account<'info, Dispute>,

    /// The challenger who filed the dispute — receives stake back if upheld.
    /// CHECK: Only used as lamport destination.
    #[account(mut)]
    pub challenger: AccountInfo<'info>,

    /// CHECK: Clock sysvar.
    #[account(address = sysvar::clock::id())]
    pub clock: AccountInfo<'info>,
}

pub fn handler(ctx: Context<ResolveDispute>, upheld: bool) -> Result<()> {
    let clock = Clock::from_account_info(&ctx.accounts.clock)
        .map_err(|_| ReputationError::ClockError)?;
    let now = clock.unix_timestamp;

    let dispute = &mut ctx.accounts.dispute;
    let reputation = &mut ctx.accounts.reputation;

    if upheld {
        // Dispute upheld: penalize reputation, return stake to challenger
        dispute.status = DisputeStatus::Upheld;

        reputation.disputes_lost = reputation.disputes_lost
            .checked_add(1)
            .ok_or(ReputationError::ArithmeticOverflow)?;

        // Transfer stake back to challenger from dispute account
        let stake = dispute.stake_lamports;
        **dispute.to_account_info().try_borrow_mut_lamports()? -= stake;
        **ctx.accounts.challenger.try_borrow_mut_lamports()? += stake;
    } else {
        // Dispute rejected: challenger loses stake, goes to authority (treasury)
        dispute.status = DisputeStatus::Rejected;

        let stake = dispute.stake_lamports;
        **dispute.to_account_info().try_borrow_mut_lamports()? -= stake;
        **ctx.accounts.authority.try_borrow_mut_lamports()? += stake;
    }

    dispute.resolved_at = now;
    reputation.last_updated = now;

    emit!(DisputeResolved {
        dispute: dispute.key(),
        upheld,
        resolved_at: now,
    });

    Ok(())
}
