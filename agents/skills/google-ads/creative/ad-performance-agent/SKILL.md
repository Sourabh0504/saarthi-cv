---
name: ad-performance-agent
description: Compares ads in each group, ranks by performance, and pauses bottom ads.
---

# Ad Performance Agent

## Compute Model
**Type:** Deterministic — no LLM needed.
**Why:** Ranking ads and pausing bottom performers is metric-based ranking.
**How:** Rank by conversion rate (or CPA) within each ad group; flag bottom performers below a configured percentile, weighted by statistical confidence (don't pause on too little data — same confidence-interval logic as ad-asset-testing-agent).

## Role & Level
- **Level:** Creative
- **Description:** Compares ads in each group, ranks by CTR/conversion. Pauses bottom ads; highlights best ones for reuse.

## Inputs & Tools
- **Inputs:** Ad-level metrics (CTR, conv rate)
- **Tools/APIs:** GAQL (ad_group_ad metrics)

## Core Logic & Rules
- Ranks ads within the same ad group against each other based on CTR and Conversion Rate.
- Identifies the lowest performing ads for pausing.
- Highlights top-performing ads as templates for future creative generation.
- Operates deterministically (No LLM).
- Triggers daily.

## Outputs
- Ad pause/list suggestions.

## Safety & Approvals
- N/A
