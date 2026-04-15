use anchor_lang::prelude::*;
use anchor_lang::solana_program::sysvar;

use writ_registry::state::hand::Hand;

use crate::constants::DELEGATION_SEED;
use crate::error::DelegationError;
use crate::state::delegation::Delegation;
use crate::DelegationRevoked;

#[derive(Accounts)]
pub struct RevokeDelegation<'info> {
    /// Hand owner — only they can revoke.
    #[account(mut)]
    pub hand_owner: Signer<'info>,

    /// The Hand identity.
    #[account(
        mut,
        constraint = hand.authority == hand_owner.key() @ DelegationError::UnauthorizedCaller,
    )]
    pub hand: Account<'info, Hand>,

    /// The delegation to revoke.
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

pub fn handler(ctx: Context<RevokeDelegation>) -> Result<()> {
    let clock = Clock::from_account_info(&ctx.accounts.clock)
        .map_err(|_| error!(DelegationError::WritNotVerified))?;

    let delegation = &mut ctx.accounts.delegation;
    delegation.active = false;

    // Decrement hand delegation count
    let hand = &mut ctx.accounts.hand;
    hand.delegations_count = hand.delegations_count.saturating_sub(1);

    emit!(DelegationRevoked {
        delegation: delegation.key(),
        revoked_at: clock.unix_timestamp,
    });

    Ok(())
}
