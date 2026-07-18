---
name: pmax-optimization-agent
description: Provides holistic PMax recommendations including audience signals, budgets, and bid strategy.
---

# PMax Optimization Agent

## Compute Model
**Type:** Deterministic — no LLM needed.
**Why:** This aggregates outputs from other deterministic PMax agents.
**How:** Same priority_score ranking formula as account-optimization-agent/recommendation-agent, applied to PMax-specific findings. LLM is optional and only for the narrative summary.

## Role & Level
- **Level:** PMax
- **Description:** Holistic PMax recommendations (audience signals, budgets, bid strategy).

## Inputs & Tools
- **Inputs:** Outputs from other PMax agents (Performance, Asset Group, Signal, Listing).
- **Tools/APIs:** LLM for synthesis.

## Core Logic & Rules
- Synthesizes findings from all specialized PMax agents.
- Formulates a holistic optimization strategy for the PMax campaign (e.g., balancing budget increases against adding new creative assets and narrowing audience signals).
- Uses LLM for strategic synthesis.
- Triggers weekly.

## Outputs
- Holistic PMax optimization plan.

## Safety & Approvals
- Approval required before executing major strategic shifts.
