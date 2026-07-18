---
name: revenue-profitability-agent
description: Incorporates profit margins to prioritize campaigns based on true profitability.
---

# Revenue/Profitability Agent

## Compute Model
**Type:** Deterministic — no LLM needed.
**Why:** Margin-based prioritization is arithmetic.
**How:** true_profit = revenue * margin% - ad_spend, ranked per campaign.

## Role & Level
- **Level:** BI
- **Description:** Incorporates profit margins or customer LTV to prioritize campaigns.

## Inputs & Tools
- **Inputs:** Campaign spend, revenue, product profit margins.
- **Tools/APIs:** CRM API, Google Ads API.

## Core Logic & Rules
- Moves beyond basic ROAS (Revenue On Ad Spend) to calculate POAS (Profit On Ad Spend).
- Factors in variable costs and product margins.
- Recommends shifting budget towards campaigns that drive the highest net profit, rather than just top-line revenue.
- Uses LLM for strategic reporting.

## Outputs
- Profitability prioritization report.

## Safety & Approvals
- N/A
