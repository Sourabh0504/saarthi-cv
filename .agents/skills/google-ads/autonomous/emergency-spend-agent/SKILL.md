---
name: emergency-spend-agent
description: Rapidly pauses spending if egregious anomalies occur.
---

# Emergency Spend Agent

## Compute Model
**Type:** Deterministic — no LLM needed, and should actively avoid one.
**Why:** This is a safety circuit-breaker; it must fire fast and predictably. LLM latency/non-determinism is a genuine risk in a component whose entire job is rapid, reliable reaction to egregious spend anomalies.
**How:** Hard threshold rule (e.g. spend_rate > N times trailing average) evaluated in a tight, deterministic loop.

## Role & Level
- **Level:** Autonomous (Preparation Only)
- **Description:** If spend >> budget or CPC spiking erratically, prepares immediate pause commands for all or specified campaigns for human alert/approval.

## Inputs & Tools
- **Inputs:** Real-time spend anomalies
- **Tools/APIs:** `GoogleAdsService.Mutate` (CampaignService)

## Core Logic & Rules
- Acts on critical alerts from the Anomaly Detection Agent regarding massive overspend or extreme CPC spikes.
- Prepares immediate pause commands for affected campaigns.
- **CRITICAL**: Does NOT execute the API calls. Flags immediately to human operators for instant execution on the Saarthi platform.
- Operates deterministically (No LLM).
- Triggers in real-time.

## Outputs
- Emergency pause commands.

## Safety & Approvals
- STRICTLY human-in-the-loop (AI prepares payload, Human executes via Saarthi UI).
