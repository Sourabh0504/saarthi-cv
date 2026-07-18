---
name: account-performance-agent
description: Aggregates KPIs per account and flags underperforming campaigns.
---

# Account Performance Agent

## Compute Model
**Type:** Deterministic — no LLM needed.
**Why:** Aggregating KPIs and flagging underperformance is arithmetic plus threshold comparison.
**How:** Aggregate metrics.* across campaigns, compare against goal/target, flag campaigns beyond a configured deviation %.

## Role & Level
- **Level:** Account
- **Description:** Aggregates KPIs per account (impressions, clicks, cost, conv., CPA, ROAS). Flags underperforming campaigns.

## Inputs & Tools
- **Inputs:** Campaign/ad group metrics (performance reports)
- **Tools/APIs:** GAQL (metrics in SELECT/WHERE)

## Core Logic & Rules
- Computes aggregate KPIs for the account.
- Analyzes campaign and ad group metrics.
- Flags underperforming campaigns.
- Operates deterministically (No LLM).
- Triggers daily.

## Outputs
- Account KPI summary.

## Safety & Approvals
- N/A
