---
name: ad-extensions-agent
description: Audits ad extension/asset coverage — sitelinks, callouts, structured snippets, call, lead form, price, promotion assets — distinct from creative image/video asset performance, and one of Google's most common Optimization Score levers.
---

# Ad Extensions Agent

## Compute Model
**Type:** Deterministic — no LLM needed.
**Why:** Coverage and status checks are field reads/joins across `asset` and its linking resources, not judgment calls.
**How:** Group linked assets by `field_type`/`asset.type` per scope level (account/campaign/ad-group); flag types with zero links as missing, and non-`APPROVED` links separately from missing ones.

## Role & Level
- **Level:** Creative (extension/asset-type, not creative-media-type)
- **Description:** `creative/asset-performance-agent` covers image/video/text *creative* assets. This agent covers the other real asset category Google Ads calls "assets" — what used to be called ad **extensions**: sitelinks, callouts, structured snippets, call, price, promotion, and lead-form assets. These affect ad rank (via expected impact on Ad Rank) and eligibility for larger ad formats, and missing/underused coverage is one of the most common, highest-confidence items in Google's own Optimization Score.

## Google Ads API Grounding
- **Resource:** `asset`, with `asset.type` distinguishing the kind — real, well-established enum values include `SITELINK`, `CALLOUT`, `STRUCTURED_SNIPPET`, `CALL`, `PRICE`, `PROMOTION`, `LEAD_FORM`, `IMAGE`, `TEXT`, `MOBILE_APP`, `LOCATION`, `HOTEL_CALLOUT`, among others — the full current enum should be confirmed via `google_ads_field` since Google periodically adds new asset types.
- **Linking resources**, each at a different scope: `customer_asset` (account-wide), `campaign_asset` (campaign-level), `ad_group_asset` (ad-group-level) — each has a `field_type` (matching the asset's role, e.g. `SITELINK`) and a `status`/link status. An asset can be linked at multiple levels simultaneously; account-level links act as a fallback where no more specific link exists.
- **Coverage check is a join across these three link levels**, not just a flat `asset` query — a sitelink asset existing in the account doesn't mean it's actually linked to the specific campaign being audited. This agent must check the linking resource at the relevant scope, not just asset existence.
- `ad_group_ad.policy_summary`-style approval status applies to extension assets too, same as creative assets — a disapproved sitelink won't serve even if linked; check status, don't assume "linked" means "serving."
- Google's own Recommendations (`recommendation` resource, read-only per `AGENTS.md`) frequently surface "add sitelink extensions" / "add callout extensions" style suggestions — this agent's coverage check should be cross-referenced against, but not blindly deferred to, those recommendations (Google's recommendation impact estimates are unverified projections, per the global guardrails).

## Inputs & Tools
- **Inputs:** Campaign/ad-group scope to audit.
- **Tools/APIs:** `gaql-query-agent`/`google-ads-data-agent` for `asset` + `customer_asset`/`campaign_asset`/`ad_group_asset` queries.

## Core Logic & Rules
1. For the scoped campaign(s), query linked assets at account, campaign, and ad-group level, grouped by `field_type`/`asset.type`.
2. Flag asset types entirely absent (e.g. no callouts linked anywhere applicable) as a coverage gap.
3. Flag linked assets with a non-approved status separately from "not linked at all" — these are different problems with different fixes.
4. Where per-asset performance is available (impressions/clicks specifically attributable to an extension asset), rank sitelinks/callouts by performance the same way `creative/rsa-optimization-agent` ranks RSA assets.
5. Deterministic coverage/status checking; no LLM judgment needed beyond summarizing findings.
6. Triggers on the same cadence as `account/account-structure-agent`, or ad-hoc during a campaign health check.

## Outputs
- A coverage report per campaign: asset types present vs. missing, approval status of what's linked, and performance ranking where available.

## Dependencies
- **Upstream:** `master-orchestrator`, `universal/gaql-query-agent`.
- **Downstream:** `universal/policy-safety-agent` → `universal/approval-agent` if new extension assets are proposed.

## Safety & Approvals
- Read-only/recommendation-only — proposing a new sitelink/callout is a mutation requiring the standard human approval pipeline; this agent never creates or links an asset itself.

## Guardrails
- Global rules in `.agents/skills/google-ads/AGENTS.md` apply. Do not conflate "asset exists in the account" with "asset is linked and serving for this campaign" — always check the linking resource's status, not just asset presence.
