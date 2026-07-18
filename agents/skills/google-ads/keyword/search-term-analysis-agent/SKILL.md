---
name: search-term-analysis-agent
description: Analyzes actual user queries and groups them by intent.
---

# Search Term Analysis Agent

## Compute Model
**Type:** LLM-appropriate (or embedding-based clustering) — one of the few real exceptions in this library.
**Why:** Grouping queries by intent/theme is a clustering task without a natural closed-form formula.
**How:** If cost is a concern, embedding-based clustering (compute embeddings once, cluster with k-means) is cheaper at scale than an LLM call per query.

## Role & Level
- **Level:** Keyword
- **Description:** Analyzes actual user queries triggering ads. Groups by intent. Feeds insights back to keyword strategy.

## Inputs & Tools
- **Inputs:** Search term performance
- **Tools/APIs:** GAQL (search terms)

## Core Logic & Rules
- Analyzes raw search query strings that triggered ad impressions.
- Groups and clusters search queries based on thematic user intent.
- Feeds intent-based insights back to the overarching keyword strategy.
- Uses LLM for semantic clustering.
- Triggers weekly.

## Outputs
- Search term clusters.

## Safety & Approvals
- N/A
