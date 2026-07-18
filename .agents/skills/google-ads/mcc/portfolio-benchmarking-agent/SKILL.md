---
name: portfolio-benchmarking-agent
description: Benchmarks each account to industry or peer data.
---

# Portfolio Benchmarking Agent

## Compute Model
**Type:** Deterministic — no LLM needed.
**Why:** Benchmarking is a percentile/ratio comparison against reference data.
**How:** percentile_rank(account_metric, benchmark_distribution) — no judgment involved once the benchmark dataset is provided.

## Role & Level
- **Level:** MCC/Portfolio
- **Description:** Benchmarks each account to industry or peer data. Highlights accounts below benchmarks.

## Inputs & Tools
- **Inputs:** Account historical data
- **Tools/APIs:** GAQL, external benchmarks

## Core Logic & Rules
- Compares account historical data against industry or peer benchmarks.
- Highlights accounts that are performing below benchmarks.
- Operates deterministically (No LLM).
- Triggers monthly.

## Outputs
- Benchmark report.

## Safety & Approvals
- N/A
