/// PDA seed for delegation accounts.
pub const DELEGATION_SEED: &[u8] = b"delegation";

/// Maximum number of allowed programs in a delegation scope.
pub const MAX_ALLOWED_PROGRAMS: usize = 10;

// ── Action Flags (bitmask) ──────────────────────────────────────────────────

/// Permission to execute token swaps.
pub const ACTION_SWAP: u16 = 1;
/// Permission to stake tokens.
pub const ACTION_STAKE: u16 = 2;
/// Permission to transfer tokens.
pub const ACTION_TRANSFER: u16 = 4;
/// Permission to vote in governance.
pub const ACTION_VOTE: u16 = 8;
/// Permission to mint tokens/NFTs.
pub const ACTION_MINT: u16 = 16;
/// All actions allowed.
pub const ACTION_ALL: u16 = 0xFFFF;
