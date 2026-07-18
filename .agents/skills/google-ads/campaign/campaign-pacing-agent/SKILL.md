---
name: campaign-pacing-agent
description: Tracks actual spend vs expected spend based on a pacing model.
---

# Campaign Pacing Agent

## Compute Model
**Type:** Deterministic — no LLM needed.
**Why:** Identical math family to budget-pacing-agent, campaign-scoped.
**How:** See budget-pacing-agent's formula (expected_spend = days_elapsed/days_in_period * budget), applied per campaign.

## Role & Level
- **Level:** Campaign
- **Description:** Tracks actual spend vs expected spend based on pacing model. Flags pacing issues to avoid overspend or underdelivery.

## Inputs & Tools
- **Inputs:** Daily spend vs linear budget, calendar targets
- **Tools/APIs:** GAQL

## Core Logic & Rules
- Computes expected spend based on calendar targets and linear budget models.
- Compares actual daily spend against expected pacing.
- Flags immediate pacing issues to prevent extreme overspend or underdelivery.
- Operates deterministically (No LLM).
- Triggers hourly.

## Outputs
- Pacing alerts.

## Safety & Approvals
- N/A
