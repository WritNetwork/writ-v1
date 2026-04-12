/// Reputation - On-chain behavior tracking with dispute system
use anchor_lang::prelude::*;

pub mod constants;
pub mod error;
pub mod instructions;
pub mod state;

use instructions::*;

declare_id!("11111111111111111111111111111111");

#[program]
pub mod reputation {
    use super::*;

    /// Create a reputation account for a verified Hand identity.
    /// Starts with a neutral score of 5000 / 10000.
    pub fn initialize_reputation(ctx: Context<InitializeReputation>) -> Result<()> {
        instructions::initialize_reputation::handler(ctx)
    }

    /// Register a reporter program that is authorized to submit action reports.
    /// Only the protocol authority can call this.
    pub fn register_reporter(ctx: Context<RegisterReporter>) -> Result<()> {
        instructions::register_reporter::handler(ctx)
    }

    /// Report the outcome of an agent action (success/fail, volume).
    /// Only registered reporters can submit reports.
    pub fn report_action(
        ctx: Context<ReportAction>,
        success: bool,
        volume_lamports: u64,
    ) -> Result<()> {
        instructions::report_action::handler(ctx, success, volume_lamports)
    }

    /// Open a dispute against an agent's reputation. Requires staking lamports.
    pub fn open_dispute(
        ctx: Context<OpenDispute>,
        evidence_uri: String,
    ) -> Result<()> {
        instructions::open_dispute::handler(ctx, evidence_uri)
    }

    /// Resolve a pending dispute. Only the protocol authority can resolve.
    /// Upheld = penalty applied, stake returned. Rejected = challenger loses stake.
    pub fn resolve_dispute(
        ctx: Context<ResolveDispute>,
        upheld: bool,
    ) -> Result<()> {
        instructions::resolve_dispute::handler(ctx, upheld)
    }

    /// Recalculate the reputation score based on current counters.
    /// Anyone can call this permissionlessly.
    pub fn recalculate_score(ctx: Context<RecalculateScore>) -> Result<()> {
        instructions::recalculate_score::handler(ctx)
    }
}

// ── Events ──────────────────────────────────────────────────────────────────

#[event]
pub struct ReputationInitialized {
    pub hand: Pubkey,
    pub reputation: Pubkey,
    pub initial_score: u32,
}

#[event]
pub struct ActionReported {
    pub hand: Pubkey,
    pub reporter: Pubkey,
    pub success: bool,
    pub volume_lamports: u64,
}

#[event]
pub struct DisputeOpened {
    pub dispute: Pubkey,
    pub hand: Pubkey,
    pub challenger: Pubkey,
    pub stake_lamports: u64,
}

#[event]
pub struct DisputeResolved {
    pub dispute: Pubkey,
    pub upheld: bool,
    pub resolved_at: i64,
}

#[event]
pub struct ScoreRecalculated {
    pub hand: Pubkey,
    pub new_score: u32,
}
