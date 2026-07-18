---
name: negative-keyword-agent
description: Identifies irrelevant or low-conversion search terms to exclude.
---

# Negative Keyword Agent

## Compute Model
**Type:** Hybrid — deterministic threshold first, LLM only for ambiguous relevance judgment.
**Why:** Low-conversion flagging is deterministic; judging semantic "irrelevance" of a query to the product benefits from language understanding.
**How:** Apply the deterministic threshold first (spend > X, conversions = 0 over N clicks); only escalate to LLM/keyword-overlap-against-product-taxonomy judgment for queries that pass the spend threshold but aren't obviously off-topic by simple keyword matching.

## Role & Level
- **Level:** Keyword
- **Description:** Identifies irrelevant or low-conversion search terms to exclude. Updates negative keyword lists.

## Inputs & Tools
- **Inputs:** Search terms report
- **Tools/APIs:** GAQL (search_term_view)

## Core Logic & Rules
- Scans actual search terms that triggered ads.
- Identifies terms that are irrelevant to the business or have spent significant budget without converting.
- Formulates additions to negative keyword lists.
- Operates deterministically for stats (No LLM required for basic exclusions).
- Triggers weekly.

## Outputs
- Negative keyword additions.

## Safety & Approvals
- Approval required for negative keyword additions.
