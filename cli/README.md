# HAND CLI

Command-line interface for the WRIT Protocol — anonymous KYA (Know Your Agent) on Solana.

## Build

```bash
# From workspace root (build must run in WSL on Windows)
cargo build -p hand-cli --release
```

The binary is output at `target/release/hand`.

## Configuration

The CLI reads configuration from `~/.hand/config.toml`. Run `hand config init` to create the default config (devnet).

```bash
hand config init
hand config show
hand config set --network mainnet-beta
hand config set --keypair-path ~/.config/solana/id.json
hand config set --rpc-url https://my-rpc.example.com
```

## Commands

| Command      | Description                          | Example                                                                                      |
|-------------|--------------------------------------|----------------------------------------------------------------------------------------------|
| `mint`      | Mint a new Hand SBT (ZK proof)       | `hand mint --proof-file proof.json`                                                          |
| `delegate`  | Delegate Hand to an AI agent         | `hand delegate --agent <PUBKEY> --actions swap,transfer --expires 72h --max-sol-total 5.0`   |
| `revoke`    | Revoke a delegation                  | `hand revoke --agent <PUBKEY>`                                                               |
| `verify`    | Verify an agent's Hand status        | `hand verify --agent <PUBKEY> --min-reputation 500`                                          |
| `reputation`| View or recalculate reputation       | `hand reputation view --wallet <PUBKEY>`                                                     |
| `dispute`   | Open a dispute against an agent      | `hand dispute --agent <PUBKEY> --evidence-uri ipfs://Qm... --stake 0.5`                      |
| `status`    | Show Hand status for a wallet        | `hand status` or `hand status --wallet <PUBKEY>`                                             |
| `config`    | Configure CLI settings               | `hand config show`                                                                           |

## Proof file format

The `mint` command expects a JSON proof file:

```json
{
  "proof_a": [1, 2, 3, ...],
  "proof_b": [4, 5, 6, ...],
  "proof_c": [7, 8, 9, ...],
  "public_signals": ["<base58-encoded-32-byte-value>", ...],
  "nullifier": "<base58-encoded-32-byte-value>"
}
```

## Action flags

Delegations use a bitmask for allowed actions:

| Action   | Flag |
|----------|------|
| swap     | 1    |
| stake    | 2    |
| transfer | 4    |
| vote     | 8    |
| mint     | 16   |

Multiple actions are combined: `--actions swap,transfer` sets flags to `5`.

## Duration format

The `--expires` flag accepts: `30m` (minutes), `72h` (hours), `7d` (days), `300s` (seconds).
