---
name: offline-conversion-agent
description: Matches offline CRM sales back to Google Ads via GCLID.
---

# Offline Conversion Agent

## Compute Model
**Type:** Deterministic — no LLM needed.
**Why:** GCLID matching is an exact-match join, not a judgment call.
**How:** Join uploaded offline conversion records to Google Ads click data by gclid; report match rate.

## Role & Level
- **Level:** Conversion
- **Description:** Matches offline sales back to Google Ads (via GCLID). Ensures GCLID collection works. Compares CRM conversions vs Google Ads reported.

## Inputs & Tools
- **Inputs:** CRM/point-of-sale conversions (with GCLID)
- **Tools/APIs:** GoogleAds API Store Sales Uploads/Offline Conversions

## Core Logic & Rules
- Validates the offline conversion upload process.
- Ensures GCLIDs are correctly captured and matched to CRM data.
- Identifies upload errors and discrepancies between CRM offline totals and Google Ads totals.
- Operates deterministically (No LLM).
- Triggers daily.

## Outputs
- Offline conv. reconciliation.

## Safety & Approvals
- N/A
