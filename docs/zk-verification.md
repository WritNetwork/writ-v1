# ZK Verification

HAND Protocol uses Groth16 zero-knowledge proofs on the BN254 curve to verify human identity without exposing any identifying information on-chain.

## Why ZK

Traditional identity verification stores some form of identifying data on-chain (biometric hashes, account IDs, etc.). Even hashed identifiers are vulnerable to rainbow table attacks when the input space is small (e.g., numeric Twitter IDs).

HAND stores only a nullifier — a cryptographic commitment that prevents double-registration but reveals nothing about the underlying identity.

## Circuit Design

The Circom circuit `hand_verify.circom` enforces four constraints:

### Constraint 1: Account Age
```
signal input account_created_at;  // private
signal input current_timestamp;   // public

component ageCheck = GreaterThan(64);
ageCheck.in[0] <== current_timestamp - account_created_at;
ageCheck.in[1] <== MIN_ACCOUNT_AGE;
ageCheck.out === 1;
```

The prover demonstrates their identity source account was created more than 6 months ago without revealing the exact creation date.

### Constraint 2: Follower Threshold
```
signal input follower_count;  // private

component followerCheck = GreaterEqThan(32);
followerCheck.in[0] <== follower_count;
followerCheck.in[1] <== MIN_FOLLOWERS;
followerCheck.out === 1;
```

Proves the account has organic activity above a minimum threshold.

### Constraint 3: Nullifier Derivation
```
signal input account_id;     // private
signal input user_secret;    // private
signal output nullifier;     // public

component hasher = Poseidon(2);
hasher.inputs[0] <== account_id;
hasher.inputs[1] <== user_secret;
nullifier <== hasher.out;
```

The nullifier is deterministic for a given account but cannot be reversed to recover the account ID. The user secret prevents third parties from computing nullifiers for known account IDs.

### Constraint 4: Wallet Binding
```
signal input wallet_pubkey_x;  // public
signal input wallet_pubkey_y;  // public

// Verify EdDSA signature binding wallet to proof
component sigVerify = EdDSAVerifier();
// ... signature verification over (nullifier, timestamp)
```

Binds the proof to a specific wallet, preventing proof replay attacks.

## Verification Key

The verification key is generated during a trusted setup ceremony. For development, a placeholder key is embedded in the on-chain verifier. Production deployment requires:

1. Powers of Tau ceremony (phase 1)
2. Circuit-specific contribution (phase 2)
3. Verification key extraction
4. On-chain verifier update

## On-Chain Verifier

The on-chain Groth16 verifier uses the `ark-bn254` library to perform the pairing check:

```
e(A, B) = e(alpha, beta) * e(sum_of_public_inputs, gamma) * e(C, delta)
```

This runs within Solana's compute budget by leveraging the native BN254 precompile available since Solana v1.16.

## Nullifier System

```
nullifier = Poseidon(account_id, user_secret)
```

Properties:
- Deterministic: same inputs always produce the same nullifier
- Irreversible: cannot recover account_id from nullifier without user_secret
- Unique: different accounts produce different nullifiers
- Binding: changing user_secret changes the nullifier (prevents impersonation)

The nullifier is stored in a NullifierRecord PDA. Before minting a new Hand, the program checks this PDA does not already exist.

## Privacy Comparison

| System | Data on-chain | Reversible | Hardware |
|---|---|---|---|
| Worldcoin | Iris hash | Theoretically possible | Orb required |
| VeryAI | Palm biometric hash | Theoretically possible | Camera required |
| Humanity Protocol | Palm hash | Theoretically possible | Camera required |
| HAND Protocol | Nullifier only | Computationally infeasible | None |

## Proof Generation (Client-Side)

Proof generation runs entirely in the user's browser via WASM-compiled snarkjs:

1. User authenticates with identity source (X OAuth)
2. Account data received client-side only
3. Private inputs fed to Circom circuit (WASM witness generator)
4. Groth16 proof computed in-browser (~3-5 seconds)
5. Proof + public signals submitted as Solana transaction
6. Account data discarded, never transmitted to any server

## Verification Sources (Roadmap)

| Version | Source | Status |
|---|---|---|
| v1 | X (Twitter) OAuth | Shipped |
| v2 | GitHub OAuth | Planned |
| v2 | Discord OAuth | Planned |
| v3 | Multi-source composite | Planned |

Multiple sources can share the same nullifier derivation pattern, allowing cross-verification without additional identity exposure.
