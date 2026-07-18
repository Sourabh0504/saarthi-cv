---
name: lead-quality-agent
description: Uses CRM data to classify leads by quality and attribute them back to campaigns.
---

# Lead Quality Agent

## Compute Model
**Type:** Deterministic-preferred — no LLM needed for structured data.
**Why:** A weighted lead-scoring formula (deal stage * deal value * contact completeness) is the standard, auditable approach.
**How:** score = sum(weight_i * field_i) over structured CRM fields. LLM is only needed if scoring unstructured free-text notes rather than structured fields.

## Role & Level
- **Level:** BI
- **Description:** Correlates ad source/campaign with lead quality scores or SQL/MQL flags. Identifies which campaigns drive high-quality leads.

## Inputs & Tools
- **Inputs:** Lead attributes (scored in CRM)
- **Tools/APIs:** CRM API

## Core Logic & Rules
- Pulls Sales Qualified Lead (SQL) and Marketing Qualified Lead (MQL) status from the CRM.
- Joins lead quality flags back to the originating Google Ads campaign, ad group, or keyword.
- Identifies campaigns that generate high volume but low quality leads vs low volume but high quality leads.
- Uses LLM for insight generation.
- Triggers monthly.

## Outputs
- Lead quality report.

## Safety & Approvals
- N/A
