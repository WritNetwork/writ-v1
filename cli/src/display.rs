use colored::Colorize;
use solana_sdk::pubkey::Pubkey;

// ── Account data structs (mirror on-chain layout, deserialized via borsh) ───

/// Mirror of the on-chain Hand account (after 8-byte discriminator).
#[derive(Debug)]
pub struct HandData {
    pub authority: Pubkey,
    pub nullifier: [u8; 32],
    pub mint: Pubkey,
    pub verified_at: i64,
    pub delegations_count: u8,
    pub active: bool,
    pub bump: u8,
}

/// Mirror of the on-chain Delegation account.
#[derive(Debug)]
pub struct DelegationData {
    pub hand: Pubkey,
    pub agent: Pubkey,
    pub authority: Pubkey,
    pub allowed_programs: Vec<Pubkey>,
    pub allowed_actions: u16,
    pub max_sol_per_tx: u64,
    pub max_sol_total: u64,
    pub sol_spent: u64,
    pub expires_at: i64,
    pub created_at: i64,
    pub active: bool,
    pub bump: u8,
}

/// Mirror of the on-chain Reputation account.
#[derive(Debug)]
pub struct ReputationData {
    pub hand: Pubkey,
    pub score: u32,
    pub successful_txs: u64,
    pub failed_txs: u64,
    pub disputes_won: u32,
    pub disputes_lost: u32,
    pub last_updated: i64,
    pub bump: u8,
}

// ── Action flag constants ──────────────────────────────────────────────────

pub const ACTION_SWAP: u16 = 1;
pub const ACTION_STAKE: u16 = 2;
pub const ACTION_TRANSFER: u16 = 4;
pub const ACTION_VOTE: u16 = 8;
pub const ACTION_MINT: u16 = 16;

pub fn action_flags_to_names(flags: u16) -> Vec<&'static str> {
    let mut names = Vec::new();
    if flags & ACTION_SWAP != 0 {
        names.push("swap");
    }
    if flags & ACTION_STAKE != 0 {
        names.push("stake");
    }
    if flags & ACTION_TRANSFER != 0 {
        names.push("transfer");
    }
    if flags & ACTION_VOTE != 0 {
        names.push("vote");
    }
    if flags & ACTION_MINT != 0 {
        names.push("mint");
    }
    names
}

pub fn parse_action_name(name: &str) -> Option<u16> {
    match name.trim().to_lowercase().as_str() {
        "swap" => Some(ACTION_SWAP),
        "stake" => Some(ACTION_STAKE),
        "transfer" => Some(ACTION_TRANSFER),
        "vote" => Some(ACTION_VOTE),
        "mint" => Some(ACTION_MINT),
        _ => None,
    }
}

// ── Formatting helpers ─────────────────────────────────────────────────────

pub fn format_pubkey(pubkey: &Pubkey) -> String {
    let s = pubkey.to_string();
    if s.len() > 10 {
        format!("{}...{}", &s[..4], &s[s.len() - 3..])
    } else {
        s
    }
}

pub fn format_lamports(lamports: u64) -> String {
    let sol = lamports as f64 / 1_000_000_000.0;
    format!("{:.4} SOL", sol)
}

pub fn format_timestamp(ts: i64) -> String {
    if ts == 0 {
        return "N/A".to_string();
    }
    // Simple UTC formatting without external chrono dependency.
    // Compute date from Unix timestamp using the civil-from-days algorithm.
    let secs = ts;
    let days_since_epoch = secs / 86400;
    let time_of_day = ((secs % 86400) + 86400) % 86400;
    let h = time_of_day / 3600;
    let m = (time_of_day % 3600) / 60;
    let s = time_of_day % 60;

    // Algorithm from Howard Hinnant's civil_from_days
    let z = days_since_epoch + 719468;
    let era = if z >= 0 { z } else { z - 146096 } / 146097;
    let doe = (z - era * 146097) as u64;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let y = (yoe as i64) + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let mon = if mp < 10 { mp + 3 } else { mp - 9 };
    let year = if mon <= 2 { y + 1 } else { y };

    format!(
        "{:04}-{:02}-{:02} {:02}:{:02}:{:02} UTC",
        year, mon, d, h, m, s
    )
}

pub fn format_score(score: u32) -> String {
    let max_score: u32 = 1000;
    let filled = ((score as f64 / max_score as f64) * 20.0).round() as usize;
    let bar: String = "█".repeat(filled) + &"░".repeat(20 - filled.min(20));

    let colored_score = if score >= 800 {
        format!("{}", score.to_string().green().bold())
    } else if score >= 500 {
        format!("{}", score.to_string().yellow())
    } else {
        format!("{}", score.to_string().red())
    };

    format!("{} [{}] / {}", colored_score, bar, max_score)
}

