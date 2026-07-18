---
name: ltv-modeling-agent
description: Estimates the lifetime value of customers acquired from specific campaigns.
---

# LTV Modeling Agent

## Compute Model
**Type:** Deterministic — no LLM needed.
**Why:** LTV modeling is established actuarial/statistical math.
**How:** Cohort-based LTV = avg_order_value * purchase_frequency * avg_customer_lifespan (or a BG/NBD-style predictive model) — a well-defined formula, not a language task.

## Role & Level
- **Level:** BI
- **Description:** Estimates lifetime value of customers from campaigns (e.g. using GA4 or CRM data).

## Inputs & Tools
- **Inputs:** Historical customer purchase data, retention rates.
- **Tools/APIs:** CRM API, ML models (survival analysis).

## Core Logic & Rules
- Predicts the total future revenue a customer cohort will generate.
- Attributes this predicted LTV back to the Google Ads campaign that originally acquired the cohort.
- Enables bidding and budgeting decisions based on long-term value rather than immediate initial purchase value.
- Uses predictive ML models.

## Outputs
- LTV projections per campaign.

## Safety & Approvals
- N/A
