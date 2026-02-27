use anchor_lang::prelude::*;

use delegation::state::delegation::Delegation;
use hand_registry::state::hand::Hand;

use crate::error::GateError;

/// Utility function that other programs can call to assert that an agent
/// is backed by a valid Hand + active delegation.
///
/// This is designed to be used as a composable guard in CPI contexts:
///
/// ```ignore
/// hand_gate::macros::assert_hand_gated(
///     &delegation_account,
///     &hand_account,
///     &agent_pubkey,
///     now,
/// )?;
/// ```
pub fn assert_hand_gated(
    delegation_account: &Account<Delegation>,
    hand_account: &Account<Hand>,
    agent: &Pubkey,
    now: i64,
) -> Result<()> {
    // 1. Hand must be active
    require!(hand_account.active, GateError::HandNotActive);

    // 2. Delegation must be active
    require!(delegation_account.active, GateError::DelegationNotActive);

    // 3. Delegation must reference this hand
    require!(
        delegation_account.hand == hand_account.key(),
        GateError::DelegationHandMismatch
    );

    // 4. Delegation must reference this agent
    require!(
        delegation_account.agent == *agent,
        GateError::DelegationAgentMismatch
    );

    // 5. Delegation must not be expired
    if delegation_account.scope.expires_at > 0 {
        require!(
            now < delegation_account.scope.expires_at,
            GateError::DelegationExpired
        );
    }

    Ok(())
}
