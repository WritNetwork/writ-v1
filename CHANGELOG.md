# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/).

## [0.4.1] - 2026-04-13

### Added
- Scoped delegation with per-transaction and total lamport budgets
- Dispute resolution system with stake-based anti-spam
- CLI `dispute` command for opening challenges
- Reputation recalculate instruction callable by anyone

### Changed
- Reputation score formula includes age bonus component
- Delegation consume tracks cumulative spending for budget enforcement
- CLI verify command scans by agent pubkey using memcmp filters

### Fixed
- Nullifier collision edge case in concurrent minting
- Score overflow when disputes_lost penalty exceeds base score
- Delegation PDA derivation mismatch between SDK and on-chain program

## [0.3.0] - 2026-03-15

### Added
- Reputation engine with on-chain score calculation
- Reporter registration system for whitelisted protocols
- Hand Gate CPI verification interface
- SDK `verifyAgentWithReputation` and `verifyAgentWithScope` methods

### Changed
- Migrated to Anchor 0.30.1 with idl-build feature
- Updated ZK verifier to use ark-bn254 pairing library
- Moved action flag constants to shared constants module

## [0.2.0] - 2026-02-08

### Added
- Delegation program with scoped permissions
- TypeScript SDK with full client API
- CLI tool with mint, delegate, verify, status commands
- Duration parsing for delegation expiry (72h, 7d, etc.)

### Changed
- Hand account now tracks delegations_count for enforcement
- Improved PDA derivation consistency across all four programs

## [0.1.0] - 2025-12-20

### Added
- Hand Registry program with ZK Groth16 verification
- Nullifier-based duplicate prevention
- SBT minting via Token-2022 NonTransferable extension
- Initial project scaffolding and CI pipeline
- Architecture documentation
