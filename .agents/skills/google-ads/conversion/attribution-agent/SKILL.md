---
name: attribution-agent
description: Audits multi-touch attribution settings between GA4 and Google Ads.
---

# Attribution Agent

## Compute Model
**Type:** Deterministic — no LLM needed.
**Why:** Settings-consistency check across GA4/Google Ads.
**How:** Compare attribution model/lookback window config field-by-field; flag mismatches.

## Role & Level
- **Level:** Conversion
- **Description:** Audits multi-touch attribution settings and consistency between GA4 and Google Ads.

## Inputs & Tools
- **Inputs:** Attribution models, conversion lookback windows.
- **Tools/APIs:** Google Ads API, GA4.

## Core Logic & Rules
- Reviews the currently selected attribution models for key conversion actions (e.g. ensuring Data-Driven Attribution is used instead of Last-Click).
- Verifies that attribution lookback windows align with the typical customer sales cycle.
- Operates deterministically.

## Outputs
- Attribution setting audit report.

## Safety & Approvals
- N/A
