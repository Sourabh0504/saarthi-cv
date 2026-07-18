---
name: account-conversion-agent
description: Audits conversion setup, ensuring all desired goals have actions and values.
---

# Account Conversion Agent

## Compute Model
**Type:** Deterministic — no LLM needed.
**Why:** Auditing conversion setup is existence/completeness checking.
**How:** For each declared goal, verify a matching conversion_action exists, is ENABLED, and has a non-null value where the account expects value-based bidding.

## Role & Level
- **Level:** Account
- **Description:** Audits conversion setup. Checks if all desired goals have actions. Verifies conversion values and attribution windows.

## Inputs & Tools
- **Inputs:** Conversion actions, values, import statuses
- **Tools/APIs:** `GoogleAdsService.Search` (conversion_action)

## Core Logic & Rules
- Reviews conversion action setup in the account.
- Checks if all desired goals have corresponding actions.
- Verifies conversion values and attribution window configurations.
- Operates deterministically (No LLM).
- Triggers weekly.

## Outputs
- Conversion audit report.

## Safety & Approvals
- N/A
