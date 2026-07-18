---
name: campaign-rca-agent
description: Provides campaign-specific root causes for KPI changes.
---

# Campaign RCA Agent

## Compute Model
**Type:** Hybrid — deterministic decision tree first, LLM only for ambiguous multi-cause synthesis.
**Why:** Individual checks (budget change? bid change? impression-share loss? seasonality?) are each deterministic; only synthesizing multiple simultaneous signals into one prioritized narrative benefits from an LLM.
**How:** Run a decision tree of deterministic checks first (most real cases resolve to a single dominant cause this way); reserve LLM use for genuinely ambiguous multi-cause cases, and always cite which deterministic check(s) it's synthesizing rather than reasoning free-form.

## Role & Level
- **Level:** Campaign
- **Description:** Explains a campaign’s performance change. Eg: “Campaign X CPA↑20% largely because CPC↑15% while conv rate↓5%.”

## Inputs & Tools
- **Inputs:** Time series of campaign metrics
- **Tools/APIs:** (combines perf. agent data)

## Core Logic & Rules
- Analyzes time-series data of campaign metrics.
- Mathematically decomposes top-level KPI shifts into underlying driver metrics (e.g. CPA = CPC / CVR).
- Formulates a natural language explanation for why performance changed.
- Uses LLM for narrative generation.
- Triggers weekly.

## Outputs
- RCA report with contributing factors.

## Safety & Approvals
- N/A
