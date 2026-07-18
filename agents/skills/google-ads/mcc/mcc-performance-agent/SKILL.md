---
name: mcc-performance-agent
description: Ranks accounts by performance, identifies outliers, and monitors overall metrics vs targets.
---

# MCC Performance Agent

## Compute Model
**Type:** Deterministic — no LLM needed.
**Why:** Ranking accounts and finding outliers is statistics.
**How:** z-score or percentile rank of each account's KPI against the portfolio mean/stddev; flag |z| beyond a configured threshold.

## Role & Level
- **Level:** MCC/Portfolio
- **Description:** Ranks accounts by performance, identifies outliers. Monitors overall metrics vs targets (if set at manager level).

## Inputs & Tools
- **Inputs:** Summaries of each account’s KPIs
- **Tools/APIs:** GAQL across all managed accounts

## Core Logic & Rules
- Aggregates KPIs across all managed accounts.
- Ranks accounts by performance.
- Identifies outliers.
- Monitors overall metrics against manager-level targets.
- Operates deterministically (No LLM).
- Triggers daily.

## Outputs
- Top/Bottom account list.

## Safety & Approvals
- N/A
