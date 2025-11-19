use anchor_lang::prelude::*;

declare_id!("11111111111111111111111111111111");

pub mod constants;
pub mod error;
pub mod state;

#[program]
pub mod hand_registry {
    use super::*;

    pub fn initialize_hand(_ctx: Context<InitializeHand>) -> Result<()> {
        Ok(())
    }
}

#[derive(Accounts)]
pub struct InitializeHand {}
