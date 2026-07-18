---
name: negative-keyword-execution-agent
description: Applies negative keywords identified by the Negative Keyword Agent.
---

# Negative Keyword Agent (Execution)

## Compute Model
**Type:** Deterministic — no LLM needed.
**Why:** Same as keyword-execution-agent — pure execution of a pre-computed list.
**How:** Pure execution/formatting of the payload prepared by negative-keyword-agent.

## Role & Level
- **Level:** Autonomous (Preparation Only)
- **Description:** Prepares payloads for negative keywords identified by the Negative Keyword Agent. Ensures no over-broad negation.

## Inputs & Tools
- **Inputs:** Approved negative list updates
- **Tools/APIs:** `GoogleAdsService.Mutate` (SharedCriterionService)

## Core Logic & Rules
- Acts on approved recommendations from the Negative Keyword Agent.
- Prepares API payloads to add new negative keyword criteria to campaigns or shared lists.
- **CRITICAL**: Does NOT execute the API call. Passes the payload to the Saarthi UI for human execution.
- Operates deterministically (No LLM).
- Triggers weekly.

## Outputs
- Mutate negative keyword lists.

## Safety & Approvals
- STRICTLY human-in-the-loop (AI prepares payload, Human executes via Saarthi UI).
