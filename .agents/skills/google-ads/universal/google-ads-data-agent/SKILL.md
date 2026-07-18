---
name: google-ads-data-agent
description: Fetches raw data via the Google Ads API's GoogleAdsService (Search/SearchStream) across customers and accounts, handling pagination, partial failures, and MCC traversal.
---

# Google Ads Data Agent

## Compute Model
**Type:** Deterministic — no LLM needed.
**Why:** Pure API I/O — pagination, retries, caching are control flow, not language understanding.
**How:** Execute the given GAQL query via Search/SearchStream; no computation beyond request/response handling.

## Role & Level
- **Level:** Universal / All
- **Description:** The only agent that talks to the Google Ads API directly. Every other agent that needs raw data goes through this one (or through `universal/gaql-query-agent`, which builds the query this agent then executes) rather than calling the API itself — this keeps caching, pagination, and error handling in one place.

## Google Ads API Grounding
- **Service:** `GoogleAdsService`, two RPCs:
  - `Search` — paginated. Returns a `results` page plus a `next_page_token`; the client re-requests with that token until it comes back empty. Suitable for interactive/bounded queries.
  - `SearchStream` — returns results as a stream of batches (no page tokens). Preferred for large pulls (e.g. a full account's daily campaign metrics) since it avoids repeated round trips.
- **Core resources this agent fetches from** (non-exhaustive — always confirm an unfamiliar field via `google_ads_field` per the Guardrails below, not from memory):
  - `customer` — the account itself (`customer.id`, `customer.descriptive_name`, `customer.currency_code`, `customer.time_zone`).
  - `customer_client` — for MCC (manager account) traversal: `customer_client.id`, `customer_client.descriptive_name`, `customer_client.manager`, `customer_client.level`, `customer_client.status`. Used by `mcc/*` agents to enumerate child accounts before fanning out per-account queries.
  - `campaign`, `campaign_budget`, `ad_group`, `ad_group_ad`, `ad_group_criterion` (keywords & other criteria), `asset_group` / `asset_group_asset` (Performance Max), `keyword_view`, `search_term_view`, `geographic_view`, `click_view`, `conversion_action`, `change_event`, `label`, `recommendation`.
  - `metrics.*` (e.g. `metrics.impressions`, `metrics.clicks`, `metrics.cost_micros`, `metrics.conversions`, `metrics.all_conversions`, `metrics.ctr`, `metrics.average_cpc`) and `segments.*` (e.g. `segments.date`, `segments.device`, `segments.ad_network_type`) attach to most of the resources above when the resource/field combination is documented as compatible — this agent does not assume compatibility, it checks it (see `gaql-query-agent`).
- **Units:** All currency metrics come back as `_micros` (1,000,000 micros = 1 unit of the account's currency, per `customer.currency_code`). This agent returns micros as-is; conversion to display currency is the caller's job — never silently divide/round inside this agent and lose the source unit.
- **Partial failures:** A request can partially succeed. Check `GoogleAdsFailure` / per-result errors rather than assuming an HTTP-200-equivalent response means every row is valid.
- **Rate limits / quotas:** Google Ads API access operates under a token access level (Basic vs Standard vs higher) with daily operation quotas that scale accordingly. This agent must back off and retry on `RESOURCE_EXHAUSTED`/quota errors rather than silently dropping the request or fabricating a partial result to look complete.

## Inputs & Tools
- **Inputs:** A validated GAQL query string (usually handed off from `gaql-query-agent`), plus the target `customer_id` (and, for MCC calls, a `login-customer-id` header identifying the manager account making the request on the child's behalf).
- **Tools/APIs:** `GoogleAdsService.Search`, `GoogleAdsService.SearchStream`.

## Core Logic & Rules
1. Accepts a GAQL query + customer scope; does not invent or modify the query's field list itself (that responsibility lives in `gaql-query-agent`).
2. Chooses `Search` (bounded, paginated) vs `SearchStream` (large pulls) based on expected result size.
3. Retries on transient/quota errors with backoff; surfaces (does not swallow) `GoogleAdsFailure` errors and partial-failure rows to the caller.
4. Caches results per (customer_id, query, date range) to avoid redundant calls within a run.
5. Operates deterministically — no LLM involved in this agent; it executes exactly the query it's given.
6. Default trigger cadence: hourly for scheduled/autonomous pulls; ad-hoc for orchestrator-routed user queries.

## Outputs
- Raw `GoogleAdsRow` results as returned by the API — untransformed field values, in their native types and units (micros for currency), plus the resource_name(s) each row came from.
- On partial or full failure: the specific error code/message, not a silently truncated or estimated result set.

## Dependencies
- **Upstream:** `master-orchestrator` (routes requests here), `universal/gaql-query-agent` (usually supplies the query).
- **Downstream:** `universal/data-validation-agent` (checks the output before any other agent consumes it).

## Safety & Approvals
- Read-only by construction — this agent only calls `Search`/`SearchStream`, never a mutate/apply RPC (`*Service.Mutate*`, `RecommendationService.ApplyRecommendation`). See the Saarthi Platform Execution Constraint in `AGENTS.md`.

## Guardrails
- Global rules in `.agents/skills/google-ads/AGENTS.md` apply. In particular for this agent:
- If a query references a field not already documented in a `SKILL.md`, verify it exists via `google_ads_field` (`gaql-query-agent`) before running it — do not execute a guessed field name against the live API.
- Zero rows returned is a valid, reportable result ("no data for this scope/range") — never substitute a plausible-looking estimate when the API genuinely returns nothing.
- Never convert or round `_micros` values before returning them; unit conversion belongs to the consuming agent, and doing it here risks silently losing precision that downstream financial reporting depends on.
