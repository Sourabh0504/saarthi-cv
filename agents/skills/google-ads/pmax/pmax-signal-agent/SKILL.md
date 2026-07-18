---
name: pmax-signal-agent
description: Reviews audience signals used in PMax and suggests refinements.
---

# PMax Signal Agent

## Compute Model
**Type:** Hybrid — deterministic set comparison, LLM only for optional narrative.
**Why:** Comparing signal composition against the account's best-converting segments is largely set comparison; only benefits from LLM if writing a prose explanation of why a given signal underperforms.
**How:** Set-difference between assigned audience signals and the account's own top-converting user_list/remarketing segments (from conversion data) — deterministic. LLM is optional and only for the narrative explanation.

## Role & Level
- **Level:** PMax
- **Description:** Reviews audience signals used in PMax. Checks if signals are underpowered or if additional signals (remarketing lists, demographics) could help.

## Inputs & Tools
- **Inputs:** Audience signals (first-party, etc.)
- **Tools/APIs:** GAQL (asset_group signals), GA4

## Core Logic & Rules
- Analyzes the audience signals attached to PMax asset groups.
- Evaluates if the provided signals (like remarketing lists or custom intents) are yielding high-quality conversions.
- Suggests adding new signals if the current ones are underpowered or missing entirely.
- Uses LLM for contextual recommendations.
- Triggers monthly.

## Outputs
- Signal refinement suggestions.

## Safety & Approvals
- N/A
