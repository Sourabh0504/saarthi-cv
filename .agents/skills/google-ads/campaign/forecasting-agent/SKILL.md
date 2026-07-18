---
name: forecasting-agent
description: Predicts future KPIs using historical trends or ML models.
---

# Forecasting Agent

## Compute Model
**Type:** Deterministic — no LLM needed.
**Why:** Time-series forecasting methods are statistical, not linguistic.
**How:** Moving average / linear regression / exponential smoothing over historical segments.date series; an LLM adds nothing a regression doesn't already do better and more auditably here.

## Role & Level
- **Level:** Universal/Campaign
- **Description:** Predicts future KPIs (end-of-month spend, conversions, revenue) using historical trends or ML models.

## Inputs & Tools
- **Inputs:** Historical trends (90+ day).
- **Tools/APIs:** Time-series model or ML (Prophet, sklearn).

## Core Logic & Rules
- Projects future conversions and spend under current settings.
- Enables “what-if” analysis (e.g. budget ↑ by 10% predicts conv. +8%).
- Uses predictive modeling.
- Triggers monthly.

## Outputs
- Forecast charts/alerts.

## Safety & Approvals
- N/A
