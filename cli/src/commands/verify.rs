use clap::Args;
use solana_client::rpc_client::RpcClient;
use solana_sdk::pubkey::Pubkey;

use crate::config::load_config;
use crate::display::{
    deserialize_delegation, deserialize_hand, deserialize_reputation, print_verify_result,
};

/// Verify an agent's Hand status
#[derive(Args)]
pub struct VerifyArgs {
    /// Agent wallet pubkey to verify
    #[arg(long)]
    agent: String,

    /// Minimum reputation score required (optional)
    #[arg(long)]
    min_reputation: Option<u32>,
}

pub async fn handle(args: VerifyArgs) -> Result<(), Box<dyn std::error::Error>> {
    let config = load_config()?;
    let rpc = RpcClient::new(&config.rpc_url);
    let delegation_id = config.program_ids.delegation_pubkey()?;
    let registry_id = config.program_ids.hand_registry_pubkey()?;
    let reputation_id = config.program_ids.reputation_pubkey()?;

    let agent: Pubkey = args
        .agent
        .parse()
        .map_err(|e| format!("Invalid agent pubkey '{}': {}", args.agent, e))?;

    // To find the delegation for this agent, we need to scan program accounts
    // with the delegation program, looking for one where agent field matches.
    // Alternatively, if we know the delegator, we can derive directly.
    // Since verify is agent-centric, we scan with a memcmp filter on the agent field.
    // Agent pubkey starts at offset 8 (discriminator) + 32 (hand) = 40.
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
    );

    let mut delegation: Option<DelegationData> = None;
    let mut hand: Option<HandData> = None;
    let mut reputation: Option<ReputationData> = None;

    // Try to find an active delegation for this agent
    if let Ok(accounts) = &delegation_accounts {
        for (_, acct) in accounts {
            if let Ok(del) = deserialize_delegation(&acct.data) {
                if del.agent == agent && del.active {
                    // Found active delegation — now look up the Hand and Reputation
                    let hand_acct = rpc.get_account(&del.hand);
                    if let Ok(h_acct) = hand_acct {
                        if let Ok(h) = deserialize_hand(&h_acct.data) {
                            // Derive reputation PDA from the hand PDA
                            let (rep_pda, _) = Pubkey::find_program_address(
                                &[b"reputation", del.hand.as_ref()],
                                &reputation_id,
                            );
                            let rep_acct = rpc.get_account(&rep_pda);
                            if let Ok(r_acct) = rep_acct {
                                reputation = deserialize_reputation(&r_acct.data).ok();
                            }
                            hand = Some(h);
                        }
                    }
                    delegation = Some(del);
                    break;
                }
            }
        }
    }

    // If memcmp filter fails (e.g. RPC doesn't support getProgramAccounts), fall back
    // to an error message.
    if delegation_accounts.is_err() && delegation.is_none() {
        // Try the simple approach: check if the agent itself has a hand
        let (hand_pda, _) =
            Pubkey::find_program_address(&[b"hand", agent.as_ref()], &registry_id);
        let hand_acct = rpc.get_account(&hand_pda);
        if let Ok(h_acct) = hand_acct {
            hand = deserialize_hand(&h_acct.data).ok();

            let (rep_pda, _) =
                Pubkey::find_program_address(&[b"reputation", hand_pda.as_ref()], &reputation_id);
            if let Ok(r_acct) = rpc.get_account(&rep_pda) {
                reputation = deserialize_reputation(&r_acct.data).ok();
            }
        }
    }

    print_verify_result(
        &agent,
        delegation.as_ref(),
        hand.as_ref(),
        reputation.as_ref(),
        args.min_reputation,
    );

    Ok(())
}
