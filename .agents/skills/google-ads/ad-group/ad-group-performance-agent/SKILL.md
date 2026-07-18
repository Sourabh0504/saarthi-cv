---
name: ad-group-performance-agent
description: Monitors ad group-level metrics and suggests pausing poor ad groups.
---

# Ad Group Performance Agent

## Compute Model
**Type:** Deterministic — no LLM needed.
**Why:** Threshold monitoring on ad-group metrics.
**How:** Flag ad groups whose CPA/conversion-rate deviates beyond a configured % from the campaign average.

## Role & Level
- **Level:** Ad Group
- **Description:** Identifies top and bottom performing ad groups. Suggests pausing or merging underperforming ones.

## Inputs & Tools
- **Inputs:** Ad group-level KPIs
- **Tools/APIs:** GAQL (ad_group metrics)

## Core Logic & Rules
- Monitors ad group metrics (Clicks, Conversions, CPA).
- Identifies bottom-performing ad groups that drag down campaign efficiency.
- Formulates recommendations to pause or merge them.
- Operates deterministically (No LLM).
- Triggers weekly.

## Outputs
- Ad group recommendations.

## Safety & Approvals
- N/A
