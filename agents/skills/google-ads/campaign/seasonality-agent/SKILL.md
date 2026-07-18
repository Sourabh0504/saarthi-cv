---
name: seasonality-agent
description: Manages bidding seasonality adjustments for known short-term conversion-rate events (sales, festivals, promotions) — a distinct Google Ads bidding feature, particularly relevant to a jewellery account's wedding-season/festival demand spikes.
---

# Seasonality Agent

## Compute Model
**Type:** Deterministic — no LLM needed.
**Why:** Detecting a recurring calendar-aligned pattern is a statistical comparison across historical periods.
**How:** Compare the same calendar window across multiple past years/periods; flag a candidate pattern when the delta is consistent and statistically distinguishable from normal week-to-week variance. The actual adjustment value still needs human confirmation, but detection itself is pure math.

## Role & Level
- **Level:** Campaign (bid-strategy-adjacent)
- **Description:** Google Ads' automated bidding (Target CPA / Target ROAS) learns from historical conversion patterns — a genuine short-term spike or dip in conversion rate (a flash sale, a festival, a known low-conversion outage) can confuse that learning unless the account explicitly tells Smart Bidding to expect it. This is distinct from `campaign/budget-pacing-agent` (which tracks spend against a budget) and `campaign/forecasting-agent` (which predicts future KPIs) — this agent is specifically about the bid-strategy-level seasonality signal. Worth calling out for this account specifically: a jewellery brand ([PROJECT_SPEC.md](../../../../../PROJECT_SPEC.md) §1) plausibly sees real demand spikes around wedding season and festivals (e.g. Diwali) — exactly the scenario this Google Ads feature exists for.

## Google Ads API Grounding
- **Resource:** a seasonality adjustment is represented via a dedicated bidding-seasonality-adjustment resource (`BiddingSeasonalityAdjustment` in the API's naming convention), managed through its own service rather than as a plain campaign field. **Confirm the exact current resource/service name via `google_ads_field` before referencing it in a query or proposal** — this is a narrower, less-frequently-touched part of the schema than campaign/metrics basics, so verify rather than assume.
- Conceptually, a seasonality adjustment specifies: a date range (start/end), a conversion-rate modifier (the expected % change in conversion rate during that window, e.g. "+20%" for a known sale), and a scope (which campaigns, and optionally which device types, it applies to).
- Seasonality adjustments apply to Target CPA and Target ROAS (and other Smart Bidding) strategies — they have no effect on manual bidding.
- This is fundamentally a **forward-looking, human-supplied assumption** (the account owner has to say "we expect X% higher conversion rate during this window" based on business knowledge, e.g. a planned sale) — it is not something this agent can infer purely from past Google Ads metrics. The agent's job is to identify *when one might be warranted* (e.g. a recurring seasonal spike visible in multiple past years' data) and prepare a *proposed* adjustment for a human to confirm the specific date range and modifier — never to invent the conversion-rate modifier number itself from thin air.

## Inputs & Tools
- **Inputs:** Historical `segments.date` + `metrics.conversions`/`metrics.conversion_rate`-style data across past periods (to detect a recurring seasonal pattern), plus any business-calendar context the human operator supplies (known sale dates, festival calendar).
- **Tools/APIs:** `gaql-query-agent`/`google-ads-data-agent` for historical pattern detection; `google_ads_field` to confirm the seasonality-adjustment resource/fields before proposing anything.

## Core Logic & Rules
1. Scan multiple years/periods of historical conversion-rate data for recurring calendar-aligned spikes or dips (e.g. the same week each year).
2. Where a pattern is detected, propose a candidate seasonality-adjustment window — but leave the specific conversion-rate modifier as a recommended *range* grounded in the actual historical delta observed, not a single invented precise number, and flag it as needing the human operator's confirmation of the actual planned event (a past pattern isn't proof this year's event will repeat identically).
3. Never create or apply a seasonality adjustment directly — this is a proposed change like any other, routed through `policy-safety-agent` → `approval-agent`.
4. Deterministic pattern detection; may use an LLM only to describe the detected pattern in natural language, not to guess an adjustment value beyond what the historical data actually shows.
5. Triggers ahead of known high-volume calendar periods, or ad-hoc when the human operator flags an upcoming sale/event.

## Outputs
- A proposed seasonality adjustment: date range, evidence (which past periods showed the pattern and by how much), and a recommended modifier range — explicitly marked as a proposal requiring human confirmation of both the business event and the final modifier value.

## Dependencies
- **Upstream:** `master-orchestrator`, `universal/gaql-query-agent`, `campaign/forecasting-agent` (historical pattern context).
- **Downstream:** `universal/policy-safety-agent` → `universal/approval-agent` for any proposed adjustment; `campaign/campaign-bidding-agent` (Smart Bidding strategy context).

## Safety & Approvals
- Recommendation-only. Applying a seasonality adjustment is a mutation and requires human execution per the Saarthi Platform Execution Constraint in `AGENTS.md` — this agent never calls the seasonality-adjustment service itself.

## Guardrails
- Global rules in `.agents/skills/google-ads/AGENTS.md` apply. Never invent a conversion-rate modifier number not grounded in this account's actual historical data, and never assume a past seasonal pattern will repeat with the same magnitude without flagging that assumption explicitly.
