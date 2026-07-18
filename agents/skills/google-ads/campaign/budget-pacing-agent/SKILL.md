---
name: budget-pacing-agent
description: This file is detailing the instructions, role, and logic for the Budget Pacing Agent, which is operating at the Campaign level.
---

# Budget Pacing Agent

## Compute Model
**Type:** Deterministic — no LLM needed.
**Why:** Pacing is arithmetic.
**How:** expected_spend = (days_elapsed / days_in_period) * period_budget; pace_ratio = actual_spend / expected_spend.

This file is detailing the instructions, role, and logic for the Budget Pacing Agent, which is operating at the Campaign level to perform specific tasks within the Google Ads environment.
