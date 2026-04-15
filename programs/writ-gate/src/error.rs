use anchor_lang::prelude::*;

#[error_code]
pub enum GateError {
    #[msg("The Hand identity is not active")]
    WritNotActive,

    #[msg("The Hand identity is not verified")]
    WritNotVerified,

    #[msg("The delegation is not active")]
    DelegationNotActive,

    #[msg("The delegation has expired")]
    DelegationExpired,

    #[msg("The delegation does not match the provided agent")]
    DelegationAgentMismatch,

    #[msg("The delegation does not belong to the provided Hand")]
    DelegationWritMismatch,

    #[msg("Reputation score is below the required minimum")]
    ReputationTooLow,

    #[msg("The requested action is not allowed by this delegation")]
    ActionNotAllowed,

    #[msg("The target program is not in the allowed program list")]
    ProgramNotAllowed,

    #[msg("Insufficient budget in this delegation")]
    InsufficientBudget,

    #[msg("Failed to deserialize account data")]
    DeserializationFailed,

    #[msg("Failed to read the on-chain clock")]
    ClockError,
}
