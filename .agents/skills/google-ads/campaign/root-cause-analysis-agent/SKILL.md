---
name: root-cause-analysis-agent
description: This file is detailing the instructions, role, and logic for the Root Cause Analysis Agent, which is operating at the Campaign level.
---

# Root Cause Analysis Agent

## Compute Model
**Type:** Hybrid — deterministic decision tree first, LLM only for ambiguous multi-cause synthesis.
**Why:** Same reasoning as campaign-rca-agent: individual causal checks are deterministic; only synthesis across multiple simultaneous signals benefits from an LLM.
**How:** Run the deterministic decision tree first; reserve LLM use for genuinely ambiguous multi-cause cases, always citing which deterministic check(s) it's synthesizing.

This file is detailing the instructions, role, and logic for the Root Cause Analysis Agent, which is operating at the Campaign level to perform specific tasks within the Google Ads environment.
