---
name: campaign-budget-agent
description: Checks if campaign is underspending or exhausting budget early. Recommends budget adjustments.
---

# Campaign Budget Agent

## Compute Model
**Type:** Deterministic — no LLM needed.
**Why:** Same spend/budget arithmetic family as budget-pacing-agent.
**How:** Flag underspend/exhaustion using the utilization ratio, cross-checked against search_budget_lost_impression_share for corroboration.

## Role & Level
- **Level:** Campaign
- **Description:** Checks if campaign is underspending or exhausting budget early. Recommends budget ↑/↓ to achieve delivery goals.

## Inputs & Tools
- **Inputs:** Budget vs spend data, pacing rate
- **Tools/APIs:** GAQL (spend, avg_cpc)

## Core Logic & Rules
- Analyzes spend data against the campaign's allocated budget.
- Checks for early budget exhaustion or significant underspending.
- Recommends budget increases or decreases to optimize delivery.
- Operates deterministically (No LLM).
- Triggers daily.

## Outputs
- Budget adjustment suggestions.

## Safety & Approvals
- Approval required for any budget changes.
