---
name: recommendation-agent
description: Converts analytics into prioritized actions for the campaign.
---

# Recommendation Agent

## Compute Model
**Type:** Deterministic — no LLM needed.
**Why:** Prioritizing actions is a ranking formula over inputs already produced by other deterministic agents.
**How:** priority_score = impact * confidence / effort, sorted descending. LLM is optional and only for phrasing.

## Role & Level
- **Level:** Universal/Campaign
- **Description:** Converts analytics into prioritized actions (e.g. “increase bid by 10% on Campaign A”, “add new keyword on Campaign B”).

## Inputs & Tools
- **Inputs:** Analytics from RCA, Performance, and Pacing agents.
- **Tools/APIs:** Shared data store.

## Core Logic & Rules
- Acts as a translation layer between raw analytics and actionable tasks.
- Synthesizes insights to formulate specific, clear recommendations.
- Prioritizes recommendations based on potential impact and effort.
- Uses LLM to generate the final list of suggestions.

## Outputs
- Actionable recommendation list.

## Safety & Approvals
- N/A
