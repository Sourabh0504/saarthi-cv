---
name: account-optimization-agent
description: Lists top optimization opportunities for the account based on aggregated issues.
---

# Account Optimization Agent

## Compute Model
**Type:** Deterministic — no LLM needed.
**Why:** This aggregates and ranks issues already found by other (deterministic) agents.
**How:** priority_score = estimated_impact * confidence / effort, sorted descending. LLM is optional and only for phrasing the final list, never for the ranking math.

## Role & Level
- **Level:** Account
- **Description:** Lists top optimization opportunities for the account (e.g. missing keywords, inactive good campaigns, low quality score segments).

## Inputs & Tools
- **Inputs:** Aggregate issues across campaigns
- **Tools/APIs:** Combines other agent outputs

## Core Logic & Rules
- Synthesizes outputs and issues flagged by all other Account and Campaign level agents.
- Generates a prioritized list of top optimization opportunities for the account.
- Evaluates scenarios like missing keywords, inactive strong campaigns, or low quality score segments.
- Uses LLM for synthesis and prioritization.
- Triggers weekly.

## Outputs
- Prioritized recommendation list.

## Safety & Approvals
- Approval required for major changes before implementation.
