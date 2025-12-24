use clap::Args;
use colored::Colorize;
use solana_client::rpc_client::RpcClient;
use solana_sdk::{pubkey::Pubkey, signer::Signer};

use crate::config::{load_config, load_keypair};
use crate::display::{
    deserialize_delegation, deserialize_hand, deserialize_reputation, format_pubkey,
    print_delegation, print_hand_status, print_reputation,
};

/// Show current Hand status for a wallet
#[derive(Args)]
pub struct StatusArgs {
    /// Wallet pubkey (defaults to config keypair)
    #[arg(long)]
    wallet: Option<String>,
}

pub async fn handle(args: StatusArgs) -> Result<(), Box<dyn std::error::Error>> {
    let config = load_config()?;
    let rpc = RpcClient::new(&config.rpc_url);
    let registry_id = config.program_ids.hand_registry_pubkey()?;
    let delegation_id = config.program_ids.delegation_pubkey()?;
    let reputation_id = config.program_ids.reputation_pubkey()?;

    let wallet: Pubkey = match &args.wallet {
        Some(w) => w
            .parse()
            .map_err(|e| format!("Invalid wallet pubkey '{}': {}", w, e))?,
        None => {
            let keypair = load_keypair(&config)?;
            keypair.pubkey()
        }
    };

    println!();
    println!(
        "  {} {}",
        "Fetching status for:".bold(),
        format_pubkey(&wallet)
    );

    // 1. Derive and fetch Hand account
    let (hand_pda, _) =
        Pubkey::find_program_address(&[b"hand", wallet.as_ref()], &registry_id);

    let hand_acct = rpc.get_account(&hand_pda);
    match hand_acct {
        Ok(acct) => {
            match deserialize_hand(&acct.data) {
                Ok(hand) => {
                    print_hand_status(&hand, &hand_pda);

                    // 2. Find all delegations for this hand by scanning program accounts
                    //    Filter: discriminator at offset 0 and hand pubkey at offset 8
                    let disc = crate::display::anchor_discriminator("Delegation");
                    let del_accounts = rpc.get_program_accounts_with_config(
                        &delegation_id,
                        solana_client::rpc_config::RpcProgramAccountsConfig {
                            filters: Some(vec![
                                solana_client::rpc_filter::RpcFilterType::Memcmp(
                                    solana_client::rpc_filter::Memcmp::new_base58_encoded(
                                        0,
                                        &disc,
                                    ),
                                ),
                                solana_client::rpc_filter::RpcFilterType::Memcmp(
                                    solana_client::rpc_filter::Memcmp::new_base58_encoded(
                                        8,
                                        &hand_pda.to_bytes(),
                                    ),
                                ),
                            ]),
                            account_config:
                                solana_client::rpc_config::RpcAccountInfoConfig {
                                    commitment: Some(
                                        solana_sdk::commitment_config::CommitmentConfig::confirmed(),
                                    ),
                                    ..Default::default()
                                },
                            with_context: None,
                        },
                    );

                    match del_accounts {
                        Ok(accounts) => {
                            if accounts.is_empty() {
                                println!();
                                println!("  {}", "No active delegations found.".dimmed());
                            } else {
                                println!();
                                println!(
                                    "  {} {}",
                                    "Delegations:".bold(),
                                    accounts.len()
                                );
                                for (pda, acct) in &accounts {
                                    if let Ok(del) = deserialize_delegation(&acct.data) {
                                        print_delegation(&del, pda);
                                    }
                                }
                            }
                        }
                        Err(_) => {
                            println!();
                            println!(
                                "  {}",
                                "Could not fetch delegations (RPC may not support getProgramAccounts)"
                                    .yellow()
                            );
                        }
                    }

                    // 3. Fetch reputation
                    let (rep_pda, _) = Pubkey::find_program_address(
                        &[b"reputation", hand_pda.as_ref()],
                        &reputation_id,
                    );
                    match rpc.get_account(&rep_pda) {
                        Ok(r_acct) => {
                            if let Ok(rep) = deserialize_reputation(&r_acct.data) {
                                print_reputation(&rep, &rep_pda);
                            }
                        }
                        Err(_) => {
                            println!();
                            println!("  {}", "No reputation record found.".dimmed());
                        }
                    }
                }
                Err(e) => {
                    println!();
                    println!(
                        "  {} {}",
                        "Failed to deserialize Hand account:".red(),
                        e
                    );
                }
            }
        }
        Err(_) => {
            println!();
            println!(
                "  {} {}",
                "No Hand identity found for wallet".red().bold(),
                format_pubkey(&wallet)
            );
            println!(
                "  {}",
                "Run `hand mint --proof-file <path>` to create one.".dimmed()
            );
        }
    }

    println!();
    Ok(())
}
