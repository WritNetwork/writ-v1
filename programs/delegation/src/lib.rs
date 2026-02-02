use anchor_lang::prelude::*;

pub mod constants;
pub mod error;
pub mod instructions;
pub mod state;

use instructions::*;

declare_id!("11111111111111111111111111111111");

#[program]
pub mod delegation {
    use super::*;

    /// Create a new scoped delegation from a Hand owner to an agent wallet.
    /// The delegation defines what the agent is allowed to do on behalf of
    /// the human, including allowed programs, budget, and action types.
    pub fn delegate(
        ctx: Context<CreateDelegation>,
        scope: state::DelegationScope,
    ) -> Result<()> {
        instructions::delegate::handler(ctx, scope)
    }

    /// Update the scope of an existing active delegation.
    /// Only the Hand owner can modify the scope.
    pub fn update_scope(
        ctx: Context<UpdateScope>,
        new_scope: state::DelegationScope,
    ) -> Result<()> {
        instructions::update_scope::handler(ctx, new_scope)
    }

    /// Revoke an active delegation, removing the agent's permissions.
    pub fn revoke_delegation(ctx: Context<RevokeDelegation>) -> Result<()> {
        instructions::revoke_delegation::handler(ctx)
    }

    /// Consume a delegation by recording an agent action against the budget.
    /// Called by relay / gateway programs when the agent executes a transaction.
    pub fn consume(
        ctx: Context<Consume>,
        lamports: u64,
        action: u16,
        program_id: Pubkey,
    ) -> Result<()> {
        instructions::consume::handler(ctx, lamports, action, program_id)
    }
}

// ── Events ──────────────────────────────────────────────────────────────────

#[event]
pub struct DelegationCreated {
    pub hand: Pubkey,
    pub agent: Pubkey,
    pub delegation: Pubkey,
    pub delegated_at: i64,
    pub expires_at: i64,
}

#[event]
pub struct DelegationRevoked {
    pub delegation: Pubkey,
    pub revoked_at: i64,
}

#[event]
pub struct DelegationConsumed {
    pub delegation: Pubkey,
    pub lamports: u64,
    pub action: u16,
    pub consumed_at: i64,
}

#[event]
pub struct DelegationScopeUpdated {
    pub delegation: Pubkey,
    pub updated_at: i64,
}
