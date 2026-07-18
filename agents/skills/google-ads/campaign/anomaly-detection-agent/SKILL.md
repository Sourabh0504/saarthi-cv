---
name: anomaly-detection-agent
description: Monitors metrics in real time or hourly and flags unusual spikes or drops.
---

# Anomaly Detection Agent

## Compute Model
**Type:** Deterministic — no LLM needed.
**Why:** Spike/drop detection is classic statistical process control.
**How:** Flag when a metric's z-score vs. its trailing rolling mean/stddev exceeds a configured threshold (e.g. |z|>2), or when day-over-day %-change exceeds a configured bound.

## Role & Level
- **Level:** Universal/Campaign
- **Description:** Monitors metrics (spend, CTR, conversions, ROAS) in real time or hourly, flags unusual spikes/drops.

## Inputs & Tools
- **Inputs:** Real-time or hourly KPI data streams.
- **Tools/APIs:** Time-series analysis, GoogleAdsService.

## Core Logic & Rules
- Continuously monitors core metrics (spend, CTR, conversions).
- Detects statistically significant deviations (spikes or drops) from expected behavior.
- Triggers alerts immediately when an anomaly is detected.

## Outputs
- Anomaly alerts and flags.

## Safety & Approvals
- N/A
