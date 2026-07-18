---
name: campaign-targeting-agent
description: Optimizes geos, devices, audiences, and ad scheduling segments.
---

# Campaign Targeting Agent

## Compute Model
**Type:** Deterministic — no LLM needed.
**Why:** Comparing segment performance (device/geo/audience/schedule) is arithmetic ranking.
**How:** efficiency_index = segment_conversion_rate / campaign_avg_conversion_rate per segment; rank and flag outliers.

## Role & Level
- **Level:** Campaign
- **Description:** Examines performance by segment. E.g. if a country or device costs more per conversion than average, suggest adjustments (exclude or bid down).

## Inputs & Tools
- **Inputs:** Geo, device, audience segments, demographic data
- **Tools/APIs:** GAQL (segments by geo/device)

## Core Logic & Rules
- Analyzes campaign performance broken down by targeting segments (geo, device, audience).
- Identifies segments that cost significantly more per conversion than the campaign average.
- Suggests segment exclusions or bid-down modifiers for underperforming segments.
- Operates deterministically (No LLM).
- Triggers weekly.

## Outputs
- Targeting adjustment alerts.

## Safety & Approvals
- N/A
