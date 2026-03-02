# Integration Guide

This guide covers how to integrate HAND Protocol into your Solana program to gate actions behind verified human identity.

## Overview

Integration consists of two parts:

1. On-chain: your program calls HAND's verification via CPI
2. Client-side: your frontend passes the required HAND accounts to transactions

## Quick Start (On-Chain)

### Step 1: Add Dependencies

In your program's `Cargo.toml`:

```toml
[dependencies]
hand_gate = { git = "https://github.com/hand-protocol/hand", features = ["cpi"] }
hand_registry = { git = "https://github.com/hand-protocol/hand", features = ["cpi"] }
delegation = { git = "https://github.com/hand-protocol/hand", features = ["cpi"] }
```

### Step 2: Add Accounts to Your Instruction

```rust
use hand_gate::program::HandGate;
use hand_registry::state::Hand;
use delegation::state::Delegation;

#[derive(Accounts)]
pub struct ProtectedAction<'info> {
    #[account(mut)]
    pub agent: Signer<'info>,

    /// The delegation PDA linking agent to a Hand
    #[account(
        seeds = [b"delegation", hand.key().as_ref(), agent.key().as_ref()],
        bump = delegation_account.bump,
        seeds::program = delegation_program.key(),
    )]
    pub delegation_account: Account<'info, Delegation>,

    /// The Hand PDA of the delegating human
    #[account(
        seeds = [b"hand", hand.authority.as_ref()],
        bump = hand.bump,
        seeds::program = hand_registry_program.key(),
    )]
    pub hand: Account<'info, Hand>,

    pub hand_registry_program: Program<'info, hand_registry::program::HandRegistry>,
    pub delegation_program: Program<'info, delegation::program::Delegation>,
    pub hand_gate_program: Program<'info, HandGate>,
}
```

### Step 3: Call Verification in Your Handler

```rust
pub fn protected_action(ctx: Context<ProtectedAction>) -> Result<()> {
    let hand = &ctx.accounts.hand;
    let delegation = &ctx.accounts.delegation_account;

    // Basic check: Hand is active and delegation is active
    require!(hand.active, MyError::HandNotActive);
    require!(delegation.active, MyError::DelegationNotActive);

    // Check delegation hasn't expired
    let now = Clock::get()?.unix_timestamp;
    if delegation.scope.expires_at > 0 {
        require!(now < delegation.scope.expires_at, MyError::DelegationExpired);
    }

    // Check the agent matches the delegation
    require!(
        delegation.agent == ctx.accounts.agent.key(),
        MyError::AgentMismatch
    );

    // Check the delegation belongs to this hand
    require!(
        delegation.hand == hand.key(),
        MyError::HandMismatch
    );

    // Your business logic here
    msg!("Action performed by verified agent");

    Ok(())
}
```

## Verification Levels

Choose the verification depth that matches your security requirements:

### Level 1: Hand Exists

Cheapest check. Just verify the agent has an active delegation to an active Hand.

```rust
require!(hand.active && delegation.active, MyError::NotVerified);
```

Use case: low-stakes actions, community access.

### Level 2: Reputation Threshold

Also check the Hand's reputation score meets a minimum.

```rust
let reputation = &ctx.accounts.reputation;
require!(reputation.score >= 5000, MyError::InsufficientReputation);
```

Use case: token launches, airdrops, premium features.

### Level 3: Scoped Verification

Full scope check including action type, program whitelist, and spending limits.

```rust
let scope = &delegation.scope;
require!(scope.allowed_actions & ACTION_SWAP != 0, MyError::ActionNotAllowed);

if !scope.allowed_programs.is_empty() {
    require!(
        scope.allowed_programs.contains(&ctx.program_id),
        MyError::ProgramNotAllowed
    );
}
```

Use case: DeFi protocols, custody systems, high-value operations.

## Client-Side Integration

### Using the TypeScript SDK

```typescript
import { HandProtocol } from "@hand-protocol/sdk";
import { Connection, PublicKey } from "@solana/web3.js";

const hand = new HandProtocol(connection, programIds);

// Before submitting a protected transaction, verify the agent
const result = await hand.verifyAgent(agentPublicKey);

if (!result.isValid) {
  throw new Error("Agent does not have valid HAND delegation");
}

// Include HAND accounts in your transaction
const handPda = findHandPda(result.handKey, programIds.handRegistry);
const delegationPda = findDelegationPda(
  handPda[0],
  agentPublicKey,
  programIds.delegation
);
```

### Account Resolution

When building transactions that include HAND verification, you need to resolve three PDAs:

```typescript
import { findHandPda, findDelegationPda, findReputationPda } from "@hand-protocol/sdk";

// 1. Find the delegation for this agent
const [delegationPda] = findDelegationPda(handPda, agentPubkey, delegationProgramId);

// 2. Read the delegation to get the linked Hand
const delegationData = await hand.getDelegation(handPda, agentPubkey);

// 3. Find the reputation PDA if needed
const [reputationPda] = findReputationPda(handPda, reputationProgramId);
```

## Testing Your Integration

Use the devnet-deployed programs for testing:

```typescript
const connection = new Connection("https://api.devnet.solana.com");

// Create a test Hand
await hand.mintHand(mockProofParams, testKeypair);

// Create a test delegation
await hand.delegate({
  agent: botKeypair.publicKey,
  scope: {
    allowedPrograms: [],
    maxLamportsPerTx: 0,
    maxLamportsTotal: 0,
    expiresAt: 0,
    allowedActions: ACTION_ALL,
  },
}, testKeypair);

// Verify in your program's test
await yourProgram.methods
  .protectedAction()
  .accounts({
    agent: botKeypair.publicKey,
    delegationAccount: delegationPda,
    hand: handPda,
    // ... other accounts
  })
  .signers([botKeypair])
  .rpc();
```

## Compute Budget

Approximate compute unit costs for HAND verification:

| Operation | Compute Units |
|---|---|
| Read Hand PDA | ~1,500 |
| Read Delegation PDA | ~1,500 |
| Read Reputation PDA | ~1,500 |
| Scope validation | ~500 |
| Full verify_agent CPI | ~8,000 |

Total overhead for Level 3 verification: approximately 13,000 CU. Well within Solana's 200,000 CU default limit per instruction.

## Error Handling

HAND CPI calls return typed errors that you can match:

```rust
match result {
    Err(e) if e == HandGateError::DelegationNotActive.into() => {
        // Agent's delegation was revoked
    }
    Err(e) if e == HandGateError::HandNotActive.into() => {
        // The human behind this agent revoked their Hand
    }
    Err(e) if e == HandGateError::InsufficientReputation.into() => {
        // Agent's reputation below threshold
    }
    Err(e) => return Err(e),
    Ok(_) => { /* proceed */ }
}
```

## Migration from Agent Registry

If your program currently uses Solana Agent Registry, HAND can be added alongside:

```rust
// Check either Agent Registry OR HAND
let has_agent_registry = check_agent_registry(&ctx.accounts.agent_record);
let has_hand = check_hand_delegation(&ctx.accounts.delegation, &ctx.accounts.hand);

require!(has_agent_registry || has_hand, MyError::NotVerified);
```

This allows gradual migration without breaking existing integrations.
