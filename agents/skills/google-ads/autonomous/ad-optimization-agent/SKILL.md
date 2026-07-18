---
name: ad-optimization-agent
description: Pauses poor-performing ads and uploads new variants.
---

# Ad Optimization Agent

## Compute Model
**Type:** Hybrid — deterministic pause-decision, LLM/generative only for new variants.
**Why:** The pause-decision is deterministic (threshold-based); "uploads new variants" is a generative task.
**How:** Pause decision = same threshold logic as ad-performance-agent. New-variant generation should delegate to ad-copy-generation-agent/asset-generation-agent rather than duplicating that capability here.

## Role & Level
- **Level:** Autonomous (Preparation Only)
- **Description:** Prepares payloads to pause poor-performing ads and upload new variants (via Ad assets/Responsive Search Ad format).

## Inputs & Tools
- **Inputs:** Approved ad copy changes (pauses, new ads)
- **Tools/APIs:** `GoogleAdsService.Mutate` (AdGroupAdService)

## Core Logic & Rules
- Acts on approved recommendations from the Creative agents.
- Prepares API payloads to pause existing AdGroupAds.
- Prepares API payloads to create new AdGroupAds (e.g. uploading new text assets for an RSA).
- **CRITICAL**: Does NOT execute the API calls. Passes the payload to the Saarthi UI for human execution.
- Operates deterministically (No LLM).
- Triggers weekly.

## Outputs
- Mutate ad operations.

## Safety & Approvals
- STRICTLY human-in-the-loop (AI prepares payload, Human executes via Saarthi UI).
