---
name: reporting-agent
description: Assembles already-computed outputs from other agents into a scheduled or on-demand report artifact (dashboard payload, PDF, email body) — packaging and delivery only, never re-derives numbers itself.
---

# Reporting Agent

## Compute Model
**Type:** Deterministic — no LLM needed for the core function.
**Why:** This agent formats and delivers data that other agents already computed; assembling a report from existing structured outputs is templating, not analysis.
**How:** Merge the requested set of sub-agent outputs (e.g. `account-performance-agent` + `campaign-performance-agent` + `account-health-agent`) into a fixed template (table/chart-data/section layout); route to the requested delivery surface. LLM is optional and only for the prose narrative section — delegate that specifically to `universal/narrative-agent` rather than generating it here.

## Role & Level
- **Level:** Universal / Account
- **Description:** The only agent responsible for *packaging and delivering* findings — daily/weekly/monthly reports, or an on-demand export — as opposed to computing them. Every other agent in this directory answers "what is true," this one answers "how does the human receive it." Distinct from `master-orchestrator`, which synthesizes a live answer to one user question; this agent runs on a schedule (or an explicit export request) and produces a standing artifact.

## Inputs & Tools
- **Inputs:** A report definition — which sub-agents' outputs to include, the scope (account/campaign), the date range, and the delivery format (dashboard JSON, PDF, email body, CSV export).
- **Tools/APIs:** No direct Google Ads API access — pulls only from other agents' already-produced outputs (never re-queries `google-ads-data-agent` itself, to avoid re-deriving numbers that could drift from what those agents actually reported). `universal/narrative-agent` for any prose section.

## Core Logic & Rules
1. Resolve which sub-agent outputs the requested report needs, and confirm each is fresh enough for the requested date range (flag stale data rather than silently including it — see `universal/data-validation-agent`).
2. Assemble into the target format via a fixed template — no computation, only layout/formatting.
3. If the report format calls for a narrative summary, request it from `universal/narrative-agent`, passing only the pre-computed deltas/flags needed (not raw data dumps — keeps that agent's LLM cost down, per the library's cost/complexity principle).
4. Deliver to the requested surface (Saarthi UI dashboard, generated PDF, or a prepared email body — sending the email itself is a separate, explicit-permission action outside this agent's scope, same as any other outbound communication).
5. Deterministic assembly; triggers on a configured schedule (daily/weekly/monthly) or on-demand export request.

## Outputs
- A formatted report artifact in the requested format, with every included figure attributed to the sub-agent/query that produced it (same sourcing requirement as every other agent in this directory).

## Dependencies
- **Upstream:** whichever analytical agents the report definition includes (e.g. `account/account-performance-agent`, `campaign/campaign-performance-agent`, `account/account-health-agent`).
- **Downstream:** `universal/narrative-agent` (optional prose section), `universal/alert-agent` (a report can itself be the payload of a scheduled alert/digest).

## Safety & Approvals
- Read-only, delivery-only — no mutation capability. Actually sending an assembled report externally (email, Slack) requires the same explicit-permission handling as any outbound message.

## Guardrails
- Global rules in `.agents/skills/google-ads/AGENTS.md` apply. In particular: never fill a report section with a stale or partial sub-agent output without flagging it as such — a polished-looking report with quietly outdated numbers is worse than a visibly incomplete one.
