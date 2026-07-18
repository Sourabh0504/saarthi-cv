---
name: auction-insights-agent
description: Reports impression-share and competitive-position metrics (rank/budget lost impression share) for Search and Display campaigns, with an explicit limitation note on what competitor-level Auction Insights data the API does and doesn't expose.
---

# Auction Insights Agent

## Compute Model
**Type:** Deterministic — no LLM needed.
**Why:** It only reads and compares Google's own impression-share metric fields.
**How:** dominant_loss_driver = 'budget' if search_budget_lost_impression_share > search_rank_lost_impression_share else 'rank' — a pure comparison.

## Role & Level
- **Level:** Campaign
- **Description:** Answers "did we lose volume because of our own targeting/budget choices, or because we lost the auction to competitors/rank/budget constraints" — a distinct question from `campaign/root-cause-analysis-agent`'s broader RCA, and one with real, well-defined API fields behind it that no existing agent explicitly owns.

## Google Ads API Grounding
- **Fields available via the standard API (own-campaign metrics, real and reliable):**
  - `metrics.search_impression_share` — the share of eligible auctions this campaign's ads actually showed in, for Search.
  - `metrics.search_budget_lost_impression_share` — share of impressions lost specifically due to budget constraints.
  - `metrics.search_rank_lost_impression_share` — share lost due to poor Ad Rank (bid × Quality Score × expected impact of extensions/formats).
  - `metrics.search_top_impression_share` / `metrics.search_absolute_top_impression_share` — share of impressions shown in the top / absolute-top position specifically.
  - `metrics.content_impression_share`, `metrics.content_budget_lost_impression_share`, `metrics.content_rank_lost_impression_share` — the Display-network equivalents.
- **What is NOT reliably exposed via the standard Google Ads API — a real, important limitation:** the full competitor-identity "Auction Insights" report (who else you're bidding against by domain, overlap rate, position-above rate, outranking share against a *named* competitor) has historically been a UI/export-only report, not a queryable GAQL resource. **Do not claim this agent can produce a competitor-by-name breakdown via API** unless that's been freshly confirmed against the current API version via `google_ads_field` — the safe default assumption is that only the account's own impression-share metrics above are available programmatically, and named-competitor detail requires a manual UI export the human operator would need to provide.
- Impression share fields are only meaningful with sufficient volume — very low-impression campaigns can show noisy or `--`/null impression-share values; report that as "insufficient volume for a reliable impression-share reading," not as 0%.

## Inputs & Tools
- **Inputs:** Campaign scope + date range for Search/Display campaigns.
- **Tools/APIs:** `gaql-query-agent`/`google-ads-data-agent` for the `metrics.search_*`/`metrics.content_*` fields above.

## Core Logic & Rules
1. Pull the impression-share family of metrics for the requested campaign(s)/date range.
2. Classify the dominant loss driver: budget-constrained (`*_budget_lost_impression_share` is the larger term) vs. rank-constrained (`*_rank_lost_impression_share` is larger) — this is a directly useful, mechanically simple diagnostic that feeds `campaign/root-cause-analysis-agent` and `campaign/campaign-rca-agent`.
3. If asked for named-competitor detail, state the API limitation above rather than fabricating competitor names or overlap percentages.
4. Flag low-volume campaigns where impression share is statistically unreliable rather than reporting a misleadingly precise number.
5. Deterministic; no LLM judgment beyond narrating which loss driver dominates.
6. Triggers alongside campaign performance reporting, or ad-hoc during RCA.

## Outputs
- Impression share + budget-lost/rank-lost breakdown per campaign, with the dominant loss driver called out, and an explicit note whenever competitor-identity detail was requested but isn't available via this agent's API access.

## Dependencies
- **Upstream:** `master-orchestrator`, `universal/gaql-query-agent`.
- **Downstream:** `campaign/root-cause-analysis-agent`, `campaign/campaign-rca-agent`, `campaign/campaign-budget-agent` (if budget-constrained), `campaign/campaign-bidding-agent` (if rank-constrained).

## Safety & Approvals
- Read-only; no mutation capability.

## Guardrails
- Global rules in `.agents/skills/google-ads/AGENTS.md` apply. Specifically: never invent a named-competitor overlap number — this is one of the clearest places an agent could confidently hallucinate a plausible-sounding but entirely fabricated competitive-intelligence claim.
