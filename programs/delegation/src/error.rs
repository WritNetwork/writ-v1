use anchor_lang::prelude::*;

#[error_code]
pub enum DelegationError {
    #[msg("The Hand identity is not active")]
    WritNotActive,

    #[msg("The Hand identity has not been verified")]
    WritNotVerified,

    #[msg("This Hand has reached the maximum number of delegations")]
    TooManyDelegations,

    #[msg("This delegation is not active")]
    DelegationNotActive,

    #[msg("This delegation has expired")]
    DelegationExpired,

    #[msg("Insufficient budget remaining for this transaction")]
    InsufficientBudget,

    #[msg("The requested action is not allowed by this delegation")]
    ActionNotAllowed,

    #[msg("The target program is not in the allowed list")]
    ProgramNotAllowed,

    #[msg("Caller is not authorized to perform this operation")]
    UnauthorizedCaller,

    #[msg("The provided delegation scope is invalid")]
    InvalidScope,

    #[msg("Too many programs in the allowed list (max 10)")]
    MaxProgramsExceeded,
}
