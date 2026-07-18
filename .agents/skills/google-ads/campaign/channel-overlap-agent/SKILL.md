---
name: channel-overlap-agent
description: Detects Performance Max campaigns absorbing traffic that a Search campaign would otherwise serve — a well-documented, common real problem for accounts running both simultaneously, which this account does.
---

# Channel Overlap Agent

## Compute Model
**Type:** Hybrid — deterministic spend/statistics, LLM only for ambiguous category-name matching.
**Why:** The spend/statistics part is deterministic; matching PMax's text category labels against Search's keyword themes is a text-similarity task.
**How:** Default to deterministic keyword/substring overlap heuristics between PMax insight category names and the Search campaign's own keyword list; escalate to LLM/embedding similarity only when category names are ambiguous enough that string matching is inconclusive.

## Role & Level
- **Level:** Campaign (cross-campaign-type)
- **Description:** Performance Max is designed to bid across all of Google's inventory, including queries that closely match a live Search campaign's own keywords — meaning PMax can silently take impressions/conversions that would otherwise have gone to (and been visible in) the Search campaign. This account runs PMax, Search, and Demand Gen simultaneously ([PROJECT_SPEC.md](../../../../../PROJECT_SPEC.md) §4.2), so this overlap is a real, not hypothetical, risk here. `keyword/keyword-cannibalization-agent` only covers overlap *within* keywords in the same campaign type — this agent covers overlap *across* PMax and Search specifically.

## Google Ads API Grounding
- **Search campaigns**: `search_term_view.search_term` gives the actual queries that triggered an ad, joined with `search_term_view.status` and the owning `campaign`/`ad_group`.
- **PMax campaigns**: PMax does not expose per-query search terms the way Search does. Instead, Google introduced **search term *category* insights for PMax** — a resource along the lines of `campaign_search_term_insight`, grouping matched queries into categories rather than exposing raw query strings. **Treat the exact resource/field name as unverified until confirmed via `google_ads_field`** — this is a newer part of the schema (added after the initial PMax launch) and is more likely than older resources to have shifted between API versions.
- Because PMax's query-level visibility is categorical, not literal, this agent **cannot** do a literal string-match overlap check between PMax and Search queries with full precision — it can only compare at the category/theme level (PMax insight categories vs. the themes implied by Search's own keyword list) and flag likely overlap for human judgment, not assert a precise overlap percentage.
- `campaign.advertising_channel_type` distinguishes `PERFORMANCE_MAX` from `SEARCH` campaigns for scoping.
- Brand-term overlap is the most common real instance of this problem: if a Search campaign holds branded exact-match keywords and a PMax campaign in the same account is also eligible to serve on brand queries, PMax often wins the auction due to Smart Bidding's optimization behavior, inflating PMax's apparent ROAS while actually just reallocating traffic that Search was already converting efficiently.

## Inputs & Tools
- **Inputs:** The account's live campaign list scoped by `advertising_channel_type` (PMax and Search), Search's `search_term_view` data, PMax's search term category insights (once verified).
- **Tools/APIs:** `gaql-query-agent`/`google-ads-data-agent`; `google_ads_field` to confirm the PMax search-term-insight resource before first use.

## Core Logic & Rules
1. Identify all enabled PMax and Search campaigns in the account.
2. Pull Search's actual triggering queries via `search_term_view` for the relevant date range.
3. Pull PMax's category-level search insights (once the resource is confirmed) for the same range.
4. Compare Search's branded/high-intent keyword list against PMax's insight categories for thematic overlap — especially brand terms, since that's the highest-value, most common real case.
5. Report likely overlap as a flagged risk with the specific evidence (categories/keywords compared), not as a precise "X% of PMax spend is cannibalized" number this data cannot actually support.
6. Suggest overlap mitigation only as a proposal (e.g. brand exclusion lists at the PMax level) routed through the standard approval pipeline — never applies anything itself.
7. Deterministic comparison logic; may use an LLM only to summarize thematic overlap findings, not to invent a precision the underlying category-level PMax data doesn't have.
8. Triggers on the same cadence as `campaign/campaign-rca-agent`, or ad-hoc when PMax ROAS looks unusually strong relative to Search.

## Outputs
- An overlap risk report: which PMax categories thematically overlap which Search keywords/campaigns, with an explicit confidence caveat (category-level evidence, not query-level proof) — never a bare percentage without that caveat attached.

## Dependencies
- **Upstream:** `master-orchestrator`, `universal/gaql-query-agent`.
- **Downstream:** `pmax/pmax-signal-agent` / `pmax/pmax-optimization-agent` (if exclusion changes are proposed), `universal/policy-safety-agent` → `universal/approval-agent` for any proposed change.

## Safety & Approvals
- Read-only/recommendation-only — any proposed brand exclusion or budget shift requires the standard human approval pipeline.

## Guardrails
- Global rules in `.agents/skills/google-ads/AGENTS.md` apply, especially: never state a precise overlap percentage the underlying PMax category-level data cannot support — this is exactly the kind of confident-sounding but unsupported number the anti-hallucination rules exist to prevent.
