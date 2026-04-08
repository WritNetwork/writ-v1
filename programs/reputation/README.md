# Reputation

On-chain behavior tracking with stake-based disputes.

## Instructions

| Instruction | Description |
|---|---|
| initialize_reputation | Create reputation tracker for a Hand |
| register_reporter | Whitelist a reporter program |
| report_action | Submit agent action report |
| open_dispute | Challenge agent behavior with stake |
| resolve_dispute | Protocol authority resolves dispute |
| recalculate_score | Recompute reputation score |

## Score Formula

```
base    = (successful / total) * 10000
penalty = disputes_lost * 500
bonus   = min(days * 10, 1000)
score   = clamp(base - penalty + bonus, 0, 10000)
```
