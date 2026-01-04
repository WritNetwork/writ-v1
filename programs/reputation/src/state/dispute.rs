use anchor_lang::prelude::*;

/// A dispute filed against an agent/Hand.
/// Requires a stake from the challenger. Resolved by protocol authority.
#[account]
#[derive(InitSpace)]
pub struct Dispute {
    /// The agent being disputed.
    pub agent: Pubkey,
    /// The account that filed the dispute.
    pub challenger: Pubkey,
    /// The Hand identity being challenged.
    pub hand: Pubkey,
    /// URI pointing to off-chain evidence (IPFS, Arweave, etc.).
    #[max_len(200)]
    pub evidence_uri: String,
    /// Lamports staked by the challenger.
    pub stake_lamports: u64,
    /// Current status of the dispute.
    pub status: DisputeStatus,
    /// When the dispute was filed.
    pub created_at: i64,
    /// When the dispute was resolved (0 if still pending).
    pub resolved_at: i64,
    /// PDA bump seed.
    pub bump: u8,
}

/// Dispute resolution status.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq, InitSpace)]
pub enum DisputeStatus {
    /// Awaiting resolution by protocol authority.
    Pending,
    /// Dispute was upheld — penalty applied to the Hand's reputation.
    Upheld,
    /// Dispute was rejected — challenger loses their stake.
    Rejected,
}
