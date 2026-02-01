use anchor_lang::prelude::*;
use anchor_lang::solana_program::sysvar;

use hand_registry::state::hand::Hand;

use crate::constants::DELEGATION_SEED;
use crate::error::DelegationError;
use crate::state::delegation::Delegation;
use crate::DelegationConsumed;

#[derive(Accounts)]
pub struct Consume<'info> {
    /// The agent performing the action — must match delegation.agent.
    pub agent: Signer<'info>,

    /// The Hand identity backing this delegation (read-only validation).
    #[account(
        constraint = hand.active @ DelegationError::HandNotActive,
    )]
    pub hand: Account<'info, Hand>,

    /// The delegation being consumed.
    #[account(
        mut,
        seeds = [DELEGATION_SEED, hand.key().as_ref(), agent.key().as_ref()],
        bump = delegation.bump,
        constraint = delegation.hand == hand.key() @ DelegationError::UnauthorizedCaller,
        constraint = delegation.agent == agent.key() @ DelegationError::UnauthorizedCaller,
        constraint = delegation.active @ DelegationError::DelegationNotActive,
    )]
    pub delegation: Account<'info, Delegation>,

    /// CHECK: Clock sysvar.
    #[account(address = sysvar::clock::id())]
    pub clock: AccountInfo<'info>,
}

pub fn handler(
    ctx: Context<Consume>,
    lamports: u64,
    action: u16,
    program_id: Pubkey,
) -> Result<()> {
    let clock = Clock::from_account_info(&ctx.accounts.clock)
        .map_err(|_| error!(DelegationError::HandNotActive))?;
    let now = clock.unix_timestamp;

    let delegation = &mut ctx.accounts.delegation;

    // Check expiry
    if delegation.scope.expires_at > 0 {
        require!(now < delegation.scope.expires_at, DelegationError::DelegationExpired);
    }

    // Check action is allowed
    require!(
        delegation.scope.allowed_actions & action == action,
        DelegationError::ActionNotAllowed
    );

    // Check program is in allowed list (empty = all allowed)
    if !delegation.scope.allowed_programs.is_empty() {
        let allowed = delegation.scope.allowed_programs.iter().any(|p| *p == program_id);
        require!(allowed, DelegationError::ProgramNotAllowed);
    }

    // Check per-tx budget
    require!(
        lamports <= delegation.scope.max_lamports_per_tx,
        DelegationError::InsufficientBudget
    );

    // Check total budget
    let new_spent = delegation.scope.spent_lamports
        .checked_add(lamports)
        .ok_or(DelegationError::InsufficientBudget)?;
    require!(
        new_spent <= delegation.scope.max_lamports_total,
        DelegationError::InsufficientBudget
    );

    // Update counters
    delegation.scope.spent_lamports = new_spent;
    delegation.last_consumed_at = now;

    emit!(DelegationConsumed {
        delegation: delegation.key(),
        lamports,
        action,
        consumed_at: now,
    });

    Ok(())
}
