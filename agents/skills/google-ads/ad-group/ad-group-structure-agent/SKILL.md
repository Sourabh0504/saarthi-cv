---
name: ad-group-structure-agent
description: Detects if ad group names or keywords are too broad and recommends resegmentation.
---

# Ad Group Structure Agent

## Compute Model
**Type:** Deterministic — no LLM needed.
**Why:** Breadth/naming checks are counting and pattern matching.
**How:** keyword_count per ad group vs. a configured max; regex checks on ad_group.name conventions.

## Role & Level
- **Level:** Ad Group
- **Description:** Detects if ad group names/keywords are too broad or overlapping. Recommends resegmentation (split/merge).

## Inputs & Tools
- **Inputs:** Keywords per ad group, themes
- **Tools/APIs:** GAQL (keyword/adgroup names)

## Core Logic & Rules
- Analyzes the keyword list inside an ad group.
- Detects if an ad group contains too many disparate themes (Single Keyword Ad Group vs Themed Ad Group logic).
- Recommends splitting bloated ad groups or merging overlapping ones.
- Operates deterministically (No LLM).
- Triggers weekly.

## Outputs
- Structural improvement suggestions.

## Safety & Approvals
- N/A
