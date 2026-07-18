---
name: keyword-cannibalization-agent
description: Detects when the same search query is serviced by more than one active keyword resource within a campaign type over time — fragmenting spend, conversions, and Quality Score history that would otherwise consolidate under one keyword.
---

# Keyword Cannibalization Agent

## Compute Model
**Type:** Deterministic — no LLM needed.
**Why:** Fragmentation detection is grouping and counting over structured query results, not language judgment.
**How:** Group `search_term_view` rows by `search_term_view.search_term`; flag terms with more than one distinct active `(segments.keyword.info.text, match_type)` pair; rank by combined `metrics.cost_micros` and match-type severity.

## Role & Level
- **Level:** Keyword
- **Description:** Finds cases where an account's own keyword coverage is redundant enough that the same underlying user query ends up triggering different keyword resources at different times, splitting that query's performance data across them instead of concentrating it under the single best-matching keyword. Complementary to `campaign/channel-overlap-agent` (which covers the cross-campaign-type version of this problem, PMax vs. Search); this agent covers overlap *within* one campaign type's keyword set — normally Search.

## ⚠️ What "Cannibalization" Actually Means Here — a Common Misconception to Avoid
**Two of an advertiser's own keywords never compete against each other within a single auction** — only one ad per advertiser can show per auction, so there is no literal "keyword A and keyword B bid against each other and one loses" event happening live. What actually happens, and what this agent should describe precisely: across **different auctions over time**, the same search query can be matched by **different keyword resources** in the account (most often because a broad- or phrase-match keyword picks up a query on some occurrences while a narrower exact-match keyword picks it up on others, or because a similar query lands in different ad groups/campaigns). The real cost isn't double-bidding — it's **fragmentation**: the same query's clicks/conversions/Quality-Score-relevant history get split across multiple keyword resources instead of concentrating under the one keyword best suited to own it, which can suppress Quality Score and dilute performance signal for all of them individually. Report it as fragmentation, not as literal internal bidding competition.

## Google Ads API Grounding
- **The query pattern that actually surfaces this** — `search_term_view` queried together with the `segments.keyword` segment, which reports which specific keyword (text + match type) triggered each search-term row:
  ```sql
  SELECT search_term_view.search_term,
         segments.keyword.info.text,
         segments.keyword.info.match_type,
         campaign.id, campaign.name, ad_group.id, ad_group.name,
         metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions
  FROM search_term_view
  WHERE segments.date DURING LAST_30_DAYS
  ORDER BY search_term_view.search_term
  ```
  Verify this exact field combination (`segments.keyword.info.*` alongside `search_term_view`) via `google_ads_field`/`selectable_with` before relying on it, per the standard field-verification workflow in `universal/gaql-query-agent` — this is a specific segment/resource pairing, not a general guarantee that any segment works with any resource.
- **Detection logic**: group the results by `search_term_view.search_term`; a search term with more than one distinct `(segments.keyword.info.text, segments.keyword.info.match_type)` pair across its rows (within the scope being checked — one campaign, one ad group, or account-wide, depending on what's being audited) is a fragmentation candidate.
- **Match type matters for severity**: `segments.keyword.info.match_type` values are `EXACT`, `PHRASE`, `BROAD` (verify current enum set live). A broad-match keyword catching a query that an exact-match keyword in the same ad group also targets is the highest-value case to flag — it's the most directly fixable (add the query as a negative on the broad keyword's scope, or tighten match type) and usually the clearest sign of avoidable fragmentation, as opposed to two similarly-broad keywords in unrelated ad groups incidentally overlapping on a rare query, which is lower priority.
- **Cross-ad-group and cross-campaign scope**: fragmentation can occur within one ad group, across ad groups in the same campaign, or across campaigns — the detection query above should be run at whichever scope the request calls for; account-wide runs are more expensive and noisier, so default to campaign-level unless asked for a full account sweep.
- **`ad_group_criterion.status`**: only compare active (`ENABLED`) keywords — a paused or removed keyword still appearing in historical `search_term_view` rows isn't a live fragmentation problem, just history.

## Inputs & Tools
- **Inputs:** Campaign/ad-group scope + date range to audit.
- **Tools/APIs:** `gaql-query-agent`/`google-ads-data-agent` for the `search_term_view` + `segments.keyword` query above.

## Core Logic & Rules
1. Run the search-term + triggering-keyword query for the requested scope and date range.
2. Group by `search_term_view.search_term`; identify terms matched by more than one distinct active keyword.
3. Rank flagged terms by combined `metrics.cost_micros` across the fragmenting keywords (highest-spend fragmentation first) and by match-type severity (broad-catching-exact-territory ranks above two broad keywords overlapping rarely).
4. Recommend a fix per flagged term: consolidate spend onto the best-performing keyword (typically the most specific match type with the strongest conversion history) via a negative keyword on the broader competitor, or refine match types — framed as a **proposal**, not applied.
5. Deterministic grouping/ranking logic; no LLM judgment needed beyond narrating the recommendation.
6. Default trigger cadence: weekly, or ad-hoc when requested as part of account structure review.

## Outputs
- A fragmentation report: search term, the competing keyword resources (text + match type + which ad group/campaign), combined cost, and a recommended consolidation action — never framed as "these keywords bid against each other," per the misconception note above.

## Dependencies
- **Upstream:** `master-orchestrator`, `universal/gaql-query-agent`.
- **Downstream:** `keyword/negative-keyword-agent` (if a negative is the recommended fix), `keyword/keyword-match-type-agent` (if match-type refinement is recommended), `universal/policy-safety-agent` → `universal/approval-agent` for any proposed change.

## Safety & Approvals
- Read-only/recommendation-only — never adds a negative keyword or changes a match type itself; any fix is a proposed change through the standard human approval pipeline.

## Guardrails
- Global rules in `.agents/skills/google-ads/AGENTS.md` apply. Specifically: never describe this as live auction-time competition between the account's own keywords — that's not how Google Ads auctions work for a single advertiser, and stating it that way is exactly the kind of plausible-sounding but mechanically wrong claim these rules exist to prevent.
