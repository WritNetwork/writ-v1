# Contributing to HAND Protocol

## Getting Started

Fork the repository and clone your fork locally. All contributions go through pull requests against the `main` branch.

## Development Setup

### Prerequisites

- Rust 1.78+ (install via [rustup](https://rustup.rs))
- Solana CLI 1.18+
- Anchor 0.30+
- Node.js 20+
- npm 10+

### Clone and Build

```bash
git clone https://github.com/<your-fork>/hand.git
cd hand
cargo check --workspace
cd sdk && npm install
```

### Run Tests

```bash
anchor test
cd sdk && npm test
```

## Code Style

### Rust

- Format with `cargo fmt --all` before committing.
- Run `cargo clippy --workspace` and resolve all warnings.
- Follow standard Rust naming conventions.

### TypeScript (SDK)

- Format with `npx prettier --write "src/**/*.ts"` before committing.
- Ensure `npx tsc --noEmit` passes with no errors.

## Pull Request Process

1. Create a feature branch from `main`.
2. Keep changes focused. One logical change per PR.
3. Write or update tests for your changes.
4. Ensure CI passes (format, clippy, type check, security scan).
5. Fill out the PR template completely.
6. Request review from `@hand-protocol`.

## Commit Messages

Use [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add delegation revocation instruction
fix: prevent nullifier collision on concurrent mints
docs: update SDK usage examples
refactor: extract score calculation into module
test: add reputation dispute edge case coverage
chore: update dependencies
```

Keep the subject line under 72 characters. Use the body for additional context when needed.

## Reporting Issues

Use the issue templates provided in the repository. Include as much detail as possible: steps to reproduce, environment information, error messages, and transaction signatures when relevant.

## Code of Conduct

This project follows the [Contributor Covenant Code of Conduct](CODE_OF_CONDUCT.md). By participating, you agree to uphold its terms.
