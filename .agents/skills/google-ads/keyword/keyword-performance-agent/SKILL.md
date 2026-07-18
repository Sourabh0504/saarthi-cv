---
name: keyword-performance-agent
description: Flags keywords with high spend and low conversions or high CTR.
---

# Keyword Performance Agent

## Compute Model
**Type:** Deterministic — no LLM needed.
**Why:** Flagging high-spend/low-conversion or high-CTR keywords is threshold comparison.
**How:** Flag where cost_micros is in the top X% and conversions below a configured floor.

## Role & Level
- **Level:** Keyword
- **Description:** Flags keywords with high spend and low conversions (pause) or high CTR (increase bids). Tracks quality score.

## Inputs & Tools
- **Inputs:** Keyword-level metrics (CTR, CPC, conversions)
- **Tools/APIs:** GAQL (ad_group_criterion metrics)

## Core Logic & Rules
- Analyzes impression, CTR, CPC, and conversion data for individual keywords.
- Flags keywords with high spend but low conversions (recommends pausing or lowering bids).
- Flags keywords with high CTR and good conversion rates (recommends increasing bids).
- Monitors keyword Quality Score trends.
- Operates deterministically (No LLM).
- Triggers daily.

## Outputs
- Keyword action list.

## Safety & Approvals
- N/A
