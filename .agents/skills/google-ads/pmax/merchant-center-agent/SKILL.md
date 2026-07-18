---
name: merchant-center-agent
description: Checks product feed health and disapprovals for Shopping/PMax campaigns.
---

# Merchant Center Agent

## Compute Model
**Type:** Deterministic — no LLM needed.
**Why:** Feed health/disapproval checks are status-field reads.
**How:** Read product feed status/disapproval reason codes directly; count disapproved SKUs by reason.

## Role & Level
- **Level:** PMax/Shopping
- **Description:** Checks product availability, policy disapprovals. Verifies listing group structure in Shopping campaigns.

## Inputs & Tools
- **Inputs:** Product feed health, disapprovals
- **Tools/APIs:** Merchant Center API, GAQL (shopping performance)

## Core Logic & Rules
- Monitors the Google Merchant Center product feed for errors or policy disapprovals.
- Verifies that listing groups within PMax and Shopping campaigns are correctly structured.
- Alerts if top-performing products suddenly become unavailable or disapproved.
- Operates deterministically (No LLM).
- Triggers daily.

## Outputs
- Feed issue report.

## Safety & Approvals
- N/A
