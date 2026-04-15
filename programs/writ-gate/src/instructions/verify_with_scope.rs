use anchor_lang::prelude::*;
use anchor_lang::solana_program::sysvar;

use delegation::state::delegation::Delegation;
use writ_registry::state::hand::Hand;

use crate::error::GateError;
use crate::verify::{check_delegation, check_hand};
use crate::AgentVerifiedWithScope;

#[derive(Accounts)]
pub struct VerifyAgentWithScope<'info> {
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

    /// CHECK: Clock sysvar.
    #[account(address = sysvar::clock::id())]
    pub clock: AccountInfo<'info>,
}

pub fn handler(
    ctx: Context<VerifyAgentWithScope>,
    required_action: u16,
    required_program: Pubkey,
    required_lamports: u64,
) -> Result<()> {
    let clock = Clock::from_account_info(&ctx.accounts.clock)
        .map_err(|_| GateError::ClockError)?;
    let now = clock.unix_timestamp;

    // Validate hand
    let _hand_data = check_hand(&ctx.accounts.hand)?;

    // Validate delegation is active and not expired
    let delegation_data = check_delegation(&ctx.accounts.delegation, now)?;

    // Check required action is in the allowed_actions bitmask
    require!(
        delegation_data.allowed_actions & required_action == required_action,
        GateError::ActionNotAllowed
    );

    // Check required program is in the allowed list (empty = all allowed)
    if !delegation_data.allowed_programs.is_empty() {
        let allowed = delegation_data
            .allowed_programs
            .iter()
            .any(|p| *p == required_program);
        require!(allowed, GateError::ProgramNotAllowed);
    }

    // Check per-tx budget
    require!(
        required_lamports <= delegation_data.max_lamports_per_tx,
        GateError::InsufficientBudget
    );

    // Check remaining total budget
    let remaining = delegation_data
        .max_lamports_total
        .saturating_sub(delegation_data.spent_lamports);
    require!(
        required_lamports <= remaining,
        GateError::InsufficientBudget
    );

    emit!(AgentVerifiedWithScope {
        agent: ctx.accounts.agent.key(),
        hand: ctx.accounts.hand.key(),
        delegation: ctx.accounts.delegation.key(),
        action: required_action,
        program_id: required_program,
        verified_at: now,
    });

    Ok(())
}
