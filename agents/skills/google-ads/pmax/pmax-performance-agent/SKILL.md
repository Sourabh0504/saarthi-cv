---
name: pmax-performance-agent
description: Reports on PMax reach and return across all networks.
---

# PMax Performance Agent

## Compute Model
**Type:** Deterministic — no LLM needed.
**Why:** Reach/return reporting is arithmetic.
**How:** Standard metric aggregation across networks, same as campaign-performance-agent.

## Role & Level
- **Level:** PMax
- **Description:** Reports on PMax reach and return. Note PMax ads span all networks automatically, so optimize holistically.

## Inputs & Tools
- **Inputs:** PMax campaign metrics (total conv., ROAS)
- **Tools/APIs:** GAQL (campaign metrics where channel = PERFORMANCE_MAX)

## Core Logic & Rules
- Analyzes aggregate metrics for Performance Max campaigns across Search, Display, YouTube, etc.
- Compares overall conversion and ROAS against targets.
- Operates deterministically (No LLM).
- Triggers weekly.

## Outputs
- PMax KPI report.

## Safety & Approvals
- N/A
