/// Hand Gate - CPI verification interface for external programs
use anchor_lang::prelude::*;

pub mod error;
pub mod instructions;
pub mod macros;
pub mod state;
pub mod verify;

use instructions::*;

declare_id!("11111111111111111111111111111111");

#[program]
pub mod hand_gate {
    use super::*;

    /// Verify that an agent has a valid, active delegation backed by a verified Hand.
    /// Emits an AgentVerified event with the full verification result.
    pub fn verify_agent(ctx: Context<VerifyAgent>) -> Result<()> {
        instructions::verify_agent::handler(ctx)
    }

    /// Verify an agent and additionally check that their Hand's reputation score
    /// meets a minimum threshold.
    pub fn verify_agent_with_reputation(
        ctx: Context<VerifyAgentWithReputation>,
        min_score: u32,
    ) -> Result<()> {
        instructions::verify_with_reputation::handler(ctx, min_score)
    }

    /// Verify an agent's delegation scope matches a specific required action,
    /// program, and budget.
    pub fn verify_agent_with_scope(
        ctx: Context<VerifyAgentWithScope>,
        required_action: u16,
        required_program: Pubkey,
        required_lamports: u64,
    ) -> Result<()> {
        instructions::verify_with_scope::handler(
            ctx,
            required_action,
            required_program,
            required_lamports,
        )
    }
}

// ── Events ──────────────────────────────────────────────────────────────────

#[event]
pub struct AgentVerified {
    pub agent: Pubkey,
    pub hand: Pubkey,
    pub delegation: Pubkey,
    pub is_valid: bool,
    pub reputation_score: u32,
    pub verified_at: i64,
}

#[event]
pub struct AgentVerifiedWithScope {
    pub agent: Pubkey,
    pub hand: Pubkey,
    pub delegation: Pubkey,
    pub action: u16,
    pub program_id: Pubkey,
    pub verified_at: i64,
}
