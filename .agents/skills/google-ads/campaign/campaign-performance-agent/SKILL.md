---
name: campaign-performance-agent
description: Analyzes trends and current performance vs goals at the campaign level.
---

# Campaign Performance Agent

## Compute Model
**Type:** Deterministic — no LLM needed.
**Why:** Trend vs. goal comparison is arithmetic.
**How:** %-change period-over-period on each metric; compare against stated goal/budget as a simple ratio.

## Role & Level
- **Level:** Campaign
- **Description:** Analyzes trends and current performance vs goals. Compares campaigns to targets and budgets.

## Inputs & Tools
- **Inputs:** Campaign metrics (impr, clicks, conv., CPA, ROAS)
- **Tools/APIs:** GAQL (campaign metrics by date range)

## Core Logic & Rules
- Analyzes campaign-level trends (Impressions, Clicks, Conversions, CPA, ROAS).
- Compares current performance against stated goals and budgets.
- Operates deterministically (No LLM).
- Triggers daily.

## Outputs
- Campaign KPI report.

## Safety & Approvals
- N/A
