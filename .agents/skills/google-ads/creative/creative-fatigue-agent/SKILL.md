---
name: creative-fatigue-agent
description: Detects performance decay in ads to prompt fresh creatives.
---

# Creative Fatigue Agent

## Compute Model
**Type:** Deterministic — no LLM needed.
**Why:** Fatigue is a decay pattern over exposure/frequency — time-series statistics.
**How:** Track CTR/conversion-rate trend over cumulative impressions or days-live; flag a sustained negative slope beyond a configured threshold.

## Role & Level
- **Level:** Creative
- **Description:** Detects performance decay (e.g. declining CTR on same ads). Flags ads likely fatigued, prompting refresh.

## Inputs & Tools
- **Inputs:** Time-series ad performance
- **Tools/APIs:** Time-series analysis

## Core Logic & Rules
- Analyzes time-series CTR and Conversion Rate data for active creatives.
- Detects steady, statistically significant decay in performance over time.
- Flags ads that are likely experiencing creative fatigue and require replacement.
- Operates deterministically (No LLM).
- Triggers weekly.

## Outputs
- Refresh creative alerts.

## Safety & Approvals
- N/A