// ── Pretty printers ────────────────────────────────────────────────────────

pub fn print_hand_status(hand: &HandData, pda: &Pubkey) {
    println!();
    println!("{}", "╔══════════════════════════════════════════╗".cyan());
    println!(
        "{}  {}  {}",
        "║".cyan(),
        "HAND IDENTITY".bold().white(),
        "║".cyan()
    );
    println!("{}", "╠══════════════════════════════════════════╣".cyan());
    println!(
        "{}  {:<18} {}",
        "║".cyan(),
        "PDA:".bold(),
        format_pubkey(pda)
    );
    println!(
        "{}  {:<18} {}",
        "║".cyan(),
        "Authority:".bold(),
        format_pubkey(&hand.authority)
    );
    println!(
        "{}  {:<18} {}",
        "║".cyan(),
        "Nullifier:".bold(),
        bs58::encode(&hand.nullifier).into_string()
    );
    println!(
        "{}  {:<18} {}",
        "║".cyan(),
        "Mint:".bold(),
        format_pubkey(&hand.mint)
    );
    println!(
        "{}  {:<18} {}",
        "║".cyan(),
        "Verified at:".bold(),
        format_timestamp(hand.verified_at)
    );
    println!(
        "{}  {:<18} {}",
        "║".cyan(),
        "Delegations:".bold(),
        hand.delegations_count
    );
    let status = if hand.active {
        "ACTIVE".green().bold().to_string()
    } else {
        "REVOKED".red().bold().to_string()
    };
    println!("{}  {:<18} {}", "║".cyan(), "Status:".bold(), status);
    println!("{}", "╚══════════════════════════════════════════╝".cyan());
}

pub fn print_delegation(del: &DelegationData, pda: &Pubkey) {
    println!();
    println!("{}", "┌──────────────────────────────────────────┐".yellow());
    println!(
        "{}  {}  {}",
        "│".yellow(),
        "DELEGATION".bold().white(),
        "│".yellow()
    );
    println!("{}", "├──────────────────────────────────────────┤".yellow());
    println!(
        "{}  {:<18} {}",
        "│".yellow(),
        "PDA:".bold(),
        format_pubkey(pda)
    );
    println!(
        "{}  {:<18} {}",
        "│".yellow(),
        "Hand:".bold(),
        format_pubkey(&del.hand)
    );
    println!(
        "{}  {:<18} {}",
        "│".yellow(),
        "Agent:".bold(),
        format_pubkey(&del.agent)
    );
    println!(
        "{}  {:<18} {}",
        "│".yellow(),
        "Authority:".bold(),
        format_pubkey(&del.authority)
    );

    let actions = action_flags_to_names(del.allowed_actions);
    println!(
        "{}  {:<18} {}",
        "│".yellow(),
        "Actions:".bold(),
        if actions.is_empty() {
            "none".to_string()
        } else {
            actions.join(", ")
        }
    );

    if !del.allowed_programs.is_empty() {
        println!(
            "{}  {:<18} {}",
            "│".yellow(),
            "Programs:".bold(),
            del.allowed_programs
                .iter()
                .map(|p| format_pubkey(p))
                .collect::<Vec<_>>()
                .join(", ")
        );
    }

    println!(
        "{}  {:<18} {}",
        "│".yellow(),
        "Max SOL/tx:".bold(),
        format_lamports(del.max_sol_per_tx)
    );
    println!(
        "{}  {:<18} {}",
        "│".yellow(),
        "Max SOL total:".bold(),
        format_lamports(del.max_sol_total)
    );
    println!(
        "{}  {:<18} {}",
        "│".yellow(),
        "SOL spent:".bold(),
        format_lamports(del.sol_spent)
    );
    println!(
        "{}  {:<18} {}",
        "│".yellow(),
        "Expires at:".bold(),
        format_timestamp(del.expires_at)
    );
    println!(
        "{}  {:<18} {}",
        "│".yellow(),
        "Created at:".bold(),
        format_timestamp(del.created_at)
    );

    let status = if del.active {
        "ACTIVE".green().bold().to_string()
    } else {
        "REVOKED".red().bold().to_string()
    };
    println!("{}  {:<18} {}", "│".yellow(), "Status:".bold(), status);
    println!("{}", "└──────────────────────────────────────────┘".yellow());
}

