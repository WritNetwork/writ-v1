# Architecture

HAND Protocol consists of four on-chain programs that form a layered identity and delegation stack for AI agents on Solana.

## Layer Diagram

```
Layer 4: Hand Gate        External programs verify agents via CPI
Layer 3: Reputation       Tracks agent behavior, scores, disputes
Layer 2: Delegation       Scoped permission transfer from human to agent
Layer 1: Hand Registry    ZK-based anonymous human verification
```

## Program Relationships

```
                    ┌──────────────┐
                    │  Hand Gate   │ ← External programs call via CPI
                    └──┬───┬───┬──┘
                       │   │   │
          ┌────────────┘   │   └────────────┐
          ▼                ▼                ▼
┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│  Hand        │  │  Delegation  │  │  Reputation   │
│  Registry    │  │              │  │               │
│              │◄─┤  reads Hand  │  │  reads Hand   │
│  ZK Verify   │  │  state       │  │  + Delegation │
│  SBT Mint    │  │              │  │  state        │
└──────────────┘  └──────────────┘  └───────────────┘
```

## Account Model

### Hand (Layer 1)
- PDA seeds: `["hand", authority_pubkey]`
- Stores: authority, nullifier hash, SBT mint, verification timestamp, delegation count
- One per wallet. Non-transferable.

### NullifierRecord (Layer 1)
- PDA seeds: `["nullifier", nullifier_bytes]`
- Prevents the same identity source from creating multiple Hands
- Only the nullifier hash is stored, original identity data never touches the chain

### Delegation (Layer 2)
- PDA seeds: `["delegation", hand_pubkey, agent_pubkey]`
- Links a Hand to an AI agent wallet with scoped permissions
- Scope includes: allowed programs, per-tx/total lamport budgets, expiry, action bitflags

### Reputation (Layer 3)
- PDA seeds: `["reputation", hand_pubkey]`
- Tracks: total actions, successful actions, volume, disputes, computed score
- Score range: 0 to 10,000

### Dispute (Layer 3)
- PDA seeds: `["dispute", agent_pubkey, challenger_pubkey]`
- Stake-based challenge system against agent behavior
- Resolution by protocol authority (v1), DAO governance (v2)

### Reporter (Layer 3)
- PDA seeds: `["reporter", reporter_program_pubkey]`
- Whitelisted programs authorized to submit action reports

## ZK Verification Flow

```
Browser                            Solana
┌───────────────────────┐          ┌───────────────────────┐
│ 1. X OAuth            │          │                       │
│ 2. Get account data   │          │                       │
│ 3. Feed to Circom     │   TX     │ 4. Groth16 verify()  │
│    circuit            │ ──────►  │ 5. Check nullifier    │
│ 3. Generate proof     │          │ 6. Mint Hand SBT      │
│    (WASM, in-browser) │          │ 7. Store nullifier    │
└───────────────────────┘          └───────────────────────┘
```

Private inputs (never leave browser): X account ID, creation date, follower count, user secret.

Public inputs (submitted on-chain): wallet pubkey, nullifier, current timestamp.

Constraints proven:
- Account age exceeds 6 months
- Follower count exceeds minimum threshold
- Nullifier correctly derived from account ID and secret
- Wallet pubkey matches transaction signer

## Delegation Scope Model

Scoped delegation replaces binary trust with granular permissions:

| Field | Type | Purpose |
|---|---|---|
| allowed_programs | Vec\<Pubkey\> | Empty = all. Otherwise whitelist. |
| max_lamports_per_tx | u64 | Per-transaction spending cap |
| max_lamports_total | u64 | Lifetime spending cap |
| spent_lamports | u64 | Running total, updated via consume() |
| expires_at | i64 | Unix timestamp. 0 = no expiry. |
| allowed_actions | u16 | Bitflags: SWAP=1, STAKE=2, TRANSFER=4, VOTE=8, MINT=16 |

## Reputation Scoring

```
base       = (successful_actions / total_actions) * 10000
penalty    = disputes_lost * 500
age_bonus  = min(days_active * 10, 1000)
score      = clamp(base - penalty + age_bonus, 0, 10000)
```

New hands start at 5000 (neutral). Score moves based on reported activity and dispute outcomes.

## Cross-Program Integration

External programs use Hand Gate via CPI:

```rust
use hand_gate::cpi::verify_agent;

// In your instruction handler:
let result = verify_agent(cpi_ctx, agent_pubkey)?;
require!(result.is_valid, MyError::AgentNotVerified);
```

The `#[hand_gated]` attribute macro (planned) will automate this pattern.
