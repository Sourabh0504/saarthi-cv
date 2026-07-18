---
name: crm-integration-agent
description: Ensures CRM data import is working and enriching bid adjustments.
---

# CRM Integration Agent

## Compute Model
**Type:** Deterministic — no LLM needed.
**Why:** Import health is a freshness/completeness check.
**How:** Check last-sync timestamp and record-count deltas against expected volume.

## Role & Level
- **Level:** BI
- **Description:** Ensures CRM data import (via GA4 or Google Ads offline conversions) is working and enriching bid adjustments.

## Inputs & Tools
- **Inputs:** CRM data sync statuses, offline conversion logs.
- **Tools/APIs:** CRM APIs (Salesforce, HubSpot, etc.), Google Ads API.

## Core Logic & Rules
- Monitors the health of data pipelines flowing from the CRM into Google Ads.
- Verifies that value-based bidding strategies are receiving fresh CRM data.
- Flags connection timeouts or schema changes that break the integration.
- Operates deterministically.

## Outputs
- CRM sync health alerts.

## Safety & Approvals
- N/A
