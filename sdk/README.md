# @hand-protocol/sdk

TypeScript SDK for HAND Protocol — anonymous KYA (Know Your Agent) on Solana.

## Installation

```bash
git clone https://github.com/hand-protocol/hand.git
cd hand/sdk
npm install
npm run build
```

## Quick Start

```typescript
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import BN from "bn.js";
import {
  HandProtocol,
  parseActions,
  parseDuration,
  solToLamports,
} from "@hand-protocol/sdk";

const connection = new Connection("https://api.mainnet-beta.solana.com");
const hand = new HandProtocol(connection, {
  handRegistry: new PublicKey("HANDreg..."),
  delegation: new PublicKey("HANDdel..."),
  reputation: new PublicKey("HANDrep..."),
  handGate: new PublicKey("HANDgate..."),
});

// 1. Mint a HAND identity
const owner = Keypair.generate();
const nullifier = Buffer.alloc(32); // from ZK circuit
const proof = Buffer.alloc(64);     // from ZK prover

await hand.mintHand({ nullifier, proof }, owner);

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

### HandProtocol

| Method | Params | Returns |
|---|---|---|
| `mintHand` | `MintHandParams, Keypair` | `TransactionSignature` |
| `getHand` | `PublicKey` | `HandAccount \| null` |
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
| `findHandPda(authority, programId)` | `["hand", authority]` |
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
HandAccount { authority, nullifier, mint, verifiedAt, delegationsCount, active, bump }
DelegationAccount { hand, agent, scope, delegatedAt, lastConsumedAt, active, bump }
DelegationScope { allowedPrograms, maxLamportsPerTx, maxLamportsTotal, spentLamports, expiresAt, allowedActions }
ReputationAccount { hand, totalActions, successfulActions, totalVolumeLamports, disputesReceived, disputesLost, score, lastUpdated, createdAt, bump }
DisputeAccount { agent, challenger, hand, evidenceUri, stakeLamports, status, createdAt, resolvedAt, bump }
ReporterAccount { programId, authorizedBy, reportsSubmitted, registeredAt, active, bump }
VerifyResult { isValid, handKey, reputationScore, delegatedAt, expiresAt, allowedActions }
DisputeStatus { Pending, Upheld, Rejected }
```

### Error Classes

All extend `HandProtocolError`:

- `HandNotFoundError`
- `DelegationNotFoundError`
- `ReputationNotFoundError`
- `InvalidProofError`
- `AgentNotVerifiedError`
- `DelegationExpiredError`
- `InsufficientReputationError`

## License

MIT
