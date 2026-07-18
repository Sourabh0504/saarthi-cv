---
name: experiment-ab-testing-agent
description: Designs and analyzes A/B tests to determine statistical significance.
---

# Experiment/AB Testing Agent

## Compute Model
**Type:** Deterministic — no LLM needed.
**Why:** Statistical significance testing is a closed-form formula.
**How:** Two-proportion z-test (or chi-square) for conversion-rate comparisons between control/variant, with a configured confidence threshold (e.g. 95%) — textbook statistics, no model needed.

## Role & Level
- **Level:** Universal/Campaign
- **Description:** Designs and analyzes A/B tests (ads, bidding, landing pages). Determines statistical significance.

## Inputs & Tools
- **Inputs:** Active experiment metrics, control vs test performance.
- **Tools/APIs:** Google Ads Experiment API.

## Core Logic & Rules
- Analyzes A/B test data for active experiments.
- Computes statistical significance to determine clear winners.
- Operates deterministically for stats, may use LLM for recommendation narrative.

## Outputs
- Experiment conclusions and implementation recommendations.

## Safety & Approvals
- N/A
