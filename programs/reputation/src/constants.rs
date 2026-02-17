/// PDA seed for reputation accounts.
pub const REPUTATION_SEED: &[u8] = b"reputation";

/// PDA seed for reporter registry accounts.
pub const REPORTER_SEED: &[u8] = b"reporter";

/// PDA seed for dispute accounts.
pub const DISPUTE_SEED: &[u8] = b"dispute";

/// Maximum reputation score (represents 100.00%).
pub const MAX_SCORE: u32 = 10_000;

/// Lamports required to stake when opening a dispute.
pub const DISPUTE_STAKE_LAMPORTS: u64 = 100_000_000; // 0.1 SOL

/// How long a dispute can remain pending before auto-expiry (30 days).
pub const DISPUTE_TIMEOUT_SECONDS: i64 = 2_592_000;

/// Score penalty per lost dispute (5% of max).
pub const PENALTY_PER_LOST_DISPUTE: u32 = 500;

/// Score bonus per day of account age.
pub const AGE_BONUS_PER_DAY: u32 = 10;

/// Maximum age bonus cap.
pub const MAX_AGE_BONUS: u32 = 1_000;

/// Maximum length of evidence URI strings.
pub const MAX_EVIDENCE_URI_LEN: usize = 200;
