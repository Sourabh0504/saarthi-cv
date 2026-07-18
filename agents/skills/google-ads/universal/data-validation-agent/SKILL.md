---
name: data-validation-agent
description: Checks Google Ads API results for missing fields, duplicates, partial failures, unit-conversion errors, and cross-metric inconsistencies before any other agent consumes them.
---

# Data Validation Agent

## Compute Model
**Type:** Deterministic — no LLM needed.
**Why:** Every check (null fields, duplicate resource_names, magnitude sanity, conversions-vs-all_conversions label mismatch) is a rule evaluated against known field values.
**How:** Implement as a fixed rule set / assertions run against the response payload — no model call required.

## Role & Level
- **Level:** Universal / All
- **Description:** The mandatory checkpoint between `google-ads-data-agent`'s raw output and every other analytical agent. Nothing downstream should treat a `GoogleAdsRow` result as trustworthy until it has passed through here.

## Google Ads API Grounding — what "invalid" actually looks like
- **Partial failures**: the API can return success for most rows and errors for others in the same call. A validation pass must check for `GoogleAdsFailure`/per-result error entries, not just whether *a* response came back.
- **Zero rows is not automatically an error** — it can be a legitimate "no activity in this scope/range" result (e.g. a paused campaign, a date range before the campaign started). The validator's job is to distinguish "zero rows because nothing happened" from "zero rows because the query/scope was wrong" (e.g. a `customer_id` typo, a date range entirely outside `campaign.start_date`/`campaign.end_date`).
- **Unit consistency**: currency fields arrive as `_micros` (`metrics.cost_micros`, bid fields like `ad_group.cpc_bid_micros`, `campaign_budget.amount_micros`). A common, easy-to-miss bug is treating a micros value as a display-currency value (off by 1,000,000×) — the validator should sanity-check magnitude (e.g. a `cost_micros` value that would imply an absurd spend if misread) rather than assuming the caller converted correctly.
- **`metrics.conversions` vs `metrics.all_conversions`**: these are genuinely different numbers (all_conversions includes conversion actions marked "include in conversions = false" plus cross-account/cross-device attribution Google counts more broadly). A validator should flag when an agent's output uses one but labels it with the other's name.
- **Attribution model consistency**: conversion counts depend on the `conversion_action`'s attribution model (data-driven, last-click, etc.) and lookback window. Comparing two numbers pulled under different attribution settings (or comparing an API pull to a manually reported number from the Google Ads UI, which may use a different default date range/attribution assumption) can look like a discrepancy that isn't a data error at all — the validator should flag "different attribution settings," not silently reconcile them into one number.
- **Structural duplicates**: the same `resource_name` appearing more than once in one result set (can happen with certain segmented queries if not handled carefully) should be flagged, not silently summed twice.

## Inputs & Tools
- **Inputs:** Raw `GoogleAdsRow` results (and any error/partial-failure payload) from `universal/google-ads-data-agent`.
- **Tools/APIs:** No external API calls of its own — operates purely on the data already fetched, plus the originating query's metadata (resource, fields, scope) to know what "expected" looks like.

## Core Logic & Rules
1. Check for partial-failure/error entries in the response; surface them rather than proceeding on the successful subset silently.
2. Check for missing fields that the originating query explicitly requested (a field present in `SELECT` but absent/null on a returned row is worth flagging, not silently dropping).
3. Check for duplicate `resource_name` rows within one result set.
4. Sanity-check `_micros` magnitudes against the account's known scale (does not "fix" a suspected unit error — flags it for the consuming agent/human to confirm).
5. Cross-check `metrics.conversions` vs `metrics.all_conversions` usage matches how the consuming agent labels it.
6. Flag date ranges that return zero rows but fall entirely outside a referenced campaign's `start_date`/`end_date`, distinguishing that from a legitimate zero-activity result.
7. Operates deterministically (no LLM) — this is rule-based checking, not judgment.
8. Triggers on every data-agent response in the request path (not a scheduled daily-only job, despite handling scheduled pulls too).

## Outputs
- A data-quality report: pass/fail per check, with specific flagged rows/fields — attached to (not replacing) the original data, so downstream agents see both the data and its validation status.

## Dependencies
- **Upstream:** `universal/google-ads-data-agent` (validates its output).
- **Downstream:** every analytical/optimization agent that consumes fetched data — `master-orchestrator` routes validated data onward, never raw unvalidated data.

## Safety & Approvals
- Flags issues; does not silently correct or discard data, and does not itself gate execution (that's `approval-agent`/`policy-safety-agent`'s job) — but a failed validation should stop an `autonomous/*` agent's proposal from advancing until resolved.

## Guardrails
- Global rules in `.agents/skills/google-ads/AGENTS.md` apply. In particular: never "fix" a suspected data issue by substituting a plausible corrected value — flag it and let the consuming agent or a human decide; a silently corrected number is itself a hallucination.
