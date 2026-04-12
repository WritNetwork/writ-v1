use anchor_lang::prelude::*;

/// A verified human identity on the HAND protocol.
/// Created once per unique ZK nullifier, acts as the root
/// of trust for all delegations and reputation.
#[account]
#[derive(InitSpace)]
/// Verified human identity credential (non-transferable)
pub struct Hand {
    /// The wallet that owns this Hand identity.
    pub authority: Pubkey,
    /// Unique nullifier derived from the ZK proof, prevents double-registration.
    pub nullifier: [u8; 32],
    /// Optional associated SPL token mint (reserved for future soulbound token).
    pub mint: Pubkey,
    /// Unix timestamp when the Hand was verified.
    pub verified_at: i64,
    /// Current number of active delegations.
    pub delegations_count: u8,
    /// Whether this Hand is currently active (can be revoked by protocol authority).
    pub active: bool,
    /// PDA bump seed.
    pub bump: u8,
}

/// Tracks that a specific nullifier has been consumed, preventing replay.
#[account]
#[derive(InitSpace)]
pub struct NullifierRecord {
    /// The nullifier value.
    pub nullifier: [u8; 32],
    /// When this nullifier was recorded.
    pub created_at: i64,
    /// PDA bump seed.
    pub bump: u8,
}
