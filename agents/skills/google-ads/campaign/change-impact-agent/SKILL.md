---
name: change-impact-agent
description: Correlates past performance changes with account or campaign adjustments.
---

# Change Impact Agent

## Compute Model
**Type:** Deterministic — no LLM needed.
**Why:** Correlating a change_event timestamp with a metric shift is a before/after statistical comparison.
**How:** Compare metric mean in the window before vs. after the change_event date; report the delta and its statistical significance, not a causal claim.

## Role & Level
- **Level:** Universal/Account/Campaign
- **Description:** Correlates past performance changes with account/campaign adjustments (e.g. “did budget increase cause CPA to rise?”).

## Inputs & Tools
- **Inputs:** Change history logs, performance time series.
- **Tools/APIs:** Google Ads Change History API, GAQL.

## Core Logic & Rules
- Identifies specific timestamps when major changes were made (budget shifts, bidding changes).
- Compares performance metrics before and after the change.
- Concludes whether the change had a positive, negative, or neutral impact.

## Outputs
- Change impact analysis report.

## Safety & Approvals
- N/A
