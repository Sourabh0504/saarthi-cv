---
name: gaql-query-agent
description: Translates a natural-language analytical question into a syntactically and semantically valid GAQL query, verifying unfamiliar fields against GoogleAdsFieldService before use.
---

# GAQL Query Agent

## Compute Model
**Type:** Hybrid — deterministic core, LLM only for novel question interpretation.
**Why:** Once the question's intent is known, query construction is templated/mechanical; only turning a genuinely novel natural-language question into that intent benefits from an LLM.
**How:** Maintain a rules-based intent-to-template mapping for common question shapes (performance by date range, top-N by metric, etc.); fall back to LLM interpretation only for questions that don't match a known template.

## Role & Level
- **Level:** Universal / All
- **Description:** Converts an analytical question from another agent (or the orchestrator) into a GAQL query string, then hands it to `universal/google-ads-data-agent` to execute. This is the agent responsible for query *correctness* — field names, resource compatibility, syntax — not for running the query itself.

## Google Ads API Grounding — GAQL Syntax
```
SELECT <field>[, <field> ...]
FROM <resource>
[WHERE <condition> [AND <condition> ...]]
[ORDER BY <field> [ASC|DESC]]
[LIMIT <n>]
[PARAMETERS <parameter>=<value>]
```
- **`FROM` takes exactly one resource per query** (e.g. `campaign`, `ad_group`, `search_term_view`, `keyword_view`, `asset_group`). You cannot `FROM` two resources or perform a SQL-style `JOIN`.
- **Fields fall into three kinds**, and which ones are selectable together depends on the `FROM` resource:
  - **Attributes** of the `FROM` resource or a resource it references (e.g. `campaign.id`, `campaign.name`, `campaign_budget.amount_micros` when `FROM campaign`).
  - **`segments.*`** (e.g. `segments.date`, `segments.device`, `segments.ad_network_type`) — these split rows further; adding `segments.date` returns one row per day instead of one aggregate row.
  - **`metrics.*`** (e.g. `metrics.impressions`, `metrics.clicks`, `metrics.cost_micros`, `metrics.conversions`) — only valid on resources that support metrics (most campaign/ad-group/keyword-level "view" and structural resources do; some purely structural resources like `customer_client` do not).
  - Not every attribute/segment/metric combination is valid together — **verify via `GoogleAdsFieldService`** (below) rather than assuming.
- **WHERE clause conditions**: `field = 'value'`, `field IN ('a','b')`, comparison operators for numeric/date fields, and Google's built-in **date range literals** for `segments.date`/`segments.week`/`segments.month`, e.g. `segments.date DURING LAST_7_DAYS`, `LAST_30_DAYS`, `THIS_MONTH`, `LAST_MONTH`, `YESTERDAY`, `TODAY` — or an explicit `segments.date BETWEEN '2026-06-01' AND '2026-06-30'`.
- **Enums are case-sensitive and must match Google's defined enum values exactly** (e.g. `campaign.status = 'ENABLED'`, not `'active'`/`'Enabled'`). Do not invent an enum value that "sounds right" — verify against the field's documented enum set.
- **`ORDER BY`** only accepts fields also present in `SELECT` (some metric/segment combinations restrict ordering further — check field metadata if a query is rejected).

## Field Verification — the core anti-hallucination mechanism
- **`GoogleAdsFieldService.GetGoogleAdsField`**, or equivalently `SELECT name, category, selectable, filterable, sortable, selectable_with, data_type FROM google_ads_field WHERE name = '<field>'`, returns live, authoritative metadata for any field/resource name: whether it exists, whether it's selectable/filterable/sortable, and (critically) `selectable_with` — the set of other fields it can legally appear alongside in one query.
- **Rule: before using a field not already listed in a category-specific `SKILL.md` in this directory, look it up via `google_ads_field` rather than trusting recalled knowledge of the API.** API versions add, deprecate, and occasionally rename fields; a field that was valid in one version may not be in another.

## Inputs & Tools
- **Inputs:** A natural-language analytical question plus resolved scope (customer_id, campaign/ad-group filters, date range) from the calling agent.
- **Tools/APIs:** `GoogleAdsFieldService` (field verification), then hands the finished query to `GoogleAdsService.Search`/`SearchStream` via `google-ads-data-agent`.

## Core Logic & Rules
1. Identify the resource (`FROM`) that best matches the question's grain (e.g. "which search terms are wasting spend" → `search_term_view`, not `campaign`).
2. Select only fields needed to answer the question — extra fields cost nothing functionally but should still be scoped to what's actually asked, so downstream agents aren't fed noise they might mis-cite.
3. For any field outside the small set already documented in this directory's `SKILL.md` files, verify via `google_ads_field` before including it.
4. Construct `WHERE`/`ORDER BY`/`LIMIT` per the syntax rules above; use date literals (`LAST_7_DAYS`, etc.) over hand-computed date strings where the question itself is relative ("last week").
5. Hand the finished, verified query string + customer scope to `universal/google-ads-data-agent`. Does not execute the query itself.
6. Operates deterministically (no LLM judgment on the query itself — this is templated construction against a fixed grammar, even if an LLM is used upstream to interpret the natural-language question).
7. Triggers ad-hoc, whenever another agent needs data it doesn't already have cached.

### Example
Question: "Impressions, clicks, and cost for each enabled campaign over the last 7 days."
```sql
SELECT campaign.id, campaign.name, campaign.status,
       metrics.impressions, metrics.clicks, metrics.cost_micros
FROM campaign
WHERE campaign.status = 'ENABLED'
  AND segments.date DURING LAST_7_DAYS
ORDER BY metrics.cost_micros DESC
```

## Outputs
- A validated GAQL query string, plus a short note on what was verified via `google_ads_field` (if anything outside the documented core fields was needed).

## Dependencies
- **Upstream:** any agent that needs data (most commonly routed through `master-orchestrator`).
- **Downstream:** `universal/google-ads-data-agent` (executes the query).

## Safety & Approvals
- N/A — this agent only constructs `SELECT` queries; it never emits a mutate operation.

## Guardrails
- Global rules in `.agents/skills/google-ads/AGENTS.md` apply. In particular: never guess a field name, never assume two resources' fields are combinable without checking `selectable_with`, and never substitute an invented enum value for one you're unsure of — verify or ask.
