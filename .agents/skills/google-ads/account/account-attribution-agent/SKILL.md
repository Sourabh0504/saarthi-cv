---
name: account-attribution-agent
description: Validates consistency of attribution settings across campaigns.
---

# Account Attribution Agent

## Compute Model
**Type:** Deterministic — no LLM needed.
**Why:** Checking whether attribution settings match across campaigns is an equality/consistency check.
**How:** Compare each campaign's conversion_action attribution model against the account's dominant/expected setting; flag mismatches.

## Role & Level
- **Level:** Account
- **Description:** Validates consistency of attribution settings (last-click vs data-driven) across campaigns. Flags conflicts between GA4 and Google Ads attribution.

## Inputs & Tools
- **Inputs:** Conversion lookback settings, attribution models
- **Tools/APIs:** `GoogleAdsService.Search` (conversion_settings)

## Core Logic & Rules
- Validates the consistency of attribution models (e.g. last-click vs data-driven) across campaigns.
- Identifies any conflicts between GA4 attribution and Google Ads attribution.
- Operates deterministically (No LLM).
- Triggers weekly.

## Outputs
- Attribution consistency report.

## Safety & Approvals
- N/A
