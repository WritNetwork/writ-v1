use clap::{Args, Subcommand};
use colored::Colorize;

use crate::config::{load_config, save_config, WritConfig};

/// Configure CLI settings
#[derive(Args)]
pub struct ConfigArgs {
    #[command(subcommand)]
    action: ConfigAction,
}

#[derive(Subcommand)]
enum ConfigAction {
    /// Set a configuration value
    Set {
        /// RPC URL (e.g. https://api.devnet.solana.com)
        #[arg(long)]
        rpc_url: Option<String>,

        /// Path to keypair JSON file
        #[arg(long)]
        keypair_path: Option<String>,

        /// Network name (devnet, testnet, mainnet-beta)
        #[arg(long)]
        network: Option<String>,
    },
    /// Display current configuration
    Show,
    /// Initialize config with defaults (overwrites existing)
    Init,
}

pub fn handle(args: ConfigArgs) -> Result<(), Box<dyn std::error::Error>> {
    match args.action {
        ConfigAction::Set {
            rpc_url,
            keypair_path,
            network,
        } => handle_set(rpc_url, keypair_path, network),
        ConfigAction::Show => handle_show(),
        ConfigAction::Init => handle_init(),
    }
}

fn handle_set(
    rpc_url: Option<String>,
    keypair_path: Option<String>,
    network: Option<String>,
) -> Result<(), Box<dyn std::error::Error>> {
    let mut config = load_config()?;
    let mut changed = false;

    if let Some(url) = rpc_url {
        config.rpc_url = url;
        changed = true;
    }

    if let Some(path) = keypair_path {
        config.keypair_path = path;
        changed = true;
    }

    if let Some(net) = network {
        // Also update rpc_url to match well-known networks
        match net.as_str() {
            "devnet" => {
                config.rpc_url = "https://api.devnet.solana.com".to_string();
            }
            "testnet" => {
                config.rpc_url = "https://api.testnet.solana.com".to_string();
            }
            "mainnet-beta" | "mainnet" => {
                config.rpc_url = "https://api.mainnet-beta.solana.com".to_string();
            }
            "localhost" | "local" => {
                config.rpc_url = "http://127.0.0.1:8899".to_string();
            }
            _ => {
                // Custom network name — keep existing rpc_url
            }
        }
        config.network = net;
        changed = true;
    }

    if changed {
        save_config(&config)?;
        println!();
        println!("{}", "  Configuration updated.".green().bold());
        print_config(&config);
    } else {
        println!();
        println!(
            "  {}",
            "No changes specified. Use --rpc-url, --keypair-path, or --network."
                .yellow()
        );
    }

    Ok(())
}

fn handle_show() -> Result<(), Box<dyn std::error::Error>> {
    let config = load_config()?;
    print_config(&config);
    Ok(())
}

fn handle_init() -> Result<(), Box<dyn std::error::Error>> {
    let config = WritConfig::default();
    save_config(&config)?;
    println!();
    println!(
        "{}",
        "  Configuration initialized with defaults.".green().bold()
    );
    print_config(&config);
    Ok(())
}

fn print_config(config: &WritConfig) {
    println!();
    println!("{}", "  ┌─────────────────────────────────────────────┐".cyan());
    println!(
        "{}  {}  {}",
        "  │".cyan(),
        "HAND CLI Configuration".bold().white(),
        "│".cyan()
    );
    println!("{}", "  ├─────────────────────────────────────────────┤".cyan());
    println!(
        "{}  {:<18} {}",
        "  │".cyan(),
        "Network:".bold(),
        config.network
    );
    println!(
        "{}  {:<18} {}",
        "  │".cyan(),
        "RPC URL:".bold(),
        config.rpc_url
    );
    println!(
        "{}  {:<18} {}",
        "  │".cyan(),
        "Keypair:".bold(),
        config.keypair_path
    );
    println!("{}", "  ├─────────────────────────────────────────────┤".cyan());
    println!(
        "{}  {}",
        "  │".cyan(),
        "Program IDs:".bold()
    );
    println!(
        "{}    {:<16} {}",
        "  │".cyan(),
        "Registry:".dimmed(),
        config.program_ids.writ_registry
    );
    println!(
        "{}    {:<16} {}",
        "  │".cyan(),
        "Delegation:".dimmed(),
        config.program_ids.delegation
    );
    println!(
        "{}    {:<16} {}",
        "  │".cyan(),
        "Reputation:".dimmed(),
        config.program_ids.reputation
    );
    println!(
        "{}    {:<16} {}",
        "  │".cyan(),
        "Hand Gate:".dimmed(),
        config.program_ids.writ_gate
    );
    println!("{}", "  └─────────────────────────────────────────────┘".cyan());
    println!();
}
