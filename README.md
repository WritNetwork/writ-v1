<p align="center">
  <img src="banner.png" alt="HAND Protocol" width="100%" />
</p>

<p align="center">
  <a href="https://github.com/hand-protocol/hand/actions/workflows/ci.yml">
    <img src="https://img.shields.io/github/actions/workflow/status/hand-protocol/hand/ci.yml?branch=main&style=flat-square&label=CI&color=00ff41" alt="CI" />
  </a>
  <a href="https://github.com/hand-protocol/hand/releases">
    <img src="https://img.shields.io/github/v/release/hand-protocol/hand?style=flat-square&color=00ff41" alt="Release" />
  </a>
  <a href="LICENSE">
    <img src="https://img.shields.io/github/license/hand-protocol/hand?style=flat-square&color=00ff41" alt="License" />
  </a>
  <a href="https://github.com/hand-protocol/hand/commits/main">
    <img src="https://img.shields.io/github/last-commit/hand-protocol/hand?style=flat-square&color=00ff41" alt="Last Commit" />
  </a>
  <a href="https://github.com/hand-protocol/hand">
    <img src="https://img.shields.io/github/stars/hand-protocol/hand?style=flat-square&color=00ff41" alt="Stars" />
  </a>
  <a href="https://github.com/hand-protocol/hand/issues">
    <img src="https://img.shields.io/github/issues/hand-protocol/hand?style=flat-square&color=ff6600" alt="Issues" />
  </a>
</p>

<p align="center">
  Anonymous KYA (Know Your Agent) protocol on Solana.
  ZK human verification. Scoped agent delegation. On-chain reputation.
</p>

---

HAND Protocol gives AI agents a verifiable link to their human operator without exposing who that human is. It combines zero-knowledge identity proofs, programmable delegation scopes, and a behavior-based reputation engine into a single composable stack that any Solana program can gate against in one CPI call.

Built with Rust, Anchor 0.30, ark-bn254, and TypeScript.

## Features

| Component | Description | Status |
|---|---|---|
| Hand Registry | ZK Groth16 human verification with nullifier-based sybil prevention | Stable |
| Delegation | Scoped permission transfer with per-tx/lifetime budgets and expiry | Stable |
| Reputation | On-chain scoring from reported actions with stake-based disputes | Stable |
| Hand Gate | CPI interface for external programs to verify agents in one call | Stable |
| TypeScript SDK | Full client library for all protocol operations | Stable |
| CLI | Command-line tool for minting, delegating, verifying, and disputes | Stable |

## Architecture

```
Layer 4: Hand Gate        External programs verify agents via CPI
Layer 3: Reputation       Tracks agent behavior, scores, disputes
Layer 2: Delegation       Scoped permission transfer from human to agent
Layer 1: Hand Registry    ZK-based anonymous human verification
```

```
                    +------------------+
                    |    Hand Gate     |  <-- external programs call via CPI
                    +---+---------+----+
                        |         |
          +-------------+    +----+-----------+
          v                  v                v
+------------------+  +------------------+  +------------------+
|  Hand Registry   |  |   Delegation     |  |   Reputation     |
|                  |  |                  |  |                  |
|  ZK Verify       |  |  Scoped Perms    |  |  Score + Dispute |
|  SBT Mint        |  |  Budget Tracking |  |  Reporter System |
+------------------+  +------------------+  +------------------+
```

## How It Works

1. A human proves their identity through a ZK proof (no biometric data, no personal information on-chain)
2. The protocol mints a non-transferable Hand SBT to their wallet
3. The human delegates their Hand to AI agents with scoped permissions
4. Other programs verify agents via Hand Gate CPI before allowing actions

No biometric scanners. No cameras. No hardware. A nullifier is the only artifact stored on-chain, and it cannot be reversed to identify the human.

## Performance

| Operation | Compute Units | Latency |
|---|---|---|
| Mint Hand (with ZK verify) | ~120,000 | ~400ms |
| Create Delegation | ~25,000 | ~400ms |
| Consume (budget check) | ~15,000 | ~400ms |
| Verify Agent (CPI) | ~8,000 | ~400ms |
| Report Action | ~12,000 | ~400ms |
| Open Dispute | ~20,000 | ~400ms |

All operations fit within Solana's default 200,000 CU limit per instruction.

## Build

```bash
git clone https://github.com/hand-protocol/hand.git
cd hand
cargo check --workspace
```

SDK:

```bash
cd sdk
npm install
npm run build
```

CLI:

```bash
cargo build --release -p hand-cli
./target/release/hand --help
```

## Quick Start

### Mint a Hand (CLI)

```bash
hand mint --proof-file proof.json
# Output: Hand minted at 7xKq...3nF
```

