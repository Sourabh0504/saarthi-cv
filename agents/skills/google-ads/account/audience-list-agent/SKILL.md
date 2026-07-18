---
name: audience-list-agent
description: Audits first-party audience list health (Customer Match, remarketing lists) — size, recency, match rate — across all campaign types, the targeting-side counterpart to the conversion-side enhanced-conversions and offline-conversion agents.
---

# Audience List Agent

## Compute Model
**Type:** Deterministic — no LLM needed.
**Why:** List health is status/size-bucket/lifespan field reading, not judgment.
**How:** Read user_list.membership_status, size_range_for_search/display, membership_life_span directly and compare against configured minimums.

## Role & Level
- **Level:** Account
- **Description:** `pmax/pmax-signal-agent` reviews how audience signals are *used* within PMax specifically. This agent covers the underlying audience lists themselves — Customer Match lists, website remarketing lists, app-activity lists — account-wide, across every campaign type that can use them (Search, PMax, Demand Gen, Display). A stale or too-small list quietly degrades every campaign built on top of it, and nothing in this library currently owns that check.

## Google Ads API Grounding
- **Resource:** `user_list` — represents an audience list (Customer Match, remarketing/website visitors, app users, similar/lookalike-style segments where still supported, combined lists). Key fields (verify current exact set via `google_ads_field`, since audience list capabilities have shifted over time — e.g. similar-audiences deprecation in some markets): `user_list.id`, `user_list.name`, `user_list.type`, `user_list.size_range_for_display`/`size_range_for_search` (Google reports list size in coarse buckets, not an exact count, for privacy reasons — do not report a precise membership number where only a bucketed range is actually available), `user_list.membership_status`, `user_list.membership_life_span` (days a member stays on the list).
- **Linking to campaigns**: audience lists are attached via targeting-criterion resources (e.g. `ad_group_criterion.user_list` / `campaign_criterion.user_list` depending on level) or, for PMax, via `asset_group_signal`. Checking "is this list actually used anywhere" requires querying the relevant criterion/signal resource, not just confirming the list exists.
- **Customer Match match rate** — the percentage of uploaded records (hashed emails/phones) that Google actually matches to a Google account — is not always exposed as a simple queryable field; where it isn't directly available via GAQL, this agent should say so rather than presenting an estimated or invented match rate.
- **Privacy note, not just an API detail**: Customer Match requires uploaded data to already be hashed (SHA-256) before upload, and Google enforces list-size minimums before a list is usable for targeting. This agent audits list health; it never handles or requests raw (unhashed) customer PII itself.

## Inputs & Tools
- **Inputs:** Account-wide scope (not limited to one campaign).
- **Tools/APIs:** `gaql-query-agent`/`google-ads-data-agent` for `user_list` and the relevant linking criterion/signal resources.

## Core Logic & Rules
1. Enumerate all `user_list` resources for the account, with type, size range, and membership status.
2. Cross-reference against campaign/ad-group/asset-group criterion and signal resources to determine which lists are actually attached anywhere vs. orphaned (exist but unused).
3. Flag lists below Google's usable size threshold (too small to serve — report the specific size-range bucket, don't estimate an exact count) and lists with an unusually short `membership_life_span` relative to this account's typical purchase/consideration cycle (a plausible-but-not-certain flag for a human to confirm, not an assertion).
4. Where Customer Match match rate is available, flag unusually low match rates as a possible data-hygiene issue (e.g. unhashed uploads, wrong hash format) — but only when the field is actually confirmed available; otherwise state that match rate isn't queryable and a manual UI check is needed.
5. Deterministic auditing; no LLM judgment beyond narrating findings.
6. Triggers on the same cadence as `account/account-structure-agent`, or ad-hoc before a targeting-strategy review.

## Outputs
- An audience-list health report: list, type, size-range bucket, membership status, where it's linked (or "orphaned — not linked anywhere"), and any data-hygiene flags.

## Dependencies
- **Upstream:** `master-orchestrator`, `universal/gaql-query-agent`.
- **Downstream:** `pmax/pmax-signal-agent` (PMax-specific signal usage), `campaign/campaign-targeting-agent` (Search/Demand Gen targeting), `conversion/enhanced-conversions-agent` (the conversion-side counterpart to this targeting-side audit).

## Safety & Approvals
- Read-only; no mutation capability. Never handles raw customer PII — Customer Match uploads and hashing are outside this agent's scope entirely, human/system responsibility only.

## Guardrails
- Global rules in `.agents/skills/google-ads/AGENTS.md` apply. Never report a precise list-membership count when the API only exposes a bucketed size range — report the bucket. Never invent a Customer Match match-rate percentage when the field isn't confirmed queryable for this account.
