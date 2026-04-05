use anchor_lang::prelude::*;

/// On-chain reputation for a verified Hand identity.
/// Tracks action history, dispute outcomes, and a composite score.
#[account]
#[derive(InitSpace)]
pub struct Reputation {
    /// The Hand PDA this reputation belongs to.
    pub hand: Pubkey,
    /// Total number of reported actions.
    /// Total number of reported actions
    pub total_actions: u64,
    /// Number of actions reported as successful.
    pub successful_actions: u64,
    /// Cumulative volume in lamports across all actions.
    pub total_volume_lamports: u128,
    /// Number of disputes filed against this Hand.
    pub disputes_received: u16,
    /// Number of disputes that were upheld (lost by the Hand).
    pub disputes_lost: u16,
    /// Composite reputation score (0 — 10000).
    pub score: u32,
    /// Last time the reputation was updated.
    pub last_updated: i64,
    /// When this reputation account was created.
    pub created_at: i64,
    /// PDA bump seed.
    pub bump: u8,
}
