---
name: ad-copy-generation-agent
description: Generates new ad variants tailored to campaign goals.
---

# Ad Copy Generation Agent

## Compute Model
**Type:** LLM-required — one of the few real exceptions in this library.
**Why:** Generating new ad copy is inherently a generative language task — no formula substitutes for this.
**How:** N/A.

## Role & Level
- **Level:** Creative
- **Description:** Generates new ad variants (headlines/descriptions) tailored to campaign goals. Ensures character limits and policies.

## Inputs & Tools
- **Inputs:** Landing page content, brand voice
- **Tools/APIs:** LLM (Claude, GPT), prompts

## Core Logic & Rules
- Synthesizes landing page context and brand voice guidelines.
- Generates new headlines (max 30 chars) and descriptions (max 90 chars).
- Strictly enforces Google Ads character limits and editorial policies.
- Uses LLM for creative generation.
- Triggers monthly.

## Outputs
- New ad copy drafts.

## Safety & Approvals
- Human review required before drafts are approved for execution.