### Delegate to an Agent (CLI)

```bash
hand delegate \
  --agent BotW...5kP \
  --programs JUP4...QJ1 \
  --max-sol-per-tx 2 \
  --max-sol-total 50 \
  --expires 72h \
  --actions swap
# Output: Delegation created for agent BotW...5kP
```

### Verify an Agent (SDK)

```typescript
import { HandProtocol } from "@hand-protocol/sdk";
import { Connection, PublicKey } from "@solana/web3.js";

const connection = new Connection("https://api.devnet.solana.com");
const hand = new HandProtocol(connection, {
  handRegistry: new PublicKey("11111111111111111111111111111111"),
  delegation: new PublicKey("11111111111111111111111111111111"),
  reputation: new PublicKey("11111111111111111111111111111111"),
  handGate: new PublicKey("11111111111111111111111111111111"),
});

const result = await hand.verifyAgent(agentPublicKey);
// { isValid: true, handKey: "7xKq...", reputationScore: 8200, delegatedAt: 1713024000, expiresAt: 1713283200, allowedActions: 1 }
```

### Gate Your Program (Rust CPI)

```rust
use hand_gate::cpi::accounts::VerifyAgentAccounts;
use hand_gate::cpi::verify_agent;

pub fn protected_action(ctx: Context<ProtectedAction>) -> Result<()> {
    let cpi_ctx = CpiContext::new(
        ctx.accounts.hand_gate_program.to_account_info(),
        VerifyAgentAccounts {
            delegation: ctx.accounts.delegation.to_account_info(),
            hand: ctx.accounts.hand.to_account_info(),
            clock: ctx.accounts.clock.to_account_info(),
        },
    );
    verify_agent(cpi_ctx, ctx.accounts.agent.key())?;

    // Agent verified. Proceed with business logic.
    Ok(())
}
```

## Delegation Scope

| Field | Type | Purpose |
|---|---|---|
| allowed_programs | Vec\<Pubkey\> | Whitelist of programs. Empty = no restriction. |
| max_lamports_per_tx | u64 | Per-transaction spending cap |
| max_lamports_total | u64 | Lifetime spending cap |
| expires_at | i64 | Unix timestamp. 0 = no expiry. |
| allowed_actions | u16 | Bitflags: SWAP=1, STAKE=2, TRANSFER=4, VOTE=8, MINT=16 |

## Reputation Scoring

```
base       = (successful_actions / total_actions) * 10000
penalty    = disputes_lost * 500
age_bonus  = min(days_active * 10, 1000)
score      = clamp(base - penalty + age_bonus, 0, 10000)
```

Other programs can gate on reputation:

```rust
#[hand_gated(min_reputation = 5000)]
pub fn quality_gate(ctx: Context<X>) -> Result<()> { ... }
```

## Risk Assessment

| Threat | Mitigation | Residual Risk |
|---|---|---|
| Bought social accounts | Account age + follower threshold filters 90%+ | Low |
| Nullifier rainbow attack | Poseidon hash with user secret prevents precomputation | Negligible |
| Agent exceeds scope | On-chain budget enforcement via consume() | None (enforced) |
| Malicious agent behavior | Stake-based dispute system with reputation penalty | Medium |
| Verification key compromise | Trusted setup ceremony; key embedded in program binary | Low |

## Project Structure

```
hand-protocol/
  programs/
    hand-registry/       ZK verification + SBT minting
      instructions/      initialize_hand, revoke_hand
      state/             Hand, NullifierRecord, verifier
    delegation/          Scoped permission delegation
      instructions/      delegate, update_scope, revoke_delegation, consume
      state/             Delegation, DelegationScope
    reputation/          Behavior tracking + disputes
      instructions/      initialize, report_action, register_reporter, dispute, recalculate
      state/             Reputation, Dispute, Reporter
    hand-gate/           CPI verification interface
      instructions/      verify_agent, verify_with_reputation, verify_with_scope
      state/             VerifyResult
  sdk/                   TypeScript client library
    src/                 client, types, pda, serialization, utils, errors
  cli/                   Rust command-line tool
    src/commands/        mint, delegate, revoke, verify, reputation, dispute, status, config
  tests/                 Anchor integration tests
  examples/              Usage examples (mint, delegate, verify, gate integration, SDK quickstart)
  docs/                  Architecture, ZK verification, delegation scopes, integration guide
  idl/                   Anchor IDL JSON for all 4 programs
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup, code style, and PR guidelines.

## License

[MIT](LICENSE)

## Links

- Website: https://handprotocol.xyz
- X: @handprotocol
- GitHub: https://github.com/hand-protocol/hand
- Docs: https://handprotocol.xyz/docs
