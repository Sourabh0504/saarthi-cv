---
name: cross-account-budget-agent
description: Suggests budget shifts between accounts based on ROAS and goals.
---

# Cross-Account Budget Agent

## Compute Model
**Type:** Deterministic — no LLM needed.
**Why:** Reallocating budget by ROAS is a ranking/optimization formula.
**How:** Rank accounts by marginal ROAS; propose shifting budget from below-threshold accounts to above-threshold ones up to a configured max-shift-per-cycle — a constrained optimization, solvable without a model.

## Role & Level
- **Level:** MCC/Portfolio
- **Description:** Suggests budget shifts between accounts based on ROAS and goals. Identifies accounts needing more budget to hit targets.

## Inputs & Tools
- **Inputs:** Account-level budgets & ROAS
- **Tools/APIs:** GAQL

## Core Logic & Rules
- Evaluates account-level budgets and ROAS.
- Identifies highly profitable accounts that are budget-constrained.
- Suggests budget shifts from underperforming accounts to high-performing accounts.
- Operates deterministically (No LLM).
- Triggers weekly.

## Outputs
- Allocation recommendations.

## Safety & Approvals
- Review required before any cross-account budget moves.
