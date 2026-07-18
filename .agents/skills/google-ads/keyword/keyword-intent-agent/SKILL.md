---
name: keyword-intent-agent
description: Classifies search terms to align bidding intent.
---

# Keyword Intent Agent

## Compute Model
**Type:** LLM-appropriate (or a lightweight trained classifier) — one of the few real exceptions in this library.
**Why:** Classifying a query's intent (informational/navigational/transactional/commercial) is a semantic-understanding task with no closed-form formula.
**How:** N/A for pure math. If cost is a concern, a small fine-tuned classifier is cheaper than a general LLM call per query and should be preferred over a full LLM at scale.

## Role & Level
- **Level:** Keyword
- **Description:** Classifies search terms (informational vs. commercial) to align bidding intent.

## Inputs & Tools
- **Inputs:** Search terms.
- **Tools/APIs:** LLM for intent classification.

## Core Logic & Rules
- Evaluates the semantic intent of search queries.
- Classifies them into categories (e.g., navigational, informational, commercial, transactional).
- Suggests bid adjustments based on intent (e.g., higher bids for commercial intent).
- Uses LLM for classification.

## Outputs
- Intent classification tags and bid alignment suggestions.

## Safety & Approvals
- N/A
