use anchor_lang::prelude::*;

use delegation::state::delegation::Delegation;
use hand_registry::state::hand::Hand;
use reputation::state::reputation::Reputation;

use crate::error::GateError;

/// Deserialized + validated delegation data.
pub struct DelegationData {
    pub hand: Pubkey,
    pub agent: Pubkey,
    pub delegated_at: i64,
    pub expires_at: i64,
    pub allowed_actions: u16,
    pub allowed_programs: Vec<Pubkey>,
    pub max_lamports_per_tx: u64,
    pub max_lamports_total: u64,
    pub spent_lamports: u64,
}

/// Deserialized + validated Hand data.
pub struct HandData {
    pub authority: Pubkey,
    pub verified_at: i64,
    pub active: bool,
}

/// Deserialized + validated reputation data.
pub struct ReputationData {
    pub score: u32,
    pub total_actions: u64,
    pub successful_actions: u64,
}

/// Deserialize and validate a delegation account.
/// Checks that the delegation is active and not expired.
pub fn check_delegation(
    delegation_account: &Account<Delegation>,
    now: i64,
) -> Result<DelegationData> {
    require!(delegation_account.active, GateError::DelegationNotActive);

    if delegation_account.scope.expires_at > 0 {
        require!(
            now < delegation_account.scope.expires_at,
            GateError::DelegationExpired
        );
    }

    Ok(DelegationData {
        hand: delegation_account.hand,
        agent: delegation_account.agent,
        delegated_at: delegation_account.delegated_at,
        expires_at: delegation_account.scope.expires_at,
        allowed_actions: delegation_account.scope.allowed_actions,
        allowed_programs: delegation_account.scope.allowed_programs.clone(),
        max_lamports_per_tx: delegation_account.scope.max_lamports_per_tx,
        max_lamports_total: delegation_account.scope.max_lamports_total,
        spent_lamports: delegation_account.scope.spent_lamports,
    })
}

/// Deserialize and validate a Hand account.
/// Checks that the Hand is active.
pub fn check_hand(hand_account: &Account<Hand>) -> Result<HandData> {
    require!(hand_account.active, GateError::HandNotActive);

    Ok(HandData {
        authority: hand_account.authority,
        verified_at: hand_account.verified_at,
        active: hand_account.active,
    })
}

/// Deserialize and validate a reputation account against a minimum score.
pub fn check_reputation(
    reputation_account: &Account<Reputation>,
    min_score: u32,
) -> Result<ReputationData> {
    require!(
        reputation_account.score >= min_score,
        GateError::ReputationTooLow
    );

    Ok(ReputationData {
        score: reputation_account.score,
        total_actions: reputation_account.total_actions,
        successful_actions: reputation_account.successful_actions,
    })
}

/// Protocol version for compatibility checks
pub const PROTOCOL_VERSION: u8 = 4;
