use anchor_lang::prelude::*;
use anchor_lang::solana_program::sysvar;

use delegation::state::delegation::Delegation;
use writ_registry::state::hand::Hand;
use reputation::state::reputation::Reputation;

use crate::error::GateError;
use crate::verify::{check_delegation, check_hand, check_reputation};
use crate::AgentVerified;

#[derive(Accounts)]
pub struct VerifyAgentWithReputation<'info> {
    /// The agent being verified.
    pub agent: Signer<'info>,

    /// The Hand identity backing this agent.
    pub hand: Account<'info, Hand>,

    /// The delegation linking the Hand to this agent.
    #[account(
        constraint = delegation.hand == hand.key() @ GateError::DelegationWritMismatch,
        constraint = delegation.agent == agent.key() @ GateError::DelegationAgentMismatch,
    )]
    pub delegation: Account<'info, Delegation>,

    /// The reputation account for this Hand.
    #[account(
        constraint = reputation.hand == hand.key() @ GateError::DeserializationFailed,
    )]
    pub reputation: Account<'info, Reputation>,

    /// CHECK: Clock sysvar.
    #[account(address = sysvar::clock::id())]
    pub clock: AccountInfo<'info>,
}

pub fn handler(ctx: Context<VerifyAgentWithReputation>, min_score: u32) -> Result<()> {
    let clock = Clock::from_account_info(&ctx.accounts.clock)
        .map_err(|_| GateError::ClockError)?;
    let now = clock.unix_timestamp;

    // Validate hand
    let _hand_data = check_hand(&ctx.accounts.hand)?;

    // Validate delegation
    let _delegation_data = check_delegation(&ctx.accounts.delegation, now)?;

    // Validate reputation meets minimum
    let rep_data = check_reputation(&ctx.accounts.reputation, min_score)?;

    emit!(AgentVerified {
        agent: ctx.accounts.agent.key(),
        hand: ctx.accounts.hand.key(),
        delegation: ctx.accounts.delegation.key(),
        is_valid: true,
        reputation_score: rep_data.score,
        verified_at: now,
    });

    Ok(())
}
