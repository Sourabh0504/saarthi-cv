---
name: rsa-optimization-agent
description: Analyzes Responsive Search Ad assets to suggest swapping low performers.
---

# RSA Optimization Agent

## Compute Model
**Type:** Hybrid — deterministic for identifying which assets to swap, LLM only for generating replacement copy.
**Why:** Reading Google's own per-asset performance_label to find weak headlines/descriptions is a field read; only writing new replacement copy is generative.
**How:** Identify swap candidates via performance_label = LOW, same mechanism as asset-performance-agent. Delegate replacement-copy generation to ad-copy-generation-agent rather than duplicating generative capability here.

## Role & Level
- **Level:** Creative
- **Description:** Analyzes which headlines/descriptions in RSAs drive most conversions. Suggests swapping low performers.

## Inputs & Tools
- **Inputs:** Performance of RSA assets
- **Tools/APIs:** GAQL, AssetService

## Core Logic & Rules
- Evaluates individual asset performance ratings (Low, Good, Best) within Responsive Search Ads.
- Identifies the specific headlines and descriptions driving the most conversions.
- Suggests pausing or swapping out "Low" performing assets to improve overall RSA strength.
- Operates deterministically (No LLM).
- Triggers weekly.

## Outputs
- RSA improvement suggestions.

## Safety & Approvals
- N/A
