---
name: execution-agent
description: The single shared Google Ads API mutate gateway that fires ONLY in direct response to a human's explicit "Execute" click on one specific already-approved item in the Saarthi UI — never autonomously, never on a schedule, never for an unapproved proposal.
---

# Execution Agent

## ⚠️ Read This Before Anything Else
This agent's name is easy to misread as "the agent that executes changes autonomously." **It is not.** Per the Saarthi Platform Execution Constraint in `AGENTS.md`, no agent — including this one — may initiate a mutation on its own judgment. This agent exists purely as the *implementation* of the last step AGENTS.md already describes: *"A human operator reviews these suggestions and manually clicks 'Execute' to push the changes."* This agent is the code that runs **after and only after** that click, for **that one specific item**, and nothing else. If you are building or modifying this agent and find yourself writing a code path that calls a mutate RPC without a specific, individual, human-triggered "Execute" event as its direct cause, stop — that path violates the platform's core constraint.

## Compute Model
**Type:** Deterministic — no LLM needed, and none should be added.
**Why:** This is a thin, safety-critical wrapper around a specific Google Ads mutate RPC call — retries, idempotency, and audit logging are control flow, not judgment. Introducing an LLM into the actual mutate path adds latency and non-determinism to the one place in this entire library where a mistake has immediate, irreversible financial consequence.
**How:** Given an already-approved item (from `universal/approval-agent`, cleared by `universal/policy-safety-agent`) and its specific human-triggered execute event, map it to the corresponding mutate RPC/operation and call it exactly once, with idempotency protection against duplicate submission (e.g. a network retry re-sending the same click).

## Role & Level
- **Level:** Universal / Account
- **Description:** Consolidates what would otherwise be seven separate, independently-implemented mutate call paths (one per `autonomous/*` agent) into one shared, audited gateway. This is a safety improvement, not just a DRY refactor: a single choke point is far easier to guarantee "never fires without approval" for than seven separate promises scattered across `autonomous/ad-optimization-agent`, `bid-optimization-agent`, `budget-optimization-agent`, `campaign-status-agent`, `emergency-spend-agent`, `keyword-execution-agent`, and `negative-keyword-execution-agent` — each of those should describe *what* change it proposes, but the actual API call happens here, and only here.

## Google Ads API Grounding — the mutate services this agent wraps
- `CampaignService.MutateCampaigns` — status changes, campaign-level settings.
- `CampaignBudgetService.MutateCampaignBudgets` — budget amount changes.
- `AdGroupService.MutateAdGroups` — ad group settings, bids.
- `AdGroupCriterionService.MutateAdGroupCriteria` — keyword adds/pauses/bid changes, negative keywords.
- `AdGroupAdService.MutateAdGroupAds` — ad pauses, new ad creation.
- `ConversionUploadService` / `ConversionAdjustmentUploadService` — offline conversion uploads (a distinct kind of "write" — uploading conversion data, not changing account structure; still routes through this agent's audit trail even though its risk profile differs from a budget/bid mutation).
- Verify the exact current service/method names via `google_ads_field`-equivalent service discovery before relying on a specific RPC signature — these are more stable than query fields but still subject to the same version-change caveats in `AGENTS.md`'s API Version & Change Management section.
- Google Ads mutate operations support partial-failure mode (`partial_failure=true`) — this agent should use it deliberately and surface any partial failure explicitly, never silently treat a partial success as a full success.

## Inputs & Tools
- **Inputs:** One specific approved item from `universal/approval-agent` (status = `approved`), plus the actual human-triggered execute event (user identity, timestamp) that authorizes firing it now.
- **Tools/APIs:** The mutate service listed above corresponding to the approved item's change type.

## Core Logic & Rules
1. Verify the incoming request carries both an `approved` item from `approval-agent` AND a live, specific human execute-click event — refuse to proceed if either is missing (e.g. a batch/scheduled trigger with no individual click is not a valid execute event, even if the underlying item is approved).
2. Map the approved item to the specific mutate RPC/operation it represents.
3. Apply an idempotency check (e.g. a request ID tied to the specific approval item) so a retried network call can't double-apply the same change.
4. Call the mutate RPC with `partial_failure=true`; capture the full response including any partial-failure detail.
5. Log the executed change to `universal/memory-learning-agent` — timestamp, item, human who clicked, RPC called, and result (success/partial-failure/error) — this is the audit trail `AGENTS.md`'s human-execution-only model depends on.
6. Deterministic; triggers only on a specific human execute event, never on a schedule, never in a batch without individual confirmation per item.

## Outputs
- The mutate RPC's result (success, partial failure with detail, or error), logged with full attribution (which human, which item, when).

## Dependencies
- **Upstream:** `universal/approval-agent` (the only valid source of an "approved" item), the Saarthi UI's execute-click event.
- **Downstream:** `universal/memory-learning-agent` (audit log), `universal/alert-agent` (notify on execution failure/partial failure).

## Safety & Approvals
- This agent **is** the execution step the Saarthi Platform Execution Constraint describes — it exists specifically so that step has one auditable, safe implementation instead of several. It must never fire without both a cleared approval and a specific human execute-click tied to that exact item; it must never batch-execute multiple items from one trigger; it must never be called by any agent other than in direct response to that UI event.

## Guardrails
- Global rules in `.agents/skills/google-ads/AGENTS.md` apply, especially the Saarthi Platform Execution Constraint at the top of that file — re-read it before modifying this agent. Never treat "the recommendation looked obviously correct" as a substitute for an actual human execute-click; obviousness is not authorization.
