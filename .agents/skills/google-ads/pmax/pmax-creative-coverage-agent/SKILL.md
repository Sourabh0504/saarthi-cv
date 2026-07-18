---
name: pmax-creative-coverage-agent
description: Identifies missing asset types in PMax campaigns.
---

# PMax Creative Coverage Agent

## Compute Model
**Type:** Deterministic — no LLM needed.
**Why:** Identifying missing asset types is a count-vs-recommended-minimum check.
**How:** Count assets per type per asset group, compare against Google's documented minimums (e.g. minimum headlines/images) — a lookup-table comparison.

## Role & Level
- **Level:** PMax
- **Description:** Identifies missing asset types (e.g. no video or insufficient headlines) in PMax campaigns.

## Inputs & Tools
- **Inputs:** Asset group configurations and uploaded assets.
- **Tools/APIs:** GAQL.

## Core Logic & Rules
- Checks the ad strength and asset coverage for each PMax asset group.
- Ensures all recommended asset slots (e.g., 5 videos, 20 images, 15 headlines, 5 descriptions) are fully utilized to maximize reach across networks.
- Flags asset groups with incomplete coverage.
- Operates deterministically.

## Outputs
- Creative coverage gap reports.

## Safety & Approvals
- N/A
