---
name: memory-learning-agent
description: Logs approved/rejected recommendations and their subsequent performance against Google Ads metrics, distinguishing correlation from causation, to refine future suggestions and avoid repeating disliked strategies.
---

# Memory / Learning Agent

## Compute Model
**Type:** Deterministic — no LLM needed for the core function.
**Why:** Logging and before/after metric delta computation are arithmetic/DB operations.
**How:** delta = metric_after - metric_before over the defined follow-up window; rejection-pattern counting = simple tally by recommendation type. LLM is optional and only for compressing accumulated history into a short context blurb for other agents.

## Role & Level
- **Level:** Universal
- **Description:** The persistent record of what Saarthi has suggested, what the human operator did about it, and what happened afterward. Feeds that history back into future agent runs so recommendations improve over time instead of repeating the same rejected ideas or ignoring the account's actual outcomes.

## Inputs & Tools
- **Inputs:** Every resolved item from `universal/approval-agent` (`approved`/`rejected` + reviewer + reason if given), and the relevant `metrics.*` for the affected campaign/ad group/keyword in the window after the change (pulled via `google-ads-data-agent`/`gaql-query-agent`).
- **Tools/APIs:** A persistent memory store (account-scoped, not shared across unrelated Saarthi accounts — one client's rejected strategy is not evidence about another client's account).

## Core Logic & Rules
1. Records every resolved recommendation with a timestamp, the originating agent, the exact proposed change, the human's decision, and any reason given.
2. For approved changes, schedules a follow-up pull of the relevant metrics (e.g. `metrics.cost_micros`, `metrics.conversions`, `metrics.clicks` for the affected scope) at a defined interval after the change (e.g. 7/14/30 days) via `change_event` to confirm the change actually took effect on the dates recorded, and to compare before/after.
3. **Does not claim causality from a before/after comparison alone.** Other things change in an account simultaneously (seasonality, other concurrent changes, market conditions) — a before/after delta is evidence, not proof, that a specific approved change caused the outcome. Only `campaign/experiment-ab-testing-agent`'s isolated experiment results (with a genuine control) support a causal claim; this agent should report correlational outcomes as "cost/conversions moved by X in the following period" not "this change caused X."
4. Tracks rejection patterns: if a specific type of suggestion (e.g. "increase budget on campaign Y by >20%") has been rejected multiple times, future agents proposing similar changes should be informed of that history so they either avoid repeating it or explicitly justify why this instance differs.
5. Updates a per-account preference profile (not a global one) that gets injected as context into future agent runs — explicitly labeled as "past preference," not as a new independent finding.
6. Deterministic logging/retrieval; may use an LLM only to summarize accumulated history into a compact context block for other agents, not to embellish or infer outcomes beyond what was actually logged.

## Outputs
- A queryable history: `{recommendation, source_agent, decision, reviewer, decided_at, follow_up_metrics, follow_up_window, correlational_note}`.
- A compact "known preferences / past outcomes" context block for injection into other agents' prompts, always attributed to specific past entries — never presented as a new independent conclusion.

## Dependencies
- **Upstream:** `universal/approval-agent` (resolved decisions), `universal/google-ads-data-agent` (follow-up metrics).
- **Downstream:** `master-orchestrator` and any optimization agent that should be aware of this account's history before proposing something similar again.

## Safety & Approvals
- N/A — read/log only, no mutation capability.

## Guardrails
- Global rules in `.agents/skills/google-ads/AGENTS.md` apply, especially the correlation-vs-causation rule above.
- Never backfill a plausible-sounding "reason it was rejected" if none was actually given by the human — log "no reason given," don't infer one.
- Never let one account's logged history leak into or influence another account's recommendations — memory is account-scoped.
