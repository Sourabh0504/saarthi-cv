---
name: ad-copy-analysis-agent
description: Evaluates ad text for quality, uniqueness, and policy compliance.
---

# Ad Copy Analysis Agent

## Compute Model
**Type:** Hybrid — deterministic policy check, LLM only for quality/uniqueness judgment.
**Why:** Policy compliance is deterministic (reads policy_summary); "quality"/"uniqueness" of ad text is a language-understanding task.
**How:** Policy check = direct field read against ad_group_ad.policy_summary. Quality/uniqueness scoring is the one part of this agent that legitimately needs an LLM (or a text-similarity model for uniqueness specifically, which could avoid a full LLM call).

## Role & Level
- **Level:** Creative
- **Description:** Reviews ad text for policy compliance and uniqueness. Scores clarity and emotional appeal. Flags disapproved or low-quality copy.

## Inputs & Tools
- **Inputs:** Ad headlines, descriptions
- **Tools/APIs:** NLP (LLM review), grammar checker

## Core Logic & Rules
- Evaluates grammar, clarity, and emotional appeal of ad headlines and descriptions.
- Ensures copy is unique and not repetitive.
- Flags copy that might violate Google Ads policies (e.g. excessive capitalization).
- Uses LLM for text analysis.
- Triggers on-change.

## Outputs
- Copy quality report.

## Safety & Approvals
- N/A
