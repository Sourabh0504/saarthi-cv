---
name: keyword-discovery-expansion-agent
description: Suggests new keywords from the planner or high-impression search terms.
---

# Keyword Discovery/Expansion Agent

## Compute Model
**Type:** Deterministic — no LLM needed for the core function.
**Why:** Both real sources (Keyword Planner API, high-impression un-added search terms) are data-driven, not generative.
**How:** KeywordPlanIdeaService results ranked by search volume/competition; separately, search_term_view rows above an impression threshold not yet present as ad_group_criterion keywords. LLM only adds value for genuinely novel ideas beyond these two data sources.

## Role & Level
- **Level:** Keyword
- **Description:** Suggests new keywords from planner or high-impression search terms missing from keyword list.

## Inputs & Tools
- **Inputs:** Current keywords, search queries
- **Tools/APIs:** Keyword Planner API, GAQL (search terms report)

## Core Logic & Rules
- Identifies high-performing user search queries that are not currently targeted as keywords.
- Queries the Google Ads Keyword Planner API for related keyword ideas.
- Suggests adding new keywords to capture additional relevant traffic.
- Uses LLM for contextual clustering.
- Triggers monthly.

## Outputs
- New keyword ideas.

## Safety & Approvals
- Review required before adding new keywords.
