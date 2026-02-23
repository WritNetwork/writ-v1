use anchor_lang::prelude::*;
use anchor_lang::solana_program::sysvar;

use hand_registry::state::hand::Hand;

use crate::constants::{DISPUTE_SEED, DISPUTE_STAKE_LAMPORTS, MAX_EVIDENCE_URI_LEN, REPUTATION_SEED};
use crate::error::ReputationError;
use crate::state::dispute::{Dispute, DisputeStatus};
use crate::state::reputation::Reputation;
use crate::DisputeOpened;

#[derive(Accounts)]
#[instruction(evidence_uri: String)]
pub struct OpenDispute<'info> {
    /// The challenger filing the dispute. Must pay stake + rent.
    #[account(mut)]
    pub challenger: Signer<'info>,

    /// The Hand being disputed.
    pub hand: Account<'info, Hand>,

    /// The agent being disputed.
    /// CHECK: Just a pubkey reference.
    pub agent: AccountInfo<'info>,

    /// The reputation account (used to increment dispute counter).
    #[account(
        mut,
        seeds = [REPUTATION_SEED, hand.key().as_ref()],
        bump = reputation.bump,
        constraint = reputation.hand == hand.key() @ ReputationError::ReputationNotFound,
    )]
    pub reputation: Account<'info, Reputation>,

    /// The dispute PDA, seeded by ["dispute", hand, challenger].
    #[account(
        init,
        payer = challenger,
        space = 8 + Dispute::INIT_SPACE,
        seeds = [DISPUTE_SEED, hand.key().as_ref(), challenger.key().as_ref()],
        bump,
    )]
    pub dispute: Account<'info, Dispute>,

    pub system_program: Program<'info, System>,

    /// CHECK: Clock sysvar.
    #[account(address = sysvar::clock::id())]
    pub clock: AccountInfo<'info>,
}

pub fn handler(ctx: Context<OpenDispute>, evidence_uri: String) -> Result<()> {
    require!(
        evidence_uri.len() <= MAX_EVIDENCE_URI_LEN,
        ReputationError::EvidenceUriTooLong
    );

    let clock = Clock::from_account_info(&ctx.accounts.clock)
        .map_err(|_| ReputationError::ClockError)?;
    let now = clock.unix_timestamp;

    // Transfer stake from challenger to dispute PDA (held in the account lamports)
    let stake_transfer = anchor_lang::system_program::Transfer {
        from: ctx.accounts.challenger.to_account_info(),
        to: ctx.accounts.dispute.to_account_info(),
    };
    anchor_lang::system_program::transfer(
        CpiContext::new(ctx.accounts.system_program.to_account_info(), stake_transfer),
        DISPUTE_STAKE_LAMPORTS,
    )?;

    // Initialize dispute
    let dispute = &mut ctx.accounts.dispute;
    dispute.agent = ctx.accounts.agent.key();
    dispute.challenger = ctx.accounts.challenger.key();
    dispute.hand = ctx.accounts.hand.key();
    dispute.evidence_uri = evidence_uri;
    dispute.stake_lamports = DISPUTE_STAKE_LAMPORTS;
    dispute.status = DisputeStatus::Pending;
    dispute.created_at = now;
    dispute.resolved_at = 0;
    dispute.bump = ctx.bumps.dispute;

    // Increment disputes_received counter
    let reputation = &mut ctx.accounts.reputation;
    reputation.disputes_received = reputation.disputes_received
        .checked_add(1)
        .ok_or(ReputationError::ArithmeticOverflow)?;

    emit!(DisputeOpened {
        dispute: dispute.key(),
        hand: dispute.hand,
        challenger: dispute.challenger,
        stake_lamports: DISPUTE_STAKE_LAMPORTS,
    });

    Ok(())
}
