---
name: campaign-bidding-agent
description: Evaluates bidding strategy effectiveness (Target CPA/ROAS) and suggests adjustments.
---

# Campaign Bidding Agent

## Compute Model
**Type:** Deterministic — no LLM needed.
**Why:** Comparing actual vs. target CPA/ROAS and reading bidding_strategy learning status are arithmetic plus enum reads.
**How:** deviation% = (actual_cpa - target_cpa)/target_cpa; also surface bidding_strategy status (LEARNING/LIMITED/etc.) directly from the API rather than inferring it.

## Role & Level
- **Level:** Campaign
- **Description:** Evaluates whether target CPA/ROAS is being met. If conversions miss target by X%, adjust target or strategy.

## Inputs & Tools
- **Inputs:** Bidding strategy, CPA/ROAS targets, performance
- **Tools/APIs:** `GoogleAdsService.Search` (campaign_bidding_strategy)

## Core Logic & Rules
- Compares actual CPA/ROAS against the campaign's set target.
- Identifies if conversions or ROI are missing targets by a defined threshold (X%).
- Suggests adjustments to target values or recommends changing the core bidding strategy.
- Uses LLM for strategic evaluation.
- Triggers weekly.

## Outputs
- Bidding strategy change recommendations.

## Safety & Approvals
- Approval required for bid changes.
