use anchor_lang::prelude::*;
use anchor_lang::solana_program::sysvar;

use hand_registry::state::hand::Hand;

use crate::constants::{DELEGATION_SEED, MAX_ALLOWED_PROGRAMS};
use crate::error::DelegationError;
use crate::state::delegation::{Delegation, DelegationScope};
use crate::DelegationScopeUpdated;

#[derive(Accounts)]
pub struct UpdateScope<'info> {
    /// Hand owner — only they can update the scope.
    pub hand_owner: Signer<'info>,

    /// The Hand identity.
    #[account(
        constraint = hand.authority == hand_owner.key() @ DelegationError::UnauthorizedCaller,
    )]
    pub hand: Account<'info, Hand>,

    /// The delegation to update.
    #[account(
        mut,
        seeds = [DELEGATION_SEED, hand.key().as_ref(), delegation.agent.as_ref()],
        bump = delegation.bump,
        constraint = delegation.hand == hand.key() @ DelegationError::UnauthorizedCaller,
        constraint = delegation.active @ DelegationError::DelegationNotActive,
    )]
    pub delegation: Account<'info, Delegation>,

    /// CHECK: Clock sysvar.
    #[account(address = sysvar::clock::id())]
    pub clock: AccountInfo<'info>,
}

pub fn handler(ctx: Context<UpdateScope>, new_scope: DelegationScope) -> Result<()> {
    require!(
        new_scope.allowed_programs.len() <= MAX_ALLOWED_PROGRAMS,
        DelegationError::MaxProgramsExceeded
    );
    require!(
        new_scope.max_lamports_total >= new_scope.max_lamports_per_tx,
        DelegationError::InvalidScope
    );

    let clock = Clock::from_account_info(&ctx.accounts.clock)
        .map_err(|_| error!(DelegationError::HandNotVerified))?;

    let delegation = &mut ctx.accounts.delegation;

    // Preserve the spent_lamports counter — don't let the owner reset it
    let spent = delegation.scope.spent_lamports;
    delegation.scope = DelegationScope {
        spent_lamports: spent,
        ..new_scope
    };

    emit!(DelegationScopeUpdated {
        delegation: delegation.key(),
        updated_at: clock.unix_timestamp,
    });

    Ok(())
}
