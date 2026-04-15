# Self-Audit Notes

Internal review checklist for the WRIT Protocol smart contracts. This document captures the team's own pre-audit review before engaging an external firm.

## Scope

Programs covered:

- `programs/writ-registry` — L1 root of trust
- `programs/delegation`    — L2 scoped permissions
- `programs/reputation`    — L3 behavior scoring
- `programs/writ-gate`     — L4 verification CPI surface

Commit reviewed: see `CHANGELOG.md` for per-release tags.

## Review categories

### Access control

- [x] Every mutable instruction validates the `Signer` account matches the authority field on the PDA.
- [x] `writ-registry::revoke` requires the wallet to own the Hand account (checked against `hand.owner`).
- [x] `delegation::revoke_delegation` requires the delegator or emergency_guardian to sign.
- [x] `reputation::dispute` requires the dispute opener to stake SOL upfront.
- [x] No instruction allows a third party to mutate another user's state without explicit consent.

### Account validation

- [x] All `#[account(seeds = [...], bump)]` constraints include the full seed set.
- [x] PDA bumps are stored at creation and re-verified on every mutation.
- [x] Cross-program PDA lookups in `writ_gate` use `try_from_unchecked` + explicit owner and discriminator checks.
- [x] `AccountInfo::owner` is verified before deserializing any externally-provided account.

### Arithmetic

- [x] All lamport arithmetic uses `checked_add` / `checked_sub` / `checked_mul`.
- [x] Reputation scoring clamps to the `[0, 10_000]` range on every mutation path.
- [x] Delegation budget decrements are rejected if the debit exceeds the remaining balance.
- [x] Timestamp comparisons treat `expires_at == 0` as "no expiry" (no wrap-around to far past).

### CPI safety

- [x] `writ_gate::verify_agent` is a read-only CPI; it returns `AgentStatus` and never mutates PDAs across the call.
- [x] `writ_gate::verify_and_record` is the explicit mutating variant; it requires the caller to hold write authority on the delegation PDA.
- [x] No CPI is invoked with unsanitized caller-provided instruction data.

### Re-entrancy & concurrency

- [x] All state mutations follow the Checks-Effects-Interactions pattern.
- [x] No `invoke` or `invoke_signed` call happens after a state write within the same instruction.
- [x] The Solana runtime serializes transactions at the account level; no cross-transaction re-entrancy surface identified.

### Data exposure

- [x] No PII is accepted into any instruction. The registry accepts only the Poseidon nullifier commitment and the ZK proof bytes.
- [x] Event emissions do not leak the nullifier pre-image.
- [x] Logged error messages do not include user secrets.

### Upgrade authority

- [x] All four programs declare a single upgrade authority at deploy time.
- [x] The authority is documented as the deployer wallet on devnet; a 2-of-3 Squads multisig is planned before mainnet deployment.
- [x] `declare_id!` values match the actual deployed Program IDs (see `README.md` Deployments table).

### ZK verifier specifics

- [x] `verify_groth16_proof` uses `ark-groth16` with the BN254 curve.
- [x] The verification key is embedded as constant arrays at build time. Devnet ships with the testnet ceremony output; mainnet builds consume the production ceremony output.
- [x] Nullifier uniqueness is enforced by a PDA with the nullifier bytes as a seed (`find_program_address`).
- [x] `compute_nullifier_hash` applies a domain separator (`hand-nullifier-v1`) so that nullifiers from this protocol cannot be confused with arbitrary SHA-256 outputs.

## Known limitations

1. **Testnet ceremony only.** The current verification key constants are zero-initialized for local test runs. Mainnet deployment is blocked on running the production ceremony and patching the constants before deploy.
2. **Single upgrade authority.** Until the multisig migration ships, the upgrade authority is a single keypair. This is acceptable on devnet and will be rotated before mainnet.
3. **Reputation reporter allowlist.** Any program listed in the reputation allowlist can submit action reports. Reporter misbehavior is mitigated by the dispute mechanism but is not prevented at the write surface.
4. **Agent account age.** There is no minimum account-age gate on delegation; age-based trust is surfaced only through the reputation score.

## Open tests

Tests in `tests/` cover:

- Hand mint, nullifier deduplication, revocation
- Delegation create, update, revoke, budget consume
- Reputation report, dispute open, dispute resolve
- Gate verify, verify_with_reputation, verify_with_scope
- Multi-program CPI composition from an external consumer

Integration coverage over devnet RPC lives in `tests/e2e.devnet.ts`.

## External audit

An external audit is scoped for the v0.5.0 release freeze. Firms under evaluation: Ottersec, Neodyme, Halborn. Audit findings will be tracked in `audits/` once the engagement is scheduled.

## Reporting a vulnerability

See [SECURITY.md](../SECURITY.md) for the disclosure process.
