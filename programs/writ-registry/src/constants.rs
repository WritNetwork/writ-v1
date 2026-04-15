/// Maximum number of active delegations a single Hand can have at once.
pub const MAX_DELEGATIONS: u8 = 5;

/// PDA seed for Hand accounts.
pub const HAND_SEED: &[u8] = b"hand";

/// PDA seed for nullifier record accounts.
pub const NULLIFIER_SEED: &[u8] = b"nullifier";

/// Minimum Solana account age in seconds (6 months) for future gating.
pub const MIN_ACCOUNT_AGE_SECONDS: i64 = 15_552_000;

/// PDA seed for the verification authority singleton.
pub const VERIFICATION_AUTHORITY_SEED: &[u8] = b"verification_authority";

/// Hard-coded protocol authority pubkey (replace with real key before mainnet).
/// This is the only account allowed to revoke hands.
pub const PROTOCOL_AUTHORITY: &str = "HANDauthXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX";

/// Maximum proof size in bytes
pub const MAX_PROOF_SIZE: usize = 256;
