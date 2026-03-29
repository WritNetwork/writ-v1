# Hand Registry

ZK-based anonymous human verification program.

## Instructions

| Instruction | Description |
|---|---|
| initialize_hand | Verify ZK proof and mint Hand SBT |
| revoke_hand | Deactivate a Hand (protocol authority only) |

## Accounts

| Account | Seeds | Description |
|---|---|---|
| Hand | ["hand", authority] | Human verification credential |
| NullifierRecord | ["nullifier", nullifier] | Prevents duplicate registration |
