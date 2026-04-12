use anchor_lang::prelude::*;

/// A scoped delegation from a verified Hand identity to an agent wallet.
/// Defines exactly what the agent is permitted to do, with budget limits,
/// an expiry timestamp, and an action bitmask.
#[account]
#[derive(InitSpace)]
/// Scoped permission link between a Hand and an AI agent
pub struct Delegation {
    /// The Hand PDA this delegation originates from.
    pub hand: Pubkey,
    /// The agent wallet that receives the delegated permissions.
    pub agent: Pubkey,
    /// The scope defining what the agent can do.
    pub scope: DelegationScope,
    /// When this delegation was created.
    pub delegated_at: i64,
    /// Last time the delegation was consumed (action executed).
    pub last_consumed_at: i64,
    /// Whether the delegation is currently active.
    pub active: bool,
    /// PDA bump seed.
    pub bump: u8,
}

/// Defines the boundaries of what a delegated agent is allowed to do.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, InitSpace)]
pub struct DelegationScope {
    /// Whitelist of program IDs the agent can interact with.
    /// Empty list means all programs are allowed.
    #[max_len(10)]
    /// Programs the agent is allowed to interact with
    pub allowed_programs: Vec<Pubkey>,
    /// Maximum lamports the agent can spend in a single transaction.
    pub max_lamports_per_tx: u64,
    /// Maximum total lamports the agent can spend over the delegation lifetime.
    pub max_lamports_total: u64,
    /// Running total of lamports spent so far.
    pub spent_lamports: u64,
    /// Unix timestamp when this delegation expires. 0 = no expiry.
    pub expires_at: i64,
    /// Bitmask of allowed action types (ACTION_SWAP, ACTION_STAKE, etc.).
    pub allowed_actions: u16,
}
