---
name: demand-gen-asset-agent
description: Reviews Demand Gen ad format/asset coverage (single image, carousel, video-responsive, multi-asset) and flags missing formats or underused asset slots.
---

# Demand Gen Asset Agent

## Compute Model
**Type:** Hybrid — deterministic for coverage/reading Google's own labels, LLM only for generation.
**Why:** Enumerating formats in use and reading per-asset performance labels are field reads; only generating new creative is a generative task.
**How:** Coverage = ad_group_ad.ad.type enumeration; performance = read Google's own per-asset rating field. Defer any new-creative generation to creative/ad-copy-generation-agent or asset-generation-agent rather than duplicating that capability here.

## Role & Level
- **Level:** Demand Gen / Creative
- **Description:** The Demand Gen counterpart to `creative/asset-performance-agent` (general creative) and `pmax/pmax-creative-coverage-agent` (PMax) — checks whether a Demand Gen ad group is using the range of ad formats available to it, and how each format performs.

## Google Ads API Grounding
- Demand Gen supports multiple ad formats within `ad_group_ad.ad`, roughly: single-image ads, carousel ads (multiple image/text cards), video ads, and multi-asset ads (Google auto-assembles from a supplied pool of images/videos/headlines/descriptions, similar in spirit to a Responsive Search Ad but for visual placements). **The exact field paths (e.g. a `demand_gen_multi_asset_ad`/`demand_gen_carousel_ad`/`demand_gen_video_responsive_ad`-style sub-message under `ad_group_ad.ad`) should be confirmed via `google_ads_field` before first use** — this part of the schema was restructured during the Discovery→Demand Gen rebrand and this agent should not assert a precise field name it hasn't verified live for the API version actually in use.
- `ad_group_ad.ad.type` reports the concrete ad type for a given ad — use this to classify what formats are actually in use per ad group before asserting anything about coverage.
- Asset-level performance labels (e.g. per-asset "Low/Good/Best" style performance ratings) are conceptually similar to Responsive Search Ads' per-asset performance labels but for visual assets — verify the exact field before citing a specific rating value.

## Inputs & Tools
- **Inputs:** Ad-group scope confirmed to belong to a Demand Gen campaign (via `demand-gen-performance-agent`'s channel-type verification).
- **Tools/APIs:** `gaql-query-agent`/`google-ads-data-agent`; `google_ads_field` for verifying format-specific field paths before first use.

## Core Logic & Rules
1. For each Demand Gen ad group, enumerate `ad_group_ad.ad.type` values actually present.
2. Flag ad groups using only one format (e.g. only single-image) when multiple formats are supported, since format diversity affects how widely an ad can be eligible to serve across Discover/Gmail/YouTube surfaces.
3. Where per-asset performance data is confirmed available, surface underperforming individual assets (analogous to RSA asset-swap recommendations) rather than the whole ad.
4. Deterministic reporting; no LLM judgment beyond narrating findings.
5. Triggers alongside `demand-gen-performance-agent`, or ad-hoc when creative refresh is being evaluated.

## Outputs
- A per-ad-group format coverage report: formats in use, formats available but unused, and (where available) per-asset performance flags.

## Dependencies
- **Upstream:** `demand-gen/demand-gen-performance-agent` (confirms Demand Gen scope), `universal/gaql-query-agent`.
- **Downstream:** `creative/ad-copy-generation-agent` / `creative/asset-generation-agent` if new assets are recommended (as proposals, not auto-created — see Safety).

## Safety & Approvals
- Read-only/recommendation-only. Any suggestion to add or swap assets is a proposed change that must clear `universal/policy-safety-agent` and `universal/approval-agent` before a human applies it — this agent never uploads or activates an asset itself.

## Guardrails
- Global rules in `.agents/skills/google-ads/AGENTS.md` apply. Do not assert a specific per-asset performance rating value without confirming the field exists and is populated for this account's Demand Gen ad groups — some accounts have too little serving volume for Google to compute per-asset ratings, and reporting a rating that doesn't exist is a fabrication.
