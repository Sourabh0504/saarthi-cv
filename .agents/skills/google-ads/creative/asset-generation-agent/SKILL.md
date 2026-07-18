---
name: asset-generation-agent
description: Suggests new images or videos for campaigns.
---

# Asset Generation Agent

## Compute Model
**Type:** LLM/generative-model required — one of the few real exceptions in this library.
**Why:** Suggesting new images/videos is inherently generative.
**How:** N/A.

## Role & Level
- **Level:** Creative
- **Description:** Suggests new images or videos (with tools or prompts) for campaigns (especially PMax/Demand Gen).

## Inputs & Tools
- **Inputs:** Asset performance gaps, campaign context.
- **Tools/APIs:** Image/Video generation tools or prompt generation logic.

## Core Logic & Rules
- Identifies missing visual assets in highly visual campaigns (PMax, Demand Gen).
- Generates specific prompts for human designers or AI image generators to fill asset gaps.
- Ensures requested dimensions and styles match Google Ads requirements.
- Uses LLM for prompt generation.

## Outputs
- Asset creation briefs and prompts.

## Safety & Approvals
- N/A
