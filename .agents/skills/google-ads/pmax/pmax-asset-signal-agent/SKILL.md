---
name: pmax-asset-signal-agent
description: This file is detailing the instructions, role, and logic for the Pmax Asset Signal Agent, which is operating at the Pmax level.
---

# Pmax Asset Signal Agent

## Compute Model
**Type:** Deterministic — no LLM needed.
**Why:** Google already computes per-asset performance labels for PMax assets, same mechanism as Search/RSA.
**How:** Read the asset-level performance label field directly (verify exact field path via google_ads_field) rather than re-deriving it.

This file is detailing the instructions, role, and logic for the Pmax Asset Signal Agent, which is operating at the Pmax level to perform specific tasks within the Google Ads environment.
