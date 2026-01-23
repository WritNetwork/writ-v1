use clap::Args;
use colored::Colorize;
use indicatif::{ProgressBar, ProgressStyle};
use solana_client::rpc_client::RpcClient;
use solana_sdk::{
    instruction::{AccountMeta, Instruction},
    pubkey::Pubkey,
    signer::Signer,
    system_program,
    transaction::Transaction,
};

use crate::config::{load_config, load_keypair};
use crate::display::{format_lamports, format_pubkey};

/// Open a dispute against an agent
#[derive(Args)]
pub struct DisputeArgs {
    /// Agent wallet pubkey to dispute
    #[arg(long)]
    agent: String,

    /// URI to evidence (e.g. IPFS hash or URL)
    #[arg(long)]
    evidence_uri: String,

    /// SOL amount to stake on the dispute
    #[arg(long)]
    stake: f64,
}

pub async fn handle(args: DisputeArgs) -> Result<(), Box<dyn std::error::Error>> {
    let config = load_config()?;
    let keypair = load_keypair(&config)?;
    let rpc = RpcClient::new(&config.rpc_url);
    let reputation_id = config.program_ids.reputation_pubkey()?;
    let registry_id = config.program_ids.hand_registry_pubkey()?;
    let delegation_id = config.program_ids.delegation_pubkey()?;

    let agent: Pubkey = args
        .agent
        .parse()
        .map_err(|e| format!("Invalid agent pubkey '{}': {}", args.agent, e))?;

    let stake_lamports = (args.stake * 1_000_000_000.0) as u64;

    if stake_lamports == 0 {
        return Err("Stake must be greater than 0 SOL".into());
    }

    // Derive the disputor's hand PDA
    let (disputor_hand_pda, _) =
        Pubkey::find_program_address(&[b"hand", keypair.pubkey().as_ref()], &registry_id);

    // We need to find the agent's delegation to get its hand PDA.
    // Scan delegation accounts where agent field matches.
    use solana_sdk::commitment_config::CommitmentConfig;
    let delegation_accounts = rpc.get_program_accounts_with_config(
        &delegation_id,
        solana_client::rpc_config::RpcProgramAccountsConfig {
            filters: Some(vec![solana_client::rpc_filter::RpcFilterType::Memcmp(
                solana_client::rpc_filter::Memcmp::new_base58_encoded(40, &agent.to_bytes()),
            )]),
            account_config: solana_client::rpc_config::RpcAccountInfoConfig {
                commitment: Some(CommitmentConfig::confirmed()),
                ..Default::default()
            },
            with_context: None,
        },
    )?;

    // Pick the first active delegation for this agent
    let mut target_hand: Option<Pubkey> = None;
    let mut delegation_pda: Option<Pubkey> = None;

    for (pda, acct) in &delegation_accounts {
        if let Ok(del) = crate::display::deserialize_delegation(&acct.data) {
            if del.agent == agent && del.active {
                target_hand = Some(del.hand);
                delegation_pda = Some(*pda);
                break;
            }
        }
    }

    let target_hand =
        target_hand.ok_or("No active delegation found for this agent")?;
    let delegation_pda =
        delegation_pda.ok_or("No delegation PDA found")?;

    // Derive dispute PDA: seeds = ["dispute", delegation_pda, disputor_pubkey]
    let (dispute_pda, _) = Pubkey::find_program_address(
        &[
            b"dispute",
            delegation_pda.as_ref(),
            keypair.pubkey().as_ref(),
        ],
        &reputation_id,
    );

    // Derive reputation PDA for the target hand
    let (rep_pda, _) = Pubkey::find_program_address(
        &[b"reputation", target_hand.as_ref()],
        &reputation_id,
    );

    // Build open_dispute instruction
    let ix_disc = {
        use sha2::{Digest, Sha256};
        let mut hasher = Sha256::new();
        hasher.update(b"global:open_dispute");
        let hash = hasher.finalize();
        let mut d = [0u8; 8];
        d.copy_from_slice(&hash[..8]);
        d
    };

    let mut ix_data = Vec::new();
    ix_data.extend_from_slice(&ix_disc);

    // evidence_uri: Borsh String = 4-byte len + utf8 bytes
    let uri_bytes = args.evidence_uri.as_bytes();
    ix_data.extend_from_slice(&(uri_bytes.len() as u32).to_le_bytes());
    ix_data.extend_from_slice(uri_bytes);

    // stake: u64
    ix_data.extend_from_slice(&stake_lamports.to_le_bytes());

    let ix = Instruction {
        program_id: reputation_id,
        accounts: vec![
            AccountMeta::new(keypair.pubkey(), true),       // disputor / payer
            AccountMeta::new_readonly(disputor_hand_pda, false), // disputor's hand
            AccountMeta::new_readonly(delegation_pda, false),    // delegation being disputed
            AccountMeta::new_readonly(target_hand, false),       // target hand
            AccountMeta::new(rep_pda, false),                    // reputation account
            AccountMeta::new(dispute_pda, false),                // dispute PDA (init)
            AccountMeta::new_readonly(system_program::id(), false),
        ],
        data: ix_data,
    };

    let spinner = ProgressBar::new_spinner();
    spinner.set_style(
        ProgressStyle::with_template("{spinner:.red} {msg}")
            .unwrap()
            .tick_strings(&["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"]),
    );
    spinner.set_message("Submitting open_dispute transaction...");
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
    println!("{}", "  Dispute opened successfully!".green().bold());
    println!();
    println!("  {:<20} {}", "Dispute PDA:".bold(), dispute_pda);
    println!("  {:<20} {}", "Agent:".bold(), format_pubkey(&agent));
    println!(
        "  {:<20} {}",
        "Target Hand:".bold(),
        format_pubkey(&target_hand)
    );
    println!(
        "  {:<20} {}",
        "Stake:".bold(),
        format_lamports(stake_lamports)
    );
    println!("  {:<20} {}", "Evidence:".bold(), args.evidence_uri);
    println!("  {:<20} {}", "Signature:".bold(), sig);
    println!();

    Ok(())
}
