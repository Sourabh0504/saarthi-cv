---
name: alert-agent
description: Routes conditions flagged by other agents (anomalies, emergency spend, failed validation, pending approvals) to the configured notification channel — with dedup/throttling so the same condition doesn't re-fire repeatedly.
---

# Alert Agent

## Compute Model
**Type:** Deterministic — no LLM needed.
**Why:** Notification routing is rule matching and message templating over conditions other agents already detected — no judgment or generation required.
**How:** rule: `IF condition_type IN configured_alert_rules THEN route_to(configured_channel)`, with a dedup key (e.g. `campaign_id + condition_type + date`) suppressing re-sends of the same condition within a configured cooldown window.

## Role & Level
- **Level:** Universal / Account
- **Description:** The delivery layer for conditions other agents *detect* but don't themselves deliver. `campaign/anomaly-detection-agent` flags a spike; `autonomous/emergency-spend-agent` flags a runaway-spend threshold breach; `universal/data-validation-agent` flags a failed check; `universal/approval-agent` has an item sitting pending — none of those agents send a notification anywhere, they only produce a flag. This agent is the one place that turns a flag into an actual notification, so channel routing, formatting, and — critically — dedup/throttling logic exists once instead of being reimplemented per detecting agent.

## Inputs & Tools
- **Inputs:** A flagged condition from a detecting agent: type, severity, scope (account/campaign), and a short description with its source (which agent/query flagged it).
- **Tools/APIs:** The Saarthi UI's notification surface, and any configured external channel (email, Slack) — sending to an external channel is an outbound message and requires the same explicit-permission handling as any other outbound communication; this agent prepares the notification, a human/system layer with permission authorizes actually sending it externally.

## Core Logic & Rules
1. Receive a flagged condition from a detecting agent.
2. Match against configured alert rules for that condition type/severity/scope to determine if and where it should be routed.
3. Check the dedup key against recently-sent alerts; suppress if within the configured cooldown window (prevents alert fatigue from the same underlying issue re-flagging on every cycle).
4. Format the notification with the condition, its source agent, and a link/reference back to the full finding — never invent detail beyond what the detecting agent provided.
5. Deterministic rule matching and templating; triggers whenever a detecting agent produces a flag.

## Outputs
- A formatted notification, its destination channel, and whether it was sent or suppressed (and why, if suppressed) — logged either way for the audit trail.

## Dependencies
- **Upstream:** any detecting agent (`campaign/anomaly-detection-agent`, `autonomous/emergency-spend-agent`, `universal/data-validation-agent`, `universal/approval-agent`, `universal/policy-safety-agent`, etc.).
- **Downstream:** the configured notification surface; `universal/memory-learning-agent` for the sent/suppressed log.

## Safety & Approvals
- Read-only/delivery-only — no mutation capability. Sending to an external channel (not the in-app Saarthi UI) requires the same explicit-permission handling as any outbound message.

## Guardrails
- Global rules in `.agents/skills/google-ads/AGENTS.md` apply. In particular: never embellish a detecting agent's flag with additional detail or urgency framing it didn't provide — this agent routes and formats, it does not editorialize.
