use anchor_lang::prelude::*;
use anchor_lang::solana_program::sysvar;

use hand_registry::constants::MAX_DELEGATIONS;
use hand_registry::state::hand::Hand;

use crate::constants::DELEGATION_SEED;
use crate::error::DelegationError;
use crate::state::delegation::{Delegation, DelegationScope};
use crate::DelegationCreated;

#[derive(Accounts)]
pub struct CreateDelegation<'info> {
    /// The Hand owner — must match hand.authority.
    #[account(mut)]
    pub hand_owner: Signer<'info>,

    /// The Hand identity this delegation comes from.
    #[account(
        mut,
        constraint = hand.authority == hand_owner.key() @ DelegationError::UnauthorizedCaller,
        constraint = hand.active @ DelegationError::HandNotActive,
        constraint = hand.delegations_count < MAX_DELEGATIONS @ DelegationError::TooManyDelegations,
    )]
    pub hand: Account<'info, Hand>,

    /// The agent wallet receiving the delegation (not a signer — the owner grants it).
    /// CHECK: This is just the pubkey of the agent, not validated further.
    pub agent: AccountInfo<'info>,

    /// The delegation PDA, seeded by [delegation, hand, agent].
    #[account(
        init,
        payer = hand_owner,
        space = 8 + Delegation::INIT_SPACE,
        seeds = [DELEGATION_SEED, hand.key().as_ref(), agent.key().as_ref()],
        bump,
    )]
    pub delegation: Account<'info, Delegation>,

    pub system_program: Program<'info, System>,

    /// CHECK: Clock sysvar.
    #[account(address = sysvar::clock::id())]
    pub clock: AccountInfo<'info>,
}

pub fn handler(ctx: Context<CreateDelegation>, scope: DelegationScope) -> Result<()> {
    // Validate scope
    require!(
        scope.allowed_programs.len() <= crate::constants::MAX_ALLOWED_PROGRAMS,
        DelegationError::MaxProgramsExceeded
    );
    require!(
        scope.max_lamports_total >= scope.max_lamports_per_tx,
        DelegationError::InvalidScope
    );

    let clock = Clock::from_account_info(&ctx.accounts.clock)
        .map_err(|_| error!(DelegationError::HandNotVerified))?;
    let now = clock.unix_timestamp;

    // Initialize delegation
    let delegation = &mut ctx.accounts.delegation;
    delegation.hand = ctx.accounts.hand.key();
    delegation.agent = ctx.accounts.agent.key();
    delegation.scope = DelegationScope {
        spent_lamports: 0,
        ..scope
    };
    delegation.delegated_at = now;
    delegation.last_consumed_at = 0;
    delegation.active = true;
    delegation.bump = ctx.bumps.delegation;

    // Increment delegation count on Hand
    let hand = &mut ctx.accounts.hand;
    hand.delegations_count = hand.delegations_count.checked_add(1)
        .ok_or(DelegationError::TooManyDelegations)?;

    emit!(DelegationCreated {
        hand: delegation.hand,
        agent: delegation.agent,
        delegation: delegation.key(),
        delegated_at: now,
        expires_at: delegation.scope.expires_at,
    });

    Ok(())
}
