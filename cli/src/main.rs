use clap::{Parser, Subcommand};

mod commands;
mod config;
mod display;

use commands::{
    config_cmd, delegate, dispute, mint, reputation, revoke, status, verify,
};

/// HAND Protocol CLI - Anonymous KYA on Solana — Anonymous KYA (Know Your Agent) on Solana
#[derive(Parser)]
#[command(name = "hand", version, about, long_about = None)]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    /// Mint a new Hand SBT (requires ZK proof)
    Mint(mint::MintArgs),
    /// Delegate Hand to an AI agent
    Delegate(delegate::DelegateArgs),
    /// Revoke a delegation
    Revoke(revoke::RevokeArgs),
    /// Verify an agent's Hand status
    Verify(verify::VerifyArgs),
    /// View reputation for a Hand
    Reputation(reputation::ReputationArgs),
    /// Open a dispute against an agent
    Dispute(dispute::DisputeArgs),
    /// Show current Hand status for a wallet
    Status(status::StatusArgs),
    /// Configure CLI settings
    Config(config_cmd::ConfigArgs),
}

#[tokio::main]
async fn main() {
    let cli = Cli::parse();

    let result = match cli.command {
        Commands::Mint(args) => mint::handle(args).await,
        Commands::Delegate(args) => delegate::handle(args).await,
        Commands::Revoke(args) => revoke::handle(args).await,
        Commands::Verify(args) => verify::handle(args).await,
        Commands::Reputation(args) => reputation::handle(args).await,
        Commands::Dispute(args) => dispute::handle(args).await,
        Commands::Status(args) => status::handle(args).await,
        Commands::Config(args) => config_cmd::handle(args),
    };

    if let Err(e) = result {
        eprintln!("{} {}", colored::Colorize::red("error:"), e);
        std::process::exit(1);
    }
}
