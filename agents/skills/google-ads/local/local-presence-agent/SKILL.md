---
name: local-presence-agent
description: Analyzes local/store-visit-oriented spend and presence — Google Maps surfacing, Local campaigns, and Business Profile/location asset health — a spend category with no attached image creative.
---

# Local Presence Agent

## Compute Model
**Type:** Deterministic — no LLM needed.
**Why:** Channel-type and asset-link-status checks are field reads.
**How:** Read campaign.advertising_channel_type and asset link status directly; no judgment involved, including the open-question resolution (it's a query result, not an inference).

## Role & Level
- **Level:** Local / Campaign-adjacent
- **Description:** Covers Google Ads spend that drives local/in-store presence rather than clicks to a website — the category [PROJECT_SPEC.md](../../../../../PROJECT_SPEC.md) (§1) explicitly flags as real for this account: *"Google Maps ads (local presence, no image creative required)"*. This spend will never appear in creative-level reporting (Pipeline A) and needs its own visibility, same as Pipeline B's broader campaign coverage.

## ⚠️ Open Question — Resolve Before Assuming Either Interpretation
PROJECT_SPEC.md §13 (open question #4) flags this as **unresolved**: *"Network column — is 'Maps' a value from Google Ads export or does the user label it manually?"* There are two structurally different real things "Maps ads" could mean, and this agent must not silently assume one:
1. **A dedicated Local campaign** — `campaign.advertising_channel_type = 'LOCAL'` (a distinct, automated campaign type Google auto-places across Search, Maps, Display, YouTube, and Gmail to drive store visits, calls, and directions — separate from Local Services Ads, a different product entirely with its own `LocalServicesLead` resources, not covered here).
2. **A network/placement segment within an ordinary Search or PMax campaign** — i.e. a normal campaign's ads simply being served on the Maps surface, which may or may not be cleanly separable via `segments.*` fields depending on API version.
Before reporting anything as "Maps performance," **verify which of these two is actually true for this account** by checking `campaign.advertising_channel_type` for a `LOCAL`-type campaign first; if none exists, the "Maps" label in the CampaignPerf sheet is very likely a manual/derived label from the raw Google Ads export, not a first-class API segment — say so explicitly rather than presenting it as if it were.

## Google Ads API Grounding
- `campaign.advertising_channel_type` enum includes `LOCAL` for dedicated Local campaigns, alongside `SEARCH`, `DISPLAY`, `SHOPPING`, `VIDEO`, `PERFORMANCE_MAX`, `DEMAND_GEN` (see `demand-gen/`), and others — confirm the exact current enum set via `google_ads_field` rather than assuming this list is complete or unchanged across API versions.
- Local campaigns are automated/asset-based (conceptually closer to Performance Max than to manually-built Search campaigns) — headlines, descriptions, images, and a logo are supplied at the campaign level and Google assembles and places the ads; there is no manual ad-group/keyword build-out to inspect the way there is for Search.
- **Location assets / Business Profile linkage**: an account's local presence (address, phone, "get directions") on ads is driven by a linked Google Business Profile surfaced via a location-type asset (`asset.type = 'LOCATION'` in current API versions — the older feed-based location extensions mechanism has been superseded by assets; verify the exact current field path via `google_ads_field` before querying, since this area of the schema has changed across API versions and this agent should not assert a field path it hasn't confirmed live).
- Relevant metrics for local actions, where available: click-to-call and get-directions style local actions are exposed as specific metrics on supporting resources — again, verify exact field names live rather than assuming a specific metric name.

## Inputs & Tools
- **Inputs:** `campaign.advertising_channel_type` results (to determine which of the two scenarios above applies), plus whatever segment/label the account's actual data source uses for "Maps"/local rows.
- **Tools/APIs:** `google-ads-data-agent` / `gaql-query-agent` for live queries; `google_ads_field` for verifying any location/local-specific field before first use (this area of the API is less commonly queried than Search/PMax and more prone to stale assumptions).

## Core Logic & Rules
1. First determine which of the two "Maps" scenarios (above) applies to this account — do not skip this step.
2. If a dedicated `LOCAL` campaign exists: report its performance using whatever metrics are confirmed available for it (verify before citing a specific metric name).
3. If no `LOCAL` campaign exists: report that the "Maps" rows in the account's data are a network/placement or manually-derived label, not a first-class Local-campaign metric, and flag this back to whoever owns the open question in PROJECT_SPEC §13.
4. Check location-asset/Business Profile link health (linked and active, vs. unlinked or removed) where a `LOCATION`-type asset is confirmed to exist for the account.
5. Deterministic data reporting; no LLM judgment beyond summarizing findings.
6. Triggers ad-hoc or on the same cadence as other campaign-level reporting.

## Outputs
- A report stating which "Maps" scenario applies (1 or 2 above, explicitly), performance data for a genuine `LOCAL` campaign if one exists, and location-asset link status if a `LOCATION` asset is confirmed present.

## Dependencies
- **Upstream:** `master-orchestrator`, `universal/gaql-query-agent`.
- **Downstream:** `campaign/campaign-performance-agent` (Local campaign metrics feed into overall campaign-level reporting once confirmed real).

## Safety & Approvals
- Read-only; no mutation capability.

## Guardrails
- Global rules in `.agents/skills/google-ads/AGENTS.md` apply. This agent exists specifically to resolve an ambiguity the project's own spec admits is open — never resolve it by assumption; resolve it by querying `campaign.advertising_channel_type` and reporting what's actually there.
- Do not present a manually-derived "Maps" label from the Sheet pipeline as if it were a queried Google Ads API segment value unless verified.
