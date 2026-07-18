---
name: pmax-asset-group-agent
description: Monitors each PMax asset group and recommends splitting or merging if performance varies widely.
---

# PMax Asset Group Agent

## Compute Model
**Type:** Deterministic — no LLM needed.
**Why:** Recommending splits/merges is a variance/dispersion calculation across asset groups.
**How:** Compute coefficient of variation of conversion rate (or CPA) across a campaign's asset groups; flag for split when variance exceeds a configured threshold.

## Role & Level
- **Level:** PMax
- **Description:** Monitors each PMax asset group (set of creatives + signals). Recommends splitting or merging groups if performance varies widely.

## Inputs & Tools
- **Inputs:** Asset group-level performance
- **Tools/APIs:** GAQL (asset group metrics)

## Core Logic & Rules
- Tracks metrics for individual Asset Groups within a PMax campaign.
- Identifies disparities in performance between asset groups.
- Suggests consolidating low-volume asset groups or splitting highly distinct groups.
- Operates deterministically (No LLM).
- Triggers weekly.

## Outputs
- Asset group performance alerts.

## Safety & Approvals
- N/A
