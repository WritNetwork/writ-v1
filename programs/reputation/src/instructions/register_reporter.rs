use anchor_lang::prelude::*;
use anchor_lang::solana_program::sysvar;

use crate::constants::REPORTER_SEED;
use crate::error::ReputationError;
use crate::state::reporter::Reporter;

#[derive(Accounts)]
#[instruction()]
pub struct RegisterReporter<'info> {
    /// Protocol authority — only they can register reporters.
    #[account(mut)]
    pub authority: Signer<'info>,

    /// The program to register as an authorized reporter.
    /// CHECK: This is just the program's pubkey.
    pub reporter_program: AccountInfo<'info>,

    /// Reporter PDA, seeded by ["reporter", reporter_program].
    #[account(
        init,
        payer = authority,
        space = 8 + Reporter::INIT_SPACE,
        seeds = [REPORTER_SEED, reporter_program.key().as_ref()],
        bump,
    )]
    pub reporter: Account<'info, Reporter>,

    pub system_program: Program<'info, System>,

    /// CHECK: Clock sysvar.
    #[account(address = sysvar::clock::id())]
    pub clock: AccountInfo<'info>,
}

pub fn handler(ctx: Context<RegisterReporter>) -> Result<()> {
    let clock = Clock::from_account_info(&ctx.accounts.clock)
        .map_err(|_| ReputationError::ClockError)?;

    let reporter = &mut ctx.accounts.reporter;
    reporter.program_id = ctx.accounts.reporter_program.key();
    reporter.authorized_by = ctx.accounts.authority.key();
    reporter.reports_submitted = 0;
    reporter.registered_at = clock.unix_timestamp;
    reporter.active = true;
    reporter.bump = ctx.bumps.reporter;

    Ok(())
}
