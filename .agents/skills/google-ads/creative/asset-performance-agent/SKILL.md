---
name: asset-performance-agent
description: Measures individual asset effectiveness and identifies missing assets.
---

# Asset Performance Agent

## Compute Model
**Type:** Deterministic — no LLM needed.
**Why:** Google already computes per-asset performance labels.
**How:** Read ad_group_ad_asset_view.performance_label (LEARNING/LOW/GOOD/BEST) directly rather than re-deriving effectiveness; "missing assets" is a count-vs-recommended-minimum check.

## Role & Level
- **Level:** Creative/PMax
- **Description:** For PMax/Demand Gen, measures each asset’s CTR/conv. Identifies missing assets (e.g. no video).

## Inputs & Tools
- **Inputs:** Individual asset metrics (images, videos, headlines)
- **Tools/APIs:** GAQL (asset performance views)

## Core Logic & Rules
- Measures CTR and Conversion Rate for individual image, video, and headline assets.
- Cross-references currently uploaded assets against best practice requirements.
- Flags if crucial asset types (like Videos) are missing entirely from the campaign.
- Operates deterministically (No LLM).
- Triggers weekly.

## Outputs
- Asset gap analysis.

## Safety & Approvals
- N/A
