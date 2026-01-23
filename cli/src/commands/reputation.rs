use clap::{Args, Subcommand};
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
use crate::display::{deserialize_reputation, print_reputation};

/// View reputation for a Hand
#[derive(Args)]
pub struct ReputationArgs {
    #[command(subcommand)]
    action: ReputationAction,
}

#[derive(Subcommand)]
enum ReputationAction {
    /// View reputation for a wallet
    View {
        /// Wallet pubkey to look up
        #[arg(long)]
        wallet: String,
    },
    /// Request reputation recalculation
    Recalculate {
        /// Wallet pubkey to recalculate
        #[arg(long)]
        wallet: String,
    },
}

pub async fn handle(args: ReputationArgs) -> Result<(), Box<dyn std::error::Error>> {
    match args.action {
        ReputationAction::View { wallet } => handle_view(&wallet).await,
        ReputationAction::Recalculate { wallet } => handle_recalculate(&wallet).await,
    }
}

async fn handle_view(wallet_str: &str) -> Result<(), Box<dyn std::error::Error>> {
    let config = load_config()?;
    let rpc = RpcClient::new(&config.rpc_url);
    let registry_id = config.program_ids.hand_registry_pubkey()?;
    let reputation_id = config.program_ids.reputation_pubkey()?;

    let wallet: Pubkey = wallet_str
        .parse()
        .map_err(|e| format!("Invalid wallet pubkey '{}': {}", wallet_str, e))?;

    let (hand_pda, _) =
        Pubkey::find_program_address(&[b"hand", wallet.as_ref()], &registry_id);

    let (rep_pda, _) =
        Pubkey::find_program_address(&[b"reputation", hand_pda.as_ref()], &reputation_id);

    let acct = rpc.get_account(&rep_pda).map_err(|_| {
        format!(
            "Reputation account not found for wallet {}",
            wallet_str
        )
    })?;

    let rep = deserialize_reputation(&acct.data)
        .map_err(|e| format!("Failed to deserialize reputation: {}", e))?;

    print_reputation(&rep, &rep_pda);

    Ok(())
}

async fn handle_recalculate(wallet_str: &str) -> Result<(), Box<dyn std::error::Error>> {
    let config = load_config()?;
    let keypair = load_keypair(&config)?;
    let rpc = RpcClient::new(&config.rpc_url);
    let registry_id = config.program_ids.hand_registry_pubkey()?;
    let reputation_id = config.program_ids.reputation_pubkey()?;

    let wallet: Pubkey = wallet_str
        .parse()
        .map_err(|e| format!("Invalid wallet pubkey '{}': {}", wallet_str, e))?;

    let (hand_pda, _) =
        Pubkey::find_program_address(&[b"hand", wallet.as_ref()], &registry_id);

    let (rep_pda, _) =
        Pubkey::find_program_address(&[b"reputation", hand_pda.as_ref()], &reputation_id);

    // Build recalculate instruction
    let ix_disc = {
        use sha2::{Digest, Sha256};
        let mut hasher = Sha256::new();
        hasher.update(b"global:recalculate_reputation");
        let hash = hasher.finalize();
        let mut d = [0u8; 8];
        d.copy_from_slice(&hash[..8]);
        d
    };

    let ix = Instruction {
        program_id: reputation_id,
        accounts: vec![
            AccountMeta::new(keypair.pubkey(), true),    // payer
            AccountMeta::new_readonly(hand_pda, false),   // hand account
            AccountMeta::new(rep_pda, false),              // reputation account
        ],
        data: ix_disc.to_vec(),
    };

    let spinner = ProgressBar::new_spinner();
    spinner.set_style(
        ProgressStyle::with_template("{spinner:.magenta} {msg}")
            .unwrap()
            .tick_strings(&["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"]),
    );
    spinner.set_message("Submitting recalculate_reputation transaction...");
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
    println!(
        "{}",
        "  Reputation recalculation submitted!".green().bold()
    );
    println!("  {:<16} {}", "Signature:".bold(), sig);
    println!();

    // Fetch and display updated reputation
    let acct = rpc.get_account(&rep_pda)?;
    let rep = deserialize_reputation(&acct.data)
        .map_err(|e| format!("Failed to deserialize reputation: {}", e))?;
    print_reputation(&rep, &rep_pda);

    Ok(())
}
