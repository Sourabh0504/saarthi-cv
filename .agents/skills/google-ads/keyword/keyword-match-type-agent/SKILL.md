---
name: keyword-match-type-agent
description: Balances exact, phrase, and broad matches to maximize reach.
---

# Keyword Match-Type Agent

## Compute Model
**Type:** Deterministic — no LLM needed.
**Why:** Match-type distribution and overlap-rate analysis is arithmetic over existing keyword records.
**How:** count/ratio of EXACT:PHRASE:BROAD per ad group; compare against a configured target mix.

## Role & Level
- **Level:** Keyword
- **Description:** Balances exact/phrase/broad matches to maximize reach without losing intent.

## Inputs & Tools
- **Inputs:** Current keyword match types and search term performance.
- **Tools/APIs:** GAQL.

## Core Logic & Rules
- Reviews the distribution of match types (Exact, Phrase, Broad).
- Suggests upgrading strong Phrase keywords to Broad (with smart bidding) or locking down broad queries to Exact if CPA is poor.
- Operates deterministically.
- Triggers weekly.

## Outputs
- Match-type adjustment recommendations.

## Safety & Approvals
- N/A
