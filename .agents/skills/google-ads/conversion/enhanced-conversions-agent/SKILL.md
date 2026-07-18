---
name: enhanced-conversions-agent
description: Checks enhanced conversion setup and verifies match rates.
---

# Enhanced Conversions Agent

## Compute Model
**Type:** Deterministic — no LLM needed.
**Why:** Setup check plus match-rate arithmetic.
**How:** Verify enhanced conversions is enabled per conversion_action; match_rate = matched_records / uploaded_records where the field is available.

## Role & Level
- **Level:** Conversion
- **Description:** Checks enhanced conversion setup (hashed email import). Verifies match rates and flags errors.

## Inputs & Tools
- **Inputs:** Enhanced conv. config (leads, web)
- **Tools/APIs:** `GoogleAdsService.Search` (conversion_adjustment_upload)

## Core Logic & Rules
- Monitors the status of Enhanced Conversions for web and leads.
- Evaluates the match rates of uploaded hashed customer data.
- Flags drops in match rates or configuration errors.
- Operates deterministically (No LLM).
- Triggers weekly.

## Outputs
- Enhanced conv. success report.

## Safety & Approvals
- N/A
