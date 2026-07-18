---
name: keyword-execution-agent
description: Adds new keywords or pauses low-performing ones as recommended by Keyword agents.
---

# Keyword Execution Agent

## Compute Model
**Type:** Deterministic — no LLM needed.
**Why:** This only applies a pre-computed recommendation — no judgment happens here at all.
**How:** Pure execution/formatting of the payload prepared by keyword-discovery-expansion-agent or negative-keyword-agent.

## Role & Level
- **Level:** Autonomous (Preparation Only)
- **Description:** Prepares payloads to add new keywords or pause low-perf. ones as recommended by the Keyword agents. Ensures match types correctly set.

## Inputs & Tools
- **Inputs:** Approved keyword additions/pauses
- **Tools/APIs:** `GoogleAdsService.Mutate` (AdGroupCriterionService)

## Core Logic & Rules
- Acts on approved recommendations from the Keyword Performance and Discovery agents.
- Prepares API payloads to add new keyword criteria or mutate the status (pause) of existing ones.
- **CRITICAL**: Does NOT execute the API call. Passes the payload to the Saarthi UI for human execution.
- Operates deterministically (No LLM).
- Triggers hourly.

## Outputs
- Mutate keyword operations.

## Safety & Approvals
- STRICTLY human-in-the-loop (AI prepares payload, Human executes via Saarthi UI).
