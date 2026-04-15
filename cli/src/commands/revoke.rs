use clap::Args;
use colored::Colorize;
use indicatif::{ProgressBar, ProgressStyle};
use solana_client::rpc_client::RpcClient;
use solana_sdk::{
    instruction::{AccountMeta, Instruction},
    pubkey::Pubkey,
    signer::Signer,
    transaction::Transaction,
};

use crate::config::{load_config, load_keypair};
use crate::display::format_pubkey;

/// Revoke a delegation
#[derive(Args)]
pub struct RevokeArgs {
    /// Agent wallet pubkey whose delegation to revoke
    #[arg(long)]
    agent: String,
}

pub async fn handle(args: RevokeArgs) -> Result<(), Box<dyn std::error::Error>> {
    let config = load_config()?;
    let keypair = load_keypair(&config)?;
    let rpc = RpcClient::new(&config.rpc_url);
    let delegation_id = config.program_ids.delegation_pubkey()?;
    let registry_id = config.program_ids.writ_registry_pubkey()?;

    let agent: Pubkey = args
        .agent
        .parse()
        .map_err(|e| format!("Invalid agent pubkey '{}': {}", args.agent, e))?;

    // Derive PDAs
    let (hand_pda, _) =
        Pubkey::find_program_address(&[b"hand", keypair.pubkey().as_ref()], &registry_id);

    let (delegation_pda, _) = Pubkey::find_program_address(
        &[b"delegation", hand_pda.as_ref(), agent.as_ref()],
        &delegation_id,
    );

    // Build revoke instruction
    let ix_disc = {
        use sha2::{Digest, Sha256};
        let mut hasher = Sha256::new();
        hasher.update(b"global:revoke_delegation");
        let hash = hasher.finalize();
        let mut d = [0u8; 8];
        d.copy_from_slice(&hash[..8]);
        d
    };

    let ix = Instruction {
        program_id: delegation_id,
        accounts: vec![
            AccountMeta::new(keypair.pubkey(), true),    // authority
            AccountMeta::new_readonly(hand_pda, false),   // hand account
            AccountMeta::new(delegation_pda, false),       // delegation PDA
        ],
        data: ix_disc.to_vec(),
    };

    let spinner = ProgressBar::new_spinner();
    spinner.set_style(
        ProgressStyle::with_template("{spinner:.red} {msg}")
            .unwrap()
            .tick_strings(&["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"]),
    );
    spinner.set_message("Submitting revoke_delegation transaction...");
    spinner.enable_steady_tick(std::time::Duration::from_millis(80));

    let recent_blockhash = rpc.get_latest_blockhash()?;
    let tx = Transaction::new_signed_with_payer(
        &[ix],
        Some(&keypair.pubkey()),
        &[&keypair],
        recent_blockhash,
    );

    let sig = rpc.send_and_confirm_transaction(&tx)?;

    spinner.finish_and_clear();

    println!();
    println!("{}", "  Delegation revoked successfully!".green().bold());
    println!();
    println!("  {:<20} {}", "Delegation PDA:".bold(), delegation_pda);
    println!("  {:<20} {}", "Agent:".bold(), format_pubkey(&agent));
    println!("  {:<20} {}", "Signature:".bold(), sig);
    println!();

    Ok(())
}
