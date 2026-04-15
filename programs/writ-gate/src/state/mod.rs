use anchor_lang::prelude::*;

/// The result of a gateway verification check.
/// Returned via events rather than as return data due to Anchor conventions.
#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct VerifyResult {
    /// Whether the verification passed all checks.
    pub is_valid: bool,
    /// The Hand PDA backing this agent.
    pub hand_key: Pubkey,
    /// The agent's current reputation score (0 if not checked).
    pub reputation_score: u32,
    /// When the delegation was created.
    pub delegated_at: i64,
    /// When the delegation expires (0 = no expiry).
    pub expires_at: i64,
    /// Bitmask of allowed actions.
    pub allowed_actions: u16,
}
