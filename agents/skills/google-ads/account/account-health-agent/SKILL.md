---
name: account-health-agent
description: Computes a composite health score based on tracking, budget, structure, and performance.
---

# Account Health Agent

## Compute Model
**Type:** Deterministic — no LLM needed.
**Why:** A composite score is a weighted formula over other deterministic sub-scores.
**How:** health_score = sum(weight_i * normalized_subscore_i) across tracking/budget/structure/performance components; weights configurable per account.

## Role & Level
- **Level:** Account
- **Description:** Computes composite health score: e.g. tracking ok, no conversion gaps, healthy budgets, active campaigns, no policy issues, good ROI, structure sound.

## Inputs & Tools
- **Inputs:** Aggregated account metrics, tracking status
- **Tools/APIs:** (All above agents’ outputs)

## Core Logic & Rules
- Computes an overall composite health score for the account.
- Weighs various factors: tracking status, conversion gaps, budget pacing, campaign activity, policy compliance, ROI, and structural soundness.
- Operates deterministically (No LLM).
- Triggers weekly.

## Outputs
- Health score dashboard.

## Safety & Approvals
- N/A
