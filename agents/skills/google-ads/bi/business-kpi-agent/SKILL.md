---
name: business-kpi-agent
description: Connects ad metrics to business metrics (revenue, ROI, ROAS).
---

# Business KPI Agent

## Compute Model
**Type:** Deterministic — no LLM needed.
**Why:** ROAS/ROI are textbook formulas.
**How:** ROAS = conversion_value / cost; ROI = (revenue - cost) / cost — pure arithmetic, no model needed.

## Role & Level
- **Level:** BI
- **Description:** Maps ad events to sales revenue in CRM. Computes true ROAS and profit (using margins). Adjusts for offline lag.

## Inputs & Tools
- **Inputs:** Campaign spend/conv vs revenue from CRM
- **Tools/APIs:** CRM API, GA4, GoogleAds API

## Core Logic & Rules
- Correlates Google Ads spend and conversion data with true sales revenue tracked in the CRM.
- Computes actual ROI and true ROAS by factoring in product margins and offline sales lags.
- Uses LLM for insight generation and reporting on business-level impact.
- Triggers monthly.

## Outputs
- Profitability dashboard.

## Safety & Approvals
- N/A
