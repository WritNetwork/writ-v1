# @writnetwork/sdk

TypeScript SDK for WRIT Protocol — anonymous KYA (Know Your Agent) on Solana.

## Installation

```bash
git clone https://github.com/WritNetwork/writ.git
cd hand/sdk
npm install
npm run build
```

## Quick Start

```typescript
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import BN from "bn.js";
import {
  WritProtocol,
  parseActions,
  parseDuration,
  solToLamports,
} from "@writnetwork/sdk";

const connection = new Connection("https://api.mainnet-beta.solana.com");
const hand = new WritProtocol(connection, {
  writRegistry: new PublicKey("HANDreg..."),
  delegation: new PublicKey("HANDdel..."),
  reputation: new PublicKey("HANDrep..."),
  writGate: new PublicKey("HANDgate..."),
});

// 1. Mint a HAND identity
const owner = Keypair.generate();
const nullifier = Buffer.alloc(32); // from ZK circuit
const proof = Buffer.alloc(64);     // from ZK prover

await hand.mintWrit({ nullifier, proof }, owner);

// 2. Delegate to an AI agent
const agentKey = Keypair.generate().publicKey;
await hand.delegate(
  {
    agent: agentKey,
    allowedPrograms: [],
    maxLamportsPerTx: new BN(solToLamports(1).toString()),
    maxLamportsTotal: new BN(solToLamports(100).toString()),
    expiresAt: new BN(Math.floor(Date.now() / 1000) + parseDuration("7d")),
    allowedActions: parseActions(["swap", "stake"]),
  },
  owner,
);

// 3. Verify an agent (called by dApps / protocols)
const result = await hand.verifyAgent(agentKey);
console.log(result.isValid);          // true
console.log(result.reputationScore);  // 0..10000
console.log(result.allowedActions);   // bitflags
```

## API Reference

### WritProtocol

| Method | Params | Returns |
|---|---|---|
| `mintWrit` | `MintWritParams, Keypair` | `TransactionSignature` |
| `getHand` | `PublicKey` | `WritAccount \| null` |
| `hasHand` | `PublicKey` | `boolean` |
| `delegate` | `DelegateParams, Keypair` | `TransactionSignature` |
| `updateScope` | `UpdateScopeParams, Keypair` | `TransactionSignature` |
| `revokeDelegation` | `PublicKey, Keypair` | `TransactionSignature` |
| `getDelegation` | `PublicKey, PublicKey` | `DelegationAccount \| null` |
| `getDelegationsForHand` | `PublicKey` | `DelegationAccount[]` |
| `verifyAgent` | `PublicKey` | `VerifyResult` |
| `verifyAgentWithReputation` | `PublicKey, number` | `VerifyResult` |
| `verifyAgentWithScope` | `PublicKey, number, PublicKey, bigint` | `VerifyResult` |
| `getReputation` | `PublicKey` | `ReputationAccount \| null` |
| `initializeReputation` | `PublicKey, Keypair` | `TransactionSignature` |
| `openDispute` | `DisputeParams, Keypair` | `TransactionSignature` |
| `getDispute` | `PublicKey, PublicKey` | `DisputeAccount \| null` |

### PDA Helpers

| Function | Seeds |
|---|---|
| `findWritPda(authority, programId)` | `["hand", authority]` |
| `findNullifierPda(nullifier, programId)` | `["nullifier", nullifier]` |
| `findDelegationPda(hand, agent, programId)` | `["delegation", hand, agent]` |
| `findReputationPda(hand, programId)` | `["reputation", hand]` |
| `findReporterPda(reporter, programId)` | `["reporter", reporter]` |
| `findDisputePda(agent, challenger, programId)` | `["dispute", agent, challenger]` |

### Utilities

| Function | Description |
|---|---|
| `parseActions(["swap","stake"])` | Returns bitflag integer |
| `formatActions(3)` | Returns `["swap","stake"]` |
| `parseDuration("72h")` | Returns seconds |
| `lamportsToSol(bigint)` | Lamports to SOL |
| `solToLamports(number)` | SOL to lamports |
| `shortenPubkey(PublicKey)` | `"7xKq...3nF"` |
| `calculateReputationScore(rep)` | Matches on-chain formula |

### Types

```typescript
WritAccount { authority, nullifier, mint, verifiedAt, delegationsCount, active, bump }
DelegationAccount { hand, agent, scope, delegatedAt, lastConsumedAt, active, bump }
DelegationScope { allowedPrograms, maxLamportsPerTx, maxLamportsTotal, spentLamports, expiresAt, allowedActions }
ReputationAccount { hand, totalActions, successfulActions, totalVolumeLamports, disputesReceived, disputesLost, score, lastUpdated, createdAt, bump }
DisputeAccount { agent, challenger, hand, evidenceUri, stakeLamports, status, createdAt, resolvedAt, bump }
ReporterAccount { programId, authorizedBy, reportsSubmitted, registeredAt, active, bump }
VerifyResult { isValid, writKey, reputationScore, delegatedAt, expiresAt, allowedActions }
DisputeStatus { Pending, Upheld, Rejected }
```

### Error Classes

All extend `WritProtocolError`:

- `WritNotFoundError`
- `DelegationNotFoundError`
- `ReputationNotFoundError`
- `InvalidProofError`
- `AgentNotVerifiedError`
- `DelegationExpiredError`
- `InsufficientReputationError`

## License

MIT
