---
name: pmax-listing-feed-agent
description: Ensures Shopping feed and listing groups are structured correctly under PMax.
---

# PMax Listing/Feed Agent

## Compute Model
**Type:** Deterministic — no LLM needed.
**Why:** Listing-group structure checks are structural/coverage checks.
**How:** Verify listing_group_filter hierarchy covers the full product catalog with no orphaned/uncategorized products — a completeness check, not a judgment call.

## Role & Level
- **Level:** PMax
- **Description:** Ensures Shopping feed/listing groups are structured correctly under PMax (for retail campaigns).

## Inputs & Tools
- **Inputs:** PMax listing group configurations, Merchant Center feed data.
- **Tools/APIs:** GAQL.

## Core Logic & Rules
- Reviews how products are subdivided in the PMax listing groups (e.g. by brand, item ID, custom label).
- Ensures that all desired products from the Merchant Center feed are actively covered by a listing group.
- Flags "Everything Else" groups if they consume too much budget without specific segmentation.
- Operates deterministically.

## Outputs
- Listing group structure recommendations.

## Safety & Approvals
- N/A
