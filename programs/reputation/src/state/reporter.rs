use anchor_lang::prelude::*;

/// A registered reporter program authorized to submit action reports.
/// Only the protocol authority can register reporters.
#[account]
#[derive(InitSpace)]
/// Whitelisted program authorized to submit action reports
pub struct Reporter {
    /// The program ID of the reporter.
    pub program_id: Pubkey,
    /// The authority that registered this reporter.
    pub authorized_by: Pubkey,
    /// How many reports this reporter has submitted.
    pub reports_submitted: u64,
    /// When this reporter was registered.
    pub registered_at: i64,
    /// Whether this reporter is currently active.
    pub active: bool,
    /// PDA bump seed.
    pub bump: u8,
}
