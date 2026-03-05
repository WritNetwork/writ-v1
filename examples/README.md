# HAND Protocol Examples

Standalone scripts demonstrating the core flows of the HAND Protocol.

## Prerequisites

- Node.js >= 18
- A funded Solana devnet wallet at `~/.config/solana/id.json`
- HAND Protocol programs deployed to devnet (or localnet via `anchor localnet`)

Install dependencies:

```bash
yarn install
```

## Examples

### `mint-hand.ts`

Mint a new HAND identity by submitting a ZK proof of humanity. Walks through keypair loading, PDA derivation, proof generation, transaction submission, and on-chain verification.

```bash
npx ts-node examples/mint-hand.ts
```

### `delegate-agent.ts`

Delegate a verified HAND to a trading bot with scoped permissions. Demonstrates creating a delegation restricted to Jupiter swaps, with a 2 SOL per-tx limit, 50 SOL lifetime budget, and 72-hour expiry.

```bash
npx ts-node examples/delegate-agent.ts
```

### `verify-agent.ts`

Verify whether an agent wallet has a valid HAND delegation. Checks the full chain: Hand existence + active status, delegation existence + active + not expired + budget remaining, and reputation score against a threshold.

```bash
npx ts-node examples/verify-agent.ts <agent-pubkey> <hand-owner-pubkey>
```

### `integrate-gate.ts`

Reference for integrating the HAND gate into your own Solana program. Contains:

- **Rust CPI pattern**: The `#[derive(Accounts)]` struct and `handler` showing how to CPI into `hand_gate::verify_agent` from your instruction.
- **TypeScript client**: How to pass the HAND-related accounts when calling your gated instruction.

This is not a runnable script — it's a code reference.

### `sdk-quickstart.ts`

High-level SDK usage showing the `HandProtocol` class API. Demonstrates PDA derivation, account fetching, and full agent verification in a single script.

```bash
npx ts-node examples/sdk-quickstart.ts
```

## Account Flow

```
Human Wallet
    │
    ├─ initialize_hand() ──► Hand PDA (verified identity)
    │                              │
    │                              ├─ delegate() ──► Delegation PDA (scoped permissions)
    │                              │                        │
    │                              │                        └─ Agent Wallet (bot)
    │                              │
    │                              └─ initialize_reputation() ──► Reputation PDA (score + history)
    │
    └─ NullifierRecord PDA (prevents double-registration)
```

## Program IDs

All program IDs in these examples are set to `11111111111111111111111111111111` (placeholder). Replace them with the actual deployed program IDs for your environment.

| Program | Seed Prefixes |
|---------|---------------|
| `hand_registry` | `hand`, `nullifier` |
| `delegation` | `delegation` |
| `reputation` | `reputation`, `dispute`, `reporter` |
| `hand_gate` | (stateless verifier) |
