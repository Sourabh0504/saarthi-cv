---
name: demand-gen-performance-agent
description: Analyzes Demand Gen (formerly Discovery) campaign performance across Discover, Gmail, and YouTube in-feed/Shorts placements — a real Campaign_Type in this account's data with no dedicated agent coverage until now.
---

# Demand Gen Performance Agent

## Compute Model
**Type:** Deterministic — no LLM needed.
**Why:** Metric reporting/comparison, same arithmetic family as campaign-performance-agent.
**How:** Standard metric aggregation and %-change comparison over the verified Demand Gen channel-type scope.

## Role & Level
- **Level:** Demand Gen / Campaign
- **Description:** Covers Demand Gen campaigns specifically. `DGen` is one of only three `Campaign_Type` values in this account's actual CampaignPerf sheet schema ([PROJECT_SPEC.md](../../../../../PROJECT_SPEC.md) §4.2, alongside PMax and Search) — despite that, no agent in this library previously named Demand Gen at all.

## Google Ads API Grounding
- **Naming history — verify before citing:** Google rebranded "Discovery ads/campaigns" to "Demand Gen" in 2024. The current `campaign.advertising_channel_type` enum value is expected to be `DEMAND_GEN`; older/historical data or older API versions may still use the prior `DISCOVERY` value. **Confirm the exact live enum value via `google_ads_field` or by inspecting an actual `campaign.advertising_channel_type` result for this account before assuming either name** — do not hardcode one without checking, since this is a genuinely renamed API surface and asserting the wrong one is a textbook hallucination risk this library is trying to eliminate.
- **Structure:** unlike Performance Max's `asset_group` model, Demand Gen campaigns retain the classic `campaign` → `ad_group` → `ad_group_ad` hierarchy — so `ad_group`-level and `ad_group_ad`-level fields generally apply the same way they do for Search, once the campaign-type filter is correct.
- **Placements:** Discover feed, Gmail (Promotions/Social tabs), YouTube in-feed, and YouTube Shorts. No placement-level breakdown as granular as Display's managed placements — expect `segments.ad_network_type`-style network segmentation rather than individual placement reporting; verify the exact segment values available for this channel type via `google_ads_field` before building a report that assumes Search-style network segments apply unchanged.
- **Targeting:** audience-based (optimized targeting plus first- and third-party audience segments), not keyword-based — closer in spirit to PMax's non-keyword targeting model than to Search. Do not query `ad_group_criterion.keyword.*` for Demand Gen ad groups expecting keyword data the way you would for Search.
- **Metrics:** standard `metrics.*` fields (impressions, clicks, cost_micros, conversions) generally apply; video-specific metrics (e.g. view-through style metrics) may apply to video-format Demand Gen ads specifically — verify which metrics are populated (non-null/non-zero) for this campaign type rather than assuming full metric parity with Search.

## Inputs & Tools
- **Inputs:** Campaign-level scope filtered to the confirmed Demand Gen channel-type value.
- **Tools/APIs:** `gaql-query-agent` (build the filtered query, verifying the channel-type enum first), `google-ads-data-agent` (execute).

## Core Logic & Rules
1. Confirm the live `advertising_channel_type` value in use for this account's Demand Gen campaigns before running any further query (per Grounding above).
2. Pull standard performance metrics (impressions, clicks, cost, conversions, CTR, CPC, CPA) scoped to that channel type.
3. Compare trend and efficiency against the account's Search and PMax campaigns using the same metrics, since Demand Gen typically serves an upper/mid-funnel role rather than direct-response — frame comparisons accordingly rather than penalizing Demand Gen for a lower conversion rate than Search without that context.
4. Deterministic reporting; no LLM judgment beyond narrating the comparison framing above.
5. Triggers on the same cadence as `campaign/campaign-performance-agent`.

## Outputs
- A Demand Gen-scoped performance report: metrics by campaign/ad group, with the confirmed channel-type value cited so downstream agents know it was verified, not assumed.

## Dependencies
- **Upstream:** `master-orchestrator`, `universal/gaql-query-agent`.
- **Downstream:** `campaign/campaign-performance-agent` (rolls into overall campaign reporting), `demand-gen/demand-gen-asset-agent` (asset-level detail).

## Safety & Approvals
- Read-only; no mutation capability.

## Guardrails
- Global rules in `.agents/skills/google-ads/AGENTS.md` apply. Specifically: never assume `DEMAND_GEN` vs `DISCOVERY` without checking — this is the single most likely hallucination trap for this agent given the recent rebrand.
