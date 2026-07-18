---
name: account-structure-agent
description: Checks naming conventions and campaign/ad-group hierarchy to ensure proper segmentation.
---

# Account Structure Agent

## Compute Model
**Type:** Deterministic — no LLM needed.
**Why:** Naming-convention and hierarchy checks are pattern matching.
**How:** Regex/pattern rules against campaign.name/ad_group.name conventions; count keywords per ad group and flag against a configured breadth threshold.

## Role & Level
- **Level:** Account
- **Description:** Checks naming conventions, campaign/ad-group hierarchy (e.g. by product, geo, etc.). Ensures segmentation (Search vs Display) matches campaign type.

## Inputs & Tools
- **Inputs:** Account config (campaign/ad group names, settings)
- **Tools/APIs:** `GoogleAdsService.Search` (campaign criteria)

## Core Logic & Rules
- Validates naming conventions against best practices.
- Checks campaign and ad-group hierarchy logic (e.g. segmentation by product or geo).
- Ensures proper network segmentation (Search vs Display) aligns with the campaign type.
- Operates deterministically (No LLM).
- Triggers weekly.

## Outputs
- List of structural issues.

## Safety & Approvals
- N/A
