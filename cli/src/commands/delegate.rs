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
use crate::display::{format_lamports, format_pubkey, parse_action_name, action_flags_to_names};

/// Delegate Hand to an AI agent
#[derive(Args)]
pub struct DelegateArgs {
    /// Agent wallet pubkey to delegate to
    #[arg(long)]
    agent: String,

    /// Allowed program pubkeys (comma-separated)
    #[arg(long, value_delimiter = ',')]
    programs: Option<Vec<String>>,

    /// Maximum SOL per transaction (e.g. 0.5)
    #[arg(long, default_value = "0.1")]
    max_sol_per_tx: f64,

    /// Maximum total SOL the agent can spend
    #[arg(long, default_value = "1.0")]
    max_sol_total: f64,

    /// Expiration duration (e.g. 72h, 7d, 30m)
    #[arg(long, default_value = "72h")]
    expires: String,

    /// Allowed actions (comma-separated: swap,stake,transfer,vote,mint)
    #[arg(long, default_value = "swap,transfer")]
    actions: String,
}

fn parse_duration(s: &str) -> Result<i64, String> {
    let s = s.trim();
    if s.is_empty() {
        return Err("Empty duration string".to_string());
    }

    let (num_str, unit) = if s.ends_with('d') {
        (&s[..s.len() - 1], 'd')
    } else if s.ends_with('h') {
        (&s[..s.len() - 1], 'h')
    } else if s.ends_with('m') {
        (&s[..s.len() - 1], 'm')
    } else if s.ends_with('s') {
        (&s[..s.len() - 1], 's')
    } else {
        return Err(format!(
            "Invalid duration '{}' — use a suffix: s, m, h, d",
            s
        ));
    };

    let num: u64 = num_str
        .parse()
        .map_err(|_| format!("Invalid number in duration '{}'", s))?;

    let seconds = match unit {
        's' => num,
        'm' => num * 60,
        'h' => num * 3600,
        'd' => num * 86400,
        _ => unreachable!(),
    };

    Ok(seconds as i64)
}

fn sol_to_lamports(sol: f64) -> u64 {
    (sol * 1_000_000_000.0) as u64
}

pub async fn handle(args: DelegateArgs) -> Result<(), Box<dyn std::error::Error>> {
    let config = load_config()?;
    let keypair = load_keypair(&config)?;
    let rpc = RpcClient::new(&config.rpc_url);
    let delegation_id = config.program_ids.delegation_pubkey()?;
    let registry_id = config.program_ids.hand_registry_pubkey()?;

    let agent: Pubkey = args
        .agent
        .parse()
        .map_err(|e| format!("Invalid agent pubkey '{}': {}", args.agent, e))?;

    // Parse allowed programs
    let allowed_programs: Vec<Pubkey> = match &args.programs {
        Some(list) => list
            .iter()
            .map(|s| {
                s.parse::<Pubkey>()
                    .map_err(|e| format!("Invalid program pubkey '{}': {}", s, e))
            })
            .collect::<Result<Vec<_>, _>>()?,
        None => vec![],
    };

    // Parse action flags
    let mut action_flags: u16 = 0;
    for name in args.actions.split(',') {
        let name = name.trim();
        if name.is_empty() {
            continue;
        }
        match parse_action_name(name) {
            Some(flag) => action_flags |= flag,
            None => return Err(format!("Unknown action '{}' — valid: swap, stake, transfer, vote, mint", name).into()),
        }
    }

    let max_sol_per_tx = sol_to_lamports(args.max_sol_per_tx);
    let max_sol_total = sol_to_lamports(args.max_sol_total);
    let duration_secs = parse_duration(&args.expires)?;

    // Derive PDAs
    let (hand_pda, _) =
        Pubkey::find_program_address(&[b"hand", keypair.pubkey().as_ref()], &registry_id);

    let (delegation_pda, _) = Pubkey::find_program_address(
        &[b"delegation", hand_pda.as_ref(), agent.as_ref()],
        &delegation_id,
    );

    // Build instruction data
    let ix_disc = {
        use sha2::{Digest, Sha256};
        let mut hasher = Sha256::new();
        hasher.update(b"global:delegate");
        let hash = hasher.finalize();
        let mut d = [0u8; 8];
        d.copy_from_slice(&hash[..8]);
        d
    };

    let mut ix_data = Vec::new();
    ix_data.extend_from_slice(&ix_disc);

    // Vec<Pubkey> allowed_programs
    ix_data.extend_from_slice(&(allowed_programs.len() as u32).to_le_bytes());
    for p in &allowed_programs {
        ix_data.extend_from_slice(p.as_ref());
    }

    // u16 allowed_actions
    ix_data.extend_from_slice(&action_flags.to_le_bytes());

    // u64 max_sol_per_tx
    ix_data.extend_from_slice(&max_sol_per_tx.to_le_bytes());

    // u64 max_sol_total
    ix_data.extend_from_slice(&max_sol_total.to_le_bytes());

    // i64 duration_seconds
    ix_data.extend_from_slice(&duration_secs.to_le_bytes());

    let ix = Instruction {
        program_id: delegation_id,
        accounts: vec![
            AccountMeta::new(keypair.pubkey(), true),   // authority / payer
            AccountMeta::new_readonly(hand_pda, false),  // hand account
            AccountMeta::new_readonly(agent, false),      // agent wallet
            AccountMeta::new(delegation_pda, false),      // delegation PDA (init)
            AccountMeta::new_readonly(system_program::id(), false),
        ],
        data: ix_data,
    };

    let spinner = ProgressBar::new_spinner();
    spinner.set_style(
        ProgressStyle::with_template("{spinner:.yellow} {msg}")
            .unwrap()
            .tick_strings(&["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"]),
    );
    spinner.set_message("Submitting delegate transaction...");
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

    let actions = action_flags_to_names(action_flags);
    println!();
    println!("{}", "  Delegation created successfully!".green().bold());
    println!();
    println!("  {:<20} {}", "Delegation PDA:".bold(), delegation_pda);
    println!("  {:<20} {}", "Hand:".bold(), format_pubkey(&hand_pda));
    println!("  {:<20} {}", "Agent:".bold(), agent);
    println!(
        "  {:<20} {}",
        "Actions:".bold(),
        actions.join(", ")
    );
    println!(
        "  {:<20} {}",
        "Max SOL/tx:".bold(),
        format_lamports(max_sol_per_tx)
    );
    println!(
        "  {:<20} {}",
        "Max SOL total:".bold(),
        format_lamports(max_sol_total)
    );
    println!("  {:<20} {}", "Expires in:".bold(), args.expires);
    println!("  {:<20} {}", "Signature:".bold(), sig);
    println!();

    Ok(())
}

// Agent must be a valid base58-encoded Solana public key
