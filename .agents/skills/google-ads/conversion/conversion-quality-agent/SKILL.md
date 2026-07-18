---
name: conversion-quality-agent
description: Flags poor-quality conversions using heuristics or CRM signals.
---

# Conversion Quality Agent

## Compute Model
**Type:** Deterministic — no LLM needed for structured data.
**Why:** Quality heuristics are threshold rules over structured fields.
**How:** score = weighted rule set (e.g. time-to-convert too short, no matching CRM record, value below floor) — a deterministic scoring formula, not a judgment call, unless scoring free-text CRM notes (which would be the one case needing an LLM).

## Role & Level
- **Level:** Conversion
- **Description:** Flags poor-quality conversions (e.g. fake leads) using heuristics or CRM signals.

## Inputs & Tools
- **Inputs:** Conversion attributes (IP, timestamp, CRM status).
- **Tools/APIs:** Google Ads API, CRM integration.

## Core Logic & Rules
- Identifies patterns indicative of low-quality or fake conversions (e.g., spam lead submissions, immediate CRM rejections).
- Cross-references conversion data with CRM disqualification tags.
- Recommends excluding certain IP ranges or tweaking targeting to improve conversion quality.
- Operates deterministically.

## Outputs
- Conversion quality alert reports.

## Safety & Approvals
- N/A
