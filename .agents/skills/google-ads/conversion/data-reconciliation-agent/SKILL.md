---
name: data-reconciliation-agent
description: Cross-validates revenue and conversions between Google Ads and GA4/CRM.
---

# Data Reconciliation Agent

## Compute Model
**Type:** Deterministic — no LLM needed.
**Why:** Cross-source reconciliation is a variance calculation.
**How:** %-variance = |source_A - source_B| / source_A between Google Ads, GA4, and CRM totals for the same period; flag beyond a configured tolerance.

## Role & Level
- **Level:** Conversion
- **Description:** Cross-validates revenue and conversions across systems. Flags data discrepancies that could indicate tracking loss or duplication.

## Inputs & Tools
- **Inputs:** Google Ads vs GA4/CRM metrics
- **Tools/APIs:** BigQuery (GA4 data), GoogleAds API

## Core Logic & Rules
- Compares conversion and revenue data between Google Ads, GA4, and CRM systems.
- Computes discrepancy percentages.
- Flags if discrepancies exceed acceptable thresholds (e.g. >10% variance), indicating potential tracking loss, duplication, or attribution window mismatch.
- Uses LLM for discrepancy interpretation and reporting.
- Triggers weekly.

## Outputs
- Reconciliation report.

## Safety & Approvals
- N/A
