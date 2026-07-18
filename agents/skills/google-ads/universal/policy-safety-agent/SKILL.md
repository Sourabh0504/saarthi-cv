---
name: policy-safety-agent
description: Checks proposed changes against Google Ads policy signals (ad/asset approval status, policy topics) and internal Saarthi guardrails before a change is allowed to reach the approval queue.
---

# Policy & Safety Agent

## Compute Model
**Type:** Deterministic — no LLM needed.
**Why:** Reads Google's own enum fields (policy_summary.approval_status, policy_topic_entries[].type) and compares against configured numeric guardrails.
**How:** Lookup table on enum values (PROHIBITED → block, DESCRIPTIVE → pass) plus threshold comparison on guardrail numbers.

## Role & Level
- **Level:** Universal
- **Description:** Reviews every proposed change from an optimization/`autonomous/*` agent before it's allowed to reach `universal/approval-agent`. Two distinct checks: (1) does this change risk a Google Ads *policy* violation, and (2) does it exceed an internal Saarthi safety guardrail (e.g. an unusually large budget jump).

## Google Ads API Grounding — real policy signals to check
- **`ad_group_ad.policy_summary.approval_status`** — an ad/asset's live approval state: `APPROVED`, `DISAPPROVED`, `AREA_OF_INTEREST_ONLY`, `UNDER_REVIEW`, `APPROVED_LIMITED`. A proposed change touching an ad that is already `DISAPPROVED` should surface that fact, not assume the ad is servable.
- **`ad_group_ad.policy_summary.policy_topic_entries`** — a list of specific policy topics the ad has been flagged for, each with a `topic` (e.g. restricted content category, trademark, misleading claims) and a `type`: `PROHIBITED` (cannot serve at all), `LIMITED`/`FULLY_LIMITED` (serves with restrictions, e.g. not in certain countries), `DESCRIPTIVE` (informational, doesn't block serving), `BROADENING`, `AREA_OF_INTEREST_ONLY`. A `PROHIBITED` entry is a hard stop; a `DESCRIPTIVE` one is not — this agent must not treat all policy_topic_entries as equally severe.
- **Common real restricted/regulated categories worth checking for an account in jewellery/finance/healthcare-adjacent verticals**: financial products, healthcare & medicines, and misleading pricing/claims policies are the ones most likely to actually trigger for typical e-commerce/retail advertisers — this agent should check policy_topic_entries rather than assume a category applies from the account's vertical alone.
- **Editorial rejection is per-asset, not per-campaign** — a policy issue on one headline/image in a Responsive Search Ad or Performance Max asset group doesn't necessarily mean the whole campaign is blocked; report at the granularity the API actually reports it (asset/ad level).

## Internal Saarthi Guardrails (configurable, not Google policy — example defaults)
- Maximum single-step budget increase (e.g. flag anything above a configurable percentage of current daily budget) — a default threshold, not a Google-mandated number; the actual threshold should come from account-level configuration, not be assumed.
- Maximum single-step bid change.
- Pausing a campaign/ad group responsible for more than a configurable share of account spend or conversions in the trailing period.
- These are internal risk controls layered on top of Google's own policy — clearing Google policy does not mean a change auto-clears Saarthi's internal guardrails, and vice versa; both must pass.

## Inputs & Tools
- **Inputs:** A proposed change (mutation description + supporting data) from an optimization or `autonomous/*` agent.
- **Tools/APIs:** `ad_group_ad.policy_summary` (and equivalent policy fields on other asset-bearing resources) via `google-ads-data-agent`/`gaql-query-agent` for live policy status; internal guardrail configuration (thresholds) for the account.

## Core Logic & Rules
1. For any proposed change touching an existing ad/asset, pull its current `policy_summary` and check for `PROHIBITED` or unresolved `DISAPPROVED` status before clearing the change.
2. For any proposed budget/bid/status change, compare against the account's configured internal guardrail thresholds.
3. Reject (with a specific, cited reason) if either check fails; clear otherwise.
4. Runs proactively, before `universal/approval-agent` ever sees the item — never after.
5. Deterministic rule application against live policy fields and configured thresholds; does not use an LLM to "judge" whether something is risky beyond the documented checks.

## Outputs
- Clearance or rejection, with the specific policy_topic_entry or guardrail threshold cited — never a bare "looks risky" without pointing to the exact field/value that triggered it.

## Dependencies
- **Upstream:** any agent proposing a change.
- **Downstream:** `universal/approval-agent` (only cleared items proceed there).

## Safety & Approvals
- A safety layer, not an executor — never applies a mutation itself, only clears or blocks a proposal from advancing (see the Saarthi Platform Execution Constraint in `AGENTS.md`).

## Guardrails
- Global rules in `.agents/skills/google-ads/AGENTS.md` apply. In particular: do not classify a policy_topic_entry's severity from the topic name alone — check its `type` field; do not invent an internal guardrail threshold when the account hasn't configured one — flag that configuration is missing rather than assuming a default silently.
