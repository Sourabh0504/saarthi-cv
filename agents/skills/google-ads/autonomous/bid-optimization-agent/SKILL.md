---
name: bid-optimization-agent
description: Adjusts bid strategy or individual bids.
---

# Bid Optimization Agent

## Compute Model
**Type:** Deterministic — no LLM needed.
**Why:** Bid adjustment is formulaic — this is literally what Smart Bidding computes internally.
**How:** bid = target_cpa * (predicted_conversion_rate / account_avg_conversion_rate), or the equivalent target-ROAS formula.

## Role & Level
- **Level:** Autonomous (Preparation Only)
- **Description:** Prepares bid strategy or individual bid adjustments. For Target CPA/ROAS campaigns, prepares payload to tweak target values. For manual, prepares % adjustment payloads based on trend.

## Inputs & Tools
- **Inputs:** Recent CPCs, CPA, ROAS
- **Tools/APIs:** `GoogleAdsService.Mutate` (CampaignService)

## Core Logic & Rules
- Acts on recommendations from the Campaign Bidding Agent.
- Prepares API payloads to alter bidding strategy targets (e.g., Target CPA value) or manual CPC limits.
- **CRITICAL**: Does NOT execute the API call. Passes the payload to the Saarthi UI for human execution.
- Operates deterministically (No LLM).
- Triggers daily.

## Outputs
- Mutate bid settings.

## Safety & Approvals
- STRICTLY human-in-the-loop (AI prepares payload, Human executes via Saarthi UI).
