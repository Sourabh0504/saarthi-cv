---
name: conversion-tracking-agent
description: Validates that tracking tags are firing and aligned with GA4 goals.
---

# Conversion Tracking Agent

## Compute Model
**Type:** Deterministic — no LLM needed.
**Why:** Tag-firing validation is a status/event check.
**How:** Verify conversion_action.status and recent firing timestamps directly.

## Role & Level
- **Level:** Conversion
- **Description:** Validates that tracking tags are firing and aligned with GA4 goals. Compares Google Ads conversions vs GA4 or CRM sales.

## Inputs & Tools
- **Inputs:** Conversion tags and data (GA4, Ads tags)
- **Tools/APIs:** `GoogleAdsService.Search` (conversion_action)

## Core Logic & Rules
- Verifies that Google Ads and GA4 conversion tags are actively firing.
- Cross-references reported conversion counts between Google Ads and GA4.
- Flags significant discrepancies that may indicate a broken tag.
- Operates deterministically (No LLM).
- Triggers weekly.

## Outputs
- Tracking integrity report.

## Safety & Approvals
- N/A
