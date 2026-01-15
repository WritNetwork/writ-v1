use anchor_lang::prelude::*;
use anchor_lang::solana_program::sysvar;

use delegation::state::delegation::Delegation;
use hand_registry::state::hand::Hand;

use crate::error::GateError;
use crate::verify::{check_delegation, check_hand};
use crate::AgentVerified;

#[derive(Accounts)]
pub struct VerifyAgent<'info> {
    /// The agent being verified.
    pub agent: Signer<'info>,

    /// The Hand identity backing this agent.
    pub hand: Account<'info, Hand>,

    /// The delegation linking the Hand to this agent.
    #[account(
        constraint = delegation.hand == hand.key() @ GateError::DelegationHandMismatch,
        constraint = delegation.agent == agent.key() @ GateError::DelegationAgentMismatch,
    )]
    pub delegation: Account<'info, Delegation>,

    /// CHECK: Clock sysvar.
    #[account(address = sysvar::clock::id())]
    pub clock: AccountInfo<'info>,
}

pub fn handler(ctx: Context<VerifyAgent>) -> Result<()> {
    let clock = Clock::from_account_info(&ctx.accounts.clock)
        .map_err(|_| GateError::ClockError)?;
    let now = clock.unix_timestamp;

    // Validate hand
    let _hand_data = check_hand(&ctx.accounts.hand)?;

    // Validate delegation
    let _delegation_data = check_delegation(&ctx.accounts.delegation, now)?;

    emit!(AgentVerified {
        agent: ctx.accounts.agent.key(),
        hand: ctx.accounts.hand.key(),
        delegation: ctx.accounts.delegation.key(),
        is_valid: true,
        reputation_score: 0, // not checked in this variant
        verified_at: now,
    });

    Ok(())
}
