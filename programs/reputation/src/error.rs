use anchor_lang::prelude::*;

#[error_code]
pub enum ReputationError {
    #[msg("The Hand identity is not active")]
    WritNotActive,

    #[msg("A reputation account already exists for this Hand")]
    ReputationAlreadyExists,

    #[msg("No reputation account found for this Hand")]
    ReputationNotFound,

    #[msg("The reporter is not registered or not active")]
    UnauthorizedReporter,

    #[msg("Only the protocol authority can perform this action")]
    UnauthorizedAuthority,

    #[msg("The dispute is not in a pending state")]
    DisputeNotPending,

    #[msg("The dispute has timed out")]
    DisputeTimedOut,

    #[msg("Insufficient stake amount for opening a dispute")]
    InsufficientStake,

    #[msg("Evidence URI exceeds maximum length")]
    EvidenceUriTooLong,

    #[msg("Failed to read the on-chain clock")]
    ClockError,

    #[msg("Arithmetic overflow in score calculation")]
    ArithmeticOverflow,

    #[msg("The reporter program is already registered")]
    ReporterAlreadyRegistered,
}
