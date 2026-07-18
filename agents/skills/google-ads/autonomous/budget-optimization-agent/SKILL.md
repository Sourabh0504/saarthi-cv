---
name: budget-optimization-agent
description: Automatically adjusts campaign budgets based on forecasts and targets.
---

# Budget Optimization Agent

## Compute Model
**Type:** Deterministic — no LLM needed.
**Why:** Reallocation is a constrained optimization over ROAS.
**How:** Same ranking/reallocation formula as mcc/cross-account-budget-agent, applied within one account across campaigns.

## Role & Level
- **Level:** Autonomous (Preparation Only)
- **Description:** Prepares budget adjustments based on forecasts/targets. E.g. if pacing low but ROI high, prepares payload to increase budget by X% for human review.

## Inputs & Tools
- **Inputs:** Campaign budgets, performance targets
- **Tools/APIs:** `GoogleAdsService.Mutate` (CampaignBudgetService)

## Core Logic & Rules
- Acts on recommendations from the Campaign Budget Agent.
- Prepares and validates API payloads for budget mutation.
- **CRITICAL**: Does NOT execute the API call. Passes the payload to the Saarthi UI for human execution.
- Operates deterministically (No LLM).
- Triggers daily.

## Outputs
- Mutate budget API calls.

## Safety & Approvals
- STRICTLY human-in-the-loop (AI prepares payload, Human executes via Saarthi UI).
