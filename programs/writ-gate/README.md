# Hand Gate

CPI verification interface for external programs.

## Instructions

| Instruction | Description |
|---|---|
| verify_agent | Basic agent verification |
| verify_agent_with_reputation | Verify with minimum reputation score |
| verify_agent_with_scope | Verify action type and budget |

## Integration

Add to your Cargo.toml:
```toml
writ_gate = { git = "https://github.com/WritNetwork/writ", features = ["cpi"] }
```