pub fn print_reputation(rep: &ReputationData, pda: &Pubkey) {
    println!();
    println!("{}", "┌──────────────────────────────────────────┐".magenta());
    println!(
        "{}  {}  {}",
        "│".magenta(),
        "REPUTATION".bold().white(),
        "│".magenta()
    );
    println!("{}", "├──────────────────────────────────────────┤".magenta());
    println!(
        "{}  {:<18} {}",
        "│".magenta(),
        "PDA:".bold(),
        format_pubkey(pda)
    );
    println!(
        "{}  {:<18} {}",
        "│".magenta(),
        "Hand:".bold(),
        format_pubkey(&rep.hand)
    );
    println!(
        "{}  {:<18} {}",
        "│".magenta(),
        "Score:".bold(),
        format_score(rep.score)
    );
    println!(
        "{}  {:<18} {}",
        "│".magenta(),
        "Successful TXs:".bold(),
        rep.successful_txs
    );
    println!(
        "{}  {:<18} {}",
        "│".magenta(),
        "Failed TXs:".bold(),
        rep.failed_txs
    );
    println!(
        "{}  {:<18} {}",
        "│".magenta(),
        "Disputes won:".bold(),
        rep.disputes_won
    );
    println!(
        "{}  {:<18} {}",
        "│".magenta(),
        "Disputes lost:".bold(),
        rep.disputes_lost
    );
    println!(
        "{}  {:<18} {}",
        "│".magenta(),
        "Last updated:".bold(),
        format_timestamp(rep.last_updated)
    );
    println!("{}", "└──────────────────────────────────────────┘".magenta());
}

pub fn print_verify_result(
    agent: &Pubkey,
    delegation: Option<&DelegationData>,
    hand: Option<&HandData>,
    reputation: Option<&ReputationData>,
    min_reputation: Option<u32>,
) {
    println!();

    let has_delegation = delegation.map(|d| d.active).unwrap_or(false);
    let has_hand = hand.map(|h| h.active).unwrap_or(false);
    let meets_rep = match (min_reputation, reputation) {
        (Some(min), Some(rep)) => rep.score >= min,
        (Some(_), None) => false,
        (None, _) => true,
    };

    let verified = has_delegation && has_hand && meets_rep;

    if verified {
        println!(
            "{}",
            "  ✓ VERIFIED — Agent has a valid HAND delegation"
                .green()
                .bold()
        );
    } else {
        println!(
            "{}",
            "  ✗ NOT VERIFIED — Agent does not pass HAND check"
                .red()
                .bold()
        );
    }

    println!();
    println!("  {:<22} {}", "Agent:".bold(), format_pubkey(agent));
    println!(
        "  {:<22} {}",
        "Active delegation:".bold(),
        if has_delegation {
            "YES".green().to_string()
        } else {
            "NO".red().to_string()
        }
    );
    println!(
        "  {:<22} {}",
        "Active Hand:".bold(),
        if has_hand {
            "YES".green().to_string()
        } else {
            "NO".red().to_string()
        }
    );

    if let Some(min) = min_reputation {
        let score = reputation.map(|r| r.score).unwrap_or(0);
        println!(
            "  {:<22} {} (required: {})",
            "Reputation:".bold(),
            if meets_rep {
                score.to_string().green().to_string()
            } else {
                score.to_string().red().to_string()
            },
            min
        );
    }

    println!();
}

// ── Deserialization helpers ────────────────────────────────────────────────

/// Anchor discriminator is the first 8 bytes of sha256("account:<Name>").
pub fn anchor_discriminator(account_name: &str) -> [u8; 8] {
    use sha2::{Digest, Sha256};
    let mut hasher = Sha256::new();
    hasher.update(format!("account:{}", account_name));
    let hash = hasher.finalize();
    let mut disc = [0u8; 8];
    disc.copy_from_slice(&hash[..8]);
    disc
}

/// Deserialize a Hand account from raw account data (includes 8-byte discriminator).
pub fn deserialize_hand(data: &[u8]) -> Result<HandData, String> {
    let disc = anchor_discriminator("Hand");
    if data.len() < 8 || data[..8] != disc {
        return Err("Invalid Hand account discriminator".to_string());
    }
    let d = &data[8..];
    if d.len() < 32 + 32 + 32 + 8 + 1 + 1 + 1 {
        return Err("Hand account data too short".to_string());
    }
    let mut offset = 0;

    let authority = Pubkey::try_from(&d[offset..offset + 32]).unwrap();
    offset += 32;

    let mut nullifier = [0u8; 32];
    nullifier.copy_from_slice(&d[offset..offset + 32]);
    offset += 32;

    let mint = Pubkey::try_from(&d[offset..offset + 32]).unwrap();
    offset += 32;

    let verified_at = i64::from_le_bytes(d[offset..offset + 8].try_into().unwrap());
    offset += 8;

    let delegations_count = d[offset];
    offset += 1;

    let active = d[offset] != 0;
    offset += 1;

    let bump = d[offset];

    Ok(HandData {
        authority,
        nullifier,
        mint,
        verified_at,
        delegations_count,
        active,
        bump,
    })
}

