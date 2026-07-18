---
name: account-budget-agent
description: Compares total spend vs budgets to spot unused budget or overspend.
---

# Account Budget Agent

## Compute Model
**Type:** Deterministic — no LLM needed.
**Why:** Spend-vs-budget comparison is arithmetic.
**How:** utilization = total_spend / total_budget over the period; flag <configured-min% (underspend) or >configured-max% (overspend risk).

## Role & Level
- **Level:** Account
- **Description:** Compares total spend vs sum(budgets), spot unused budget or overspend. Suggests redistributing budgets between campaigns.

## Inputs & Tools
- **Inputs:** Budgets and spend data (by campaign)
- **Tools/APIs:** `GoogleAdsService.Search` (budget metrics)

## Core Logic & Rules
- Computes total spend vs total allocated budgets.
- Spots instances of unused budget or overspend.
- Formulates suggestions to redistribute budgets between campaigns.
- Operates deterministically (No LLM).
- Triggers daily.

## Outputs
- Budget reallocation suggestions.

## Safety & Approvals
- Review recommended changes before applying.
