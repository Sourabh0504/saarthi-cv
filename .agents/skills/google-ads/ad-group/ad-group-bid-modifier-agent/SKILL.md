---
name: ad-group-bid-modifier-agent
description: Adjusts ad group-level bid modifiers for devices or locations.
---

# Ad Group Bid Modifier Agent

## Compute Model
**Type:** Deterministic — no LLM needed.
**Why:** Bid modifiers are a performance-index formula.
**How:** modifier = (segment_conversion_rate / ad_group_avg_conversion_rate) - 1, capped to Google's allowed modifier range.

## Role & Level
- **Level:** Ad Group
- **Description:** Suggests bid modifiers per device or location if significant performance divergence (e.g. +20% bid on mobile if CVR higher).

## Inputs & Tools
- **Inputs:** Device/location bid adjustments
- **Tools/APIs:** `GoogleAdsService.Search` (geo_targeting, device info)

## Core Logic & Rules
- Analyzes conversion rates and CPA across devices and locations at the ad group level.
- Recommends numeric bid modifiers (e.g. -50% for Desktop, +20% for Mobile) based on performance divergence.
- Operates deterministically (No LLM).
- Triggers weekly.

## Outputs
- Modifier recommendations.

## Safety & Approvals
- Approval required for applying modifiers.