/// Deserialize a Delegation account from raw account data.
pub fn deserialize_delegation(data: &[u8]) -> Result<DelegationData, String> {
    let disc = anchor_discriminator("Delegation");
    if data.len() < 8 || data[..8] != disc {
        return Err("Invalid Delegation account discriminator".to_string());
    }
    let d = &data[8..];
    let mut offset = 0;

    let hand = read_pubkey(d, &mut offset)?;
    let agent = read_pubkey(d, &mut offset)?;
    let authority = read_pubkey(d, &mut offset)?;

    // Vec<Pubkey> — 4-byte length prefix then N * 32
    let programs_len = read_u32(d, &mut offset)? as usize;
    let mut allowed_programs = Vec::with_capacity(programs_len);
    for _ in 0..programs_len {
        allowed_programs.push(read_pubkey(d, &mut offset)?);
    }

    let allowed_actions = read_u16(d, &mut offset)?;
    let max_sol_per_tx = read_u64(d, &mut offset)?;
    let max_sol_total = read_u64(d, &mut offset)?;
    let sol_spent = read_u64(d, &mut offset)?;
    let expires_at = read_i64(d, &mut offset)?;
    let created_at = read_i64(d, &mut offset)?;

    if offset >= d.len() {
        return Err("Delegation account data too short for active flag".to_string());
    }
    let active = d[offset] != 0;
    offset += 1;

    if offset >= d.len() {
        return Err("Delegation account data too short for bump".to_string());
    }
    let bump = d[offset];

    Ok(DelegationData {
        hand,
        agent,
        authority,
        allowed_programs,
        allowed_actions,
        max_sol_per_tx,
        max_sol_total,
        sol_spent,
        expires_at,
        created_at,
        active,
        bump,
    })
}

/// Deserialize a Reputation account from raw account data.
pub fn deserialize_reputation(data: &[u8]) -> Result<ReputationData, String> {
    let disc = anchor_discriminator("Reputation");
    if data.len() < 8 || data[..8] != disc {
        return Err("Invalid Reputation account discriminator".to_string());
    }
    let d = &data[8..];
    let mut offset = 0;

    let hand = read_pubkey(d, &mut offset)?;
    let score = read_u32(d, &mut offset)?;
    let successful_txs = read_u64(d, &mut offset)?;
    let failed_txs = read_u64(d, &mut offset)?;
    let disputes_won = read_u32(d, &mut offset)?;
    let disputes_lost = read_u32(d, &mut offset)?;
    let last_updated = read_i64(d, &mut offset)?;

    if offset >= d.len() {
        return Err("Reputation account data too short for bump".to_string());
    }
    let bump = d[offset];

    Ok(ReputationData {
        hand,
        score,
        successful_txs,
        failed_txs,
        disputes_won,
        disputes_lost,
        last_updated,
        bump,
    })
}

// ── Raw byte readers ───────────────────────────────────────────────────────

fn read_pubkey(data: &[u8], offset: &mut usize) -> Result<Pubkey, String> {
    if *offset + 32 > data.len() {
        return Err(format!(
            "Not enough bytes for Pubkey at offset {}",
            offset
        ));
    }
    let pk = Pubkey::try_from(&data[*offset..*offset + 32]).unwrap();
    *offset += 32;
    Ok(pk)
}

fn read_u16(data: &[u8], offset: &mut usize) -> Result<u16, String> {
    if *offset + 2 > data.len() {
        return Err(format!("Not enough bytes for u16 at offset {}", offset));
    }
    let val = u16::from_le_bytes(data[*offset..*offset + 2].try_into().unwrap());
    *offset += 2;
    Ok(val)
}

fn read_u32(data: &[u8], offset: &mut usize) -> Result<u32, String> {
    if *offset + 4 > data.len() {
        return Err(format!("Not enough bytes for u32 at offset {}", offset));
    }
    let val = u32::from_le_bytes(data[*offset..*offset + 4].try_into().unwrap());
    *offset += 4;
    Ok(val)
}

fn read_u64(data: &[u8], offset: &mut usize) -> Result<u64, String> {
    if *offset + 8 > data.len() {
        return Err(format!("Not enough bytes for u64 at offset {}", offset));
    }
    let val = u64::from_le_bytes(data[*offset..*offset + 8].try_into().unwrap());
    *offset += 8;
    Ok(val)
}

fn read_i64(data: &[u8], offset: &mut usize) -> Result<i64, String> {
    if *offset + 8 > data.len() {
        return Err(format!("Not enough bytes for i64 at offset {}", offset));
    }
    let val = i64::from_le_bytes(data[*offset..*offset + 8].try_into().unwrap());
    *offset += 8;
    Ok(val)
}
