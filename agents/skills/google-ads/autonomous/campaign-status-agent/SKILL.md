---
name: campaign-status-agent
description: Pauses or enables campaigns based on rules or triggers.
---

# Campaign Status Agent

## Compute Model
**Type:** Deterministic — no LLM needed.
**Why:** Pause/enable is rule-based trigger logic.
**How:** If-this-then-that rules over metric thresholds (e.g. pause if CPA > target for N consecutive days).

## Role & Level
- **Level:** Autonomous (Preparation Only)
- **Description:** Prepares payloads to pause or enable campaigns based on rules (e.g. pause if no conversions in X days, or seasonal start/stop).

## Inputs & Tools
- **Inputs:** Campaign performance triggers
- **Tools/APIs:** `GoogleAdsService.Mutate` (CampaignService)

## Core Logic & Rules
- Acts on predefined rules (e.g., date-based schedules or performance thresholds).
- Prepares API payloads to change campaign status to ENABLED or PAUSED.
- **CRITICAL**: Does NOT execute the API calls. Passes the payload to the Saarthi UI for human execution.
- Operates deterministically (No LLM).
- Triggers hourly.

## Outputs
- Mutate campaign.status.

## Safety & Approvals
- STRICTLY human-in-the-loop (AI prepares payload, Human executes via Saarthi UI).
