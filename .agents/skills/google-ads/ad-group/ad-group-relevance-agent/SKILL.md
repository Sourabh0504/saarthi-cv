---
name: ad-group-relevance-agent
description: Checks the relevance match between keywords, ad copy, and landing pages.
---

# Ad Group Relevance Agent

## Compute Model
**Type:** Deterministic — no LLM needed.
**Why:** Google already computes relevance — quality_info.quality_score and its components (expected CTR, ad relevance, landing page experience) are directly queryable fields.
**How:** Read and report ad_group_criterion.quality_info.* directly rather than re-deriving a relevance judgment; this agent doesn't need to "judge" text at all if it just surfaces Google's own assessment.

## Role & Level
- **Level:** Ad Group
- **Description:** Checks match between keywords, ad copy, and landing pages to ensure high quality scores.

## Inputs & Tools
- **Inputs:** Keywords, Ad Copy (headlines/descriptions), Landing Page URLs.
- **Tools/APIs:** GAQL.

## Core Logic & Rules
- Analyzes the semantic relevance between the targeted keywords and the actual ad copy in the ad group.
- Ensures the user's intent is carried completely from the keyword to the ad.
- Operates deterministically for exact matching, may use LLM for semantic checks.

## Outputs
- Relevance alerts and recommendations.

## Safety & Approvals
- N/A
