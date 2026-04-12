# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 0.4.x   | Yes       |
| 0.3.x   | Yes       |
| < 0.3   | No        |

## Reporting a Vulnerability

If you discover a security vulnerability in HAND Protocol, report it responsibly.

**Do not open a public issue.**

Email: security@handprotocol.xyz

Include:
- Description of the vulnerability
- Steps to reproduce
- Potential impact assessment
- Suggested fix (if any)

We will acknowledge receipt within 24 hours and provide a timeline for resolution within 5 business days.

## Disclosure Policy

- We follow a 90-day coordinated disclosure timeline.
- Credit will be given to the reporter unless they request anonymity.
- Critical vulnerabilities affecting mainnet funds will be prioritized for immediate patching.

## Security Measures

### ZK Proof Verification
- Groth16 proofs verified on-chain using ark-bn254 pairing library.
- Verification key embedded in program binary; updates require program upgrade authority.
- Nullifier system prevents double-registration without exposing identity data.

### PDA Isolation
- All accounts are Program Derived Addresses with deterministic seeds.
- Cross-program references validated via CPI account ownership checks.
- No account reuse across programs.

### Delegation Scope Enforcement
- Spending limits tracked on-chain via atomic counter updates.
- Expiry checked against Solana Clock sysvar.
- Action bitflags validated before any consume operation.

### Dispute System
- Stake requirement prevents spam disputes.
- Protocol authority resolves disputes (v1); DAO governance planned for v2.
- Reputation penalties are bounded and reversible through positive activity.

## Audit Status

No formal audit has been completed. The protocol is on devnet. Do not use with real funds until an audit is published.
