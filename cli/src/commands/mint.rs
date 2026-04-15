use std::path::PathBuf;

use clap::Args;
use colored::Colorize;
use indicatif::{ProgressBar, ProgressStyle};
use serde::Deserialize;
use solana_client::rpc_client::RpcClient;
use solana_sdk::{
    instruction::{AccountMeta, Instruction},
    pubkey::Pubkey,
    signer::Signer,
    system_program,
    sysvar,
    transaction::Transaction,
};

use crate::config::{load_config, load_keypair};

/// Mint a new Hand SBT (requires ZK proof)
#[derive(Args)]
pub struct MintArgs {
    /// Path to JSON proof file containing proof_a, proof_b, proof_c, public_signals, nullifier
    #[arg(long, value_name = "FILE")]
    proof_file: PathBuf,
}

#[derive(Deserialize)]
struct ProofFile {
    proof_a: Vec<u8>,
    proof_b: Vec<u8>,
    proof_c: Vec<u8>,
    public_signals: Vec<String>,
    nullifier: String,
}

pub async fn handle(args: MintArgs) -> Result<(), Box<dyn std::error::Error>> {
    let config = load_config()?;
    let keypair = load_keypair(&config)?;
    let rpc = RpcClient::new(&config.rpc_url);
    let registry_id = config.program_ids.writ_registry_pubkey()?;

    // Read and parse proof file
    let proof_json = std::fs::read_to_string(&args.proof_file).map_err(|e| {
        format!(
            "Failed to read proof file '{}': {}",
            args.proof_file.display(),
            e
        )
    })?;
    let proof: ProofFile = serde_json::from_str(&proof_json)
        .map_err(|e| format!("Failed to parse proof JSON: {}", e))?;

    // Decode nullifier from base58
    let nullifier_bytes = bs58::decode(&proof.nullifier)
        .into_vec()
        .map_err(|e| format!("Invalid nullifier base58: {}", e))?;
    if nullifier_bytes.len() != 32 {
        return Err("Nullifier must be exactly 32 bytes".into());
    }
    let mut nullifier = [0u8; 32];
    nullifier.copy_from_slice(&nullifier_bytes);

    // Decode public signals from hex strings -> [u8; 32] each
    let public_signals: Vec<[u8; 32]> = proof
        .public_signals
        .iter()
        .map(|s| {
            let bytes = bs58::decode(s)
                .into_vec()
                .map_err(|e| format!("Invalid public_signal base58 '{}': {}", s, e))?;
            if bytes.len() != 32 {
                return Err(format!(
                    "Public signal must be 32 bytes, got {}",
                    bytes.len()
                ));
            }
            let mut arr = [0u8; 32];
            arr.copy_from_slice(&bytes);
            Ok(arr)
        })
        .collect::<Result<Vec<_>, _>>()?;

    // Derive PDAs
    let (hand_pda, _hand_bump) =
        Pubkey::find_program_address(&[b"hand", keypair.pubkey().as_ref()], &registry_id);

    let (nullifier_pda, _null_bump) =
        Pubkey::find_program_address(&[b"nullifier", &nullifier], &registry_id);

    // Build instruction data: 8-byte discriminator + borsh-serialized args.
    // Anchor uses sighash("global:<method_name>") = sha256("global:initialize_hand")[..8].
    let ix_disc = {
        use sha2::{Digest, Sha256};
        let mut hasher = Sha256::new();
        hasher.update(b"global:initialize_hand");
        let hash = hasher.finalize();
        let mut d = [0u8; 8];
        d.copy_from_slice(&hash[..8]);
        d
    };

    let mut ix_data = Vec::new();
    ix_data.extend_from_slice(&ix_disc);

    // Borsh serialization: Vec<u8> = 4-byte len + bytes
    ix_data.extend_from_slice(&(proof.proof_a.len() as u32).to_le_bytes());
    ix_data.extend_from_slice(&proof.proof_a);

    ix_data.extend_from_slice(&(proof.proof_b.len() as u32).to_le_bytes());
    ix_data.extend_from_slice(&proof.proof_b);

    ix_data.extend_from_slice(&(proof.proof_c.len() as u32).to_le_bytes());
    ix_data.extend_from_slice(&proof.proof_c);

    // Vec<[u8; 32]> = 4-byte len + N * 32
    ix_data.extend_from_slice(&(public_signals.len() as u32).to_le_bytes());
    for sig in &public_signals {
        ix_data.extend_from_slice(sig);
    }

    // [u8; 32] nullifier — fixed size, no length prefix
    ix_data.extend_from_slice(&nullifier);

    let ix = Instruction {
        program_id: registry_id,
        accounts: vec![
            AccountMeta::new(keypair.pubkey(), true),  // authority / payer
            AccountMeta::new(hand_pda, false),          // hand PDA (init)
            AccountMeta::new(nullifier_pda, false),     // nullifier record (init)
            AccountMeta::new_readonly(system_program::id(), false),
            AccountMeta::new_readonly(sysvar::rent::id(), false),
        ],
        data: ix_data,
    };

    // Send transaction
    let spinner = ProgressBar::new_spinner();
    spinner.set_style(
        ProgressStyle::with_template("{spinner:.cyan} {msg}")
            .unwrap()
            .tick_strings(&["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"]),
    );
    spinner.set_message("Submitting initialize_hand transaction...");
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
    println!("{}", "  Hand SBT minted successfully!".green().bold());
    println!();
    println!("  {:<16} {}", "Hand PDA:".bold(), hand_pda);
    println!("  {:<16} {}", "Authority:".bold(), keypair.pubkey());
    println!("  {:<16} {}", "Nullifier PDA:".bold(), nullifier_pda);
    println!("  {:<16} {}", "Signature:".bold(), sig);
    println!("  {:<16} {}", "Network:".bold(), config.network);
    println!();

    Ok(())
}

// Proof file must contain valid JSON with proof_a, proof_b, proof_c, public_signals, nullifier
