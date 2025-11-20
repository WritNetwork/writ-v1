use anchor_lang::prelude::*;
use anchor_lang::solana_program::sysvar;

use crate::constants::HAND_SEED;
use crate::error::HandError;
use crate::state::hand::Hand;
use crate::HandRevoked;

#[derive(Accounts)]
pub struct RevokeHand<'info> {
    /// Protocol authority — must be the recognized authority key.
    /// In production this would be validated against a governance PDA
    /// or multisig; for now the signer is trusted.
    #[account(mut)]
    pub protocol_authority: Signer<'info>,

    /// The Hand to revoke. Must currently be active.
    #[account(
        mut,
        seeds = [HAND_SEED, hand.authority.as_ref()],
        bump = hand.bump,
        constraint = hand.active @ HandError::HandNotActive,
    )]
    pub hand: Account<'info, Hand>,

    /// CHECK: Clock sysvar for timestamping the revocation.
    #[account(address = sysvar::clock::id())]
    pub clock: AccountInfo<'info>,
}

pub fn handler(ctx: Context<RevokeHand>) -> Result<()> {
    let clock = Clock::from_account_info(&ctx.accounts.clock)
        .map_err(|_| HandError::ClockError)?;

    let hand = &mut ctx.accounts.hand;
    hand.active = false;

    emit!(HandRevoked {
        hand: hand.key(),
        revoked_at: clock.unix_timestamp,
    });

    Ok(())
}
