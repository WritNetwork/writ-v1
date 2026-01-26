use anchor_lang::prelude::*;

#[error_code]
pub enum HandError {
    #[msg("The ZK proof failed verification")]
    InvalidProof,

    #[msg("This nullifier has already been used to register a Hand")]
    NullifierAlreadyUsed,

    #[msg("A Hand identity already exists for this authority")]
    HandAlreadyExists,

    #[msg("Maximum number of delegations reached for this Hand")]
    MaxDelegationsReached,

    #[msg("Only the protocol authority can revoke a Hand")]
    UnauthorizedRevocation,

    #[msg("Verification data is malformed or incomplete")]
    InvalidVerificationData,

    #[msg("This Hand identity is not active")]
    HandNotActive,

    #[msg("Failed to read the on-chain clock")]
    ClockError,
}
