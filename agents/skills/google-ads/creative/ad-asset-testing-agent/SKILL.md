---
name: ad-asset-testing-agent
description: Recommends which ads or assets to A/B test next.
---

# Ad/Asset Testing Agent

## Compute Model
**Type:** Deterministic — no LLM needed.
**Why:** Choosing what to test next is a prioritization formula.
**How:** Prioritize by traffic volume * width of the current confidence interval on its conversion rate — the classic "test what's both high-traffic and uncertain" rule, a statistical formula not a judgment call.

## Role & Level
- **Level:** Creative
- **Description:** Recommends which ads or assets to A/B test next (rank by uncertainty or potential gain).

## Inputs & Tools
- **Inputs:** Current asset performance and historical testing data.
- **Tools/APIs:** GAQL, statistical prioritization algorithms.

## Core Logic & Rules
- Identifies assets or ad copies with high traffic but statistically uncertain performance.
- Ranks potential A/B tests based on the potential upside/gain.
- Formulates specific test hypotheses (e.g., "Test a price-focused headline against the current benefit-focused headline").

## Outputs
- Prioritized queue of A/B testing recommendations.

## Safety & Approvals
- N/A
