# Saarthi Analytics Layer — Self-Serve BI Blueprint
## Replacing Looker Studio / Power BI with one portal

> **Status:** Implementation-grade design spec — no code, but detailed enough that a developer builds from it without further functional clarification (the standard set by `Changelogfeature.md` and `RCA_ENGINE_PLAN.md`).
> **Perspective:** senior BI architect + analytics product designer. Semantic-layer correctness first, visual/interaction surface second.
> **Thesis:** an agency should never export Saarthi's numbers into Looker Studio or Power BI to "really analyze" them. Every capability those tools have — dimensions, measures, ~25 chart types, filters, drill-downs, calculated fields, time intelligence, savable dashboards, scheduled exports — Saarthi can do over its own data, and do **better**, because it also holds the Change Log, Targets, RCA, and the actual creative thumbnails, which generic BI tools never will.
> **Scope note:** grounded strictly in Saarthi's *real* fields (verified in `frontend/src/lib/api.ts`, `backend/calculator*.py`, `backend/account_aggregator.py`). Where a field doesn't exist yet (Pipeline B total-spend, revenue/CRM), it's marked.

---

## Table of Contents

1. Vision & the "one portal" thesis
2. Why this is buildable
3. Saarthi's unfair advantages over Looker / Power BI
4. **The Semantic Layer** (definition schemas + complete catalogs + the ratio rule)
5. **The Pivot / Aggregation Engine** (algorithm + worked example)
6. **Chart Catalog** (full spec card per chart)
7. **The universal Chart Data Contract**
8. **The Explore experience** (build UI + chart-suggestion decision table)
9. **Interactivity** (filters, cross-filter, drill-down/through, tooltips, top-N, sort)
10. **Time Intelligence** (exact formulas)
11. **Filters & Controls** (full model)
12. **Formatting & Number Display** (Indian numbering, currency, deltas)
13. **Color & Visual System**
14. **Saarthi-Native chart features** (annotations, RCA overlays, targets, thumbnails)
15. **Curated Dashboards** (concrete tile lists)
16. **Dashboard Canvas & Layout Schema** (full JSON)
17. **Export, Scheduling, Embedding**
18. **Performance & Compute Tiers** (budgets)
19. **Architecture & file-level fit**
20. **Accessibility**
21. **Empty / Loading / Error / Partial states**
22. **Governance**
23. **Constraints & honest limits**
24. **Phased build plan**
25. **Open decisions**

---

## 1. Vision & the "One Portal" Thesis

Today Saarthi has *fixed* dashboards: a creative directory, top performers, campaign performance, an account overview. Powerful, but the shape of every question is pre-decided by whoever built the screen. A real analyst always has the next question — "okay but split that by city and creative type, weekday only, versus last month" — and today the only answer is "export to Looker."

The Analytics layer removes that ceiling: **any dimension × any measure × any chart, on a savable canvas, filtered and compared any way, over any connected source.** It turns Saarthi from a reporting tool into an analysis tool.

The "one portal" payoff isn't just convenience. It's that analysis done *inside* Saarthi carries context that leaves the building the moment you export: what you changed (Change Log), what you were aiming for (Targets), why a number moved (RCA), and what the ad actually looks like (creative thumbnails). §3 and §14 make this concrete.

---

## 2. Why This Is Buildable (not a rewrite)

The three hard prerequisites of any BI tool already exist in Saarthi:

1. **A row-level fact table.** `raw_daily` per channel is already one row per creative per day with every dimension attached (§4.3) + the base measures. That *is* a star-schema fact table; a BI tool is a pivot-and-visualize engine over one.
2. **An aggregation engine.** `aggregator.ts` already sums daily rows into any date range client-side, instantly; `account_aggregator.py` already blends channels with correct ratio math. §5 generalizes these from "sum by date range" to "group by any dims, aggregate any measures."
3. **A charting library + dimension system already in the stack.** Recharts (used in `CreativeDetailModal`), `hierarchy.ts`, `metrics.ts`, the existing filter/date components.

**Net:** the work is (a) a formal semantic model, (b) a generalized pivot engine, (c) a chart-component set over Recharts, (d) an Explore UI + dashboard canvas. Not a warehouse, not a new stack.

---

## 3. Saarthi's Unfair Advantages Over Looker / Power BI

Replicating Looker gives a worse Looker. The reason to build this *here*:

| Advantage | Looker / PBI | Saarthi | Where in this doc |
|---|---|---|---|
| **Change annotations on any time series** | manual static notes | Change Log events auto-plot as vertical markers | §14.1 |
| **"Why did it move" overlays** | impossible (no notion of why) | RCA rate/mix decomposition inline | §14.2 |
| **Target reference lines / goal bands** | manual, static | live Targets as reference lines | §14.3 |
| **Actual creative thumbnails inside charts/tables** | impossible | scatter points and table rows show the real ad image | §14.4 |
| **Blended-ratio correctness enforced** | easy to average CTRs wrong | semantic layer makes wrong blends impossible | §4.6 |
| **One access model** | separate sharing system | existing grants already scope queryable data | §22 |
| **Zero-round-trip Explore** | every query round-trips | client-side pivot over IndexedDB rows | §18 |

---

## 4. The Semantic Layer

> The single most important part of the whole system. A BI tool is exactly as trustworthy as its semantic layer. Everything downstream — every chart, every number a client sees — inherits the correctness (or the lies) defined here.

### 4.1 Model overview

Three registries, one source of truth (a shared TS module the frontend uses and the backend mirrors — §25 decision 2):
- **Dimensions** — what you can slice/group by.
- **Measures** — what you can aggregate.
- **Sources** — which fact table a dim/measure comes from, and its grain.

Plus supporting concepts: **calculated fields** (user-defined measures), **normalization maps** (unify cross-platform vocabularies), **formatters** (display rules).

### 4.2 Dimension definition schema

```jsonc
{
  "id": "campaign_type",
  "label": "Campaign Type",
  "type": "categorical",            // temporal | categorical | geographic | numeric-binned
  "sources": ["google_creative", "meta_creative"],
  "field": "campaign_type",         // the raw row field it reads
  "values": "dynamic",              // "dynamic" (derive from data) | explicit enum
  "normalizationMap": "objective",  // optional — see §4.9
  "hierarchy": {                    // optional — enables drill-down
    "parent": "channel",
    "child": "campaign"
  },
  "defaultSort": "by_measure_desc", // by_measure_desc | alpha | custom
  "cardinalityHint": "low",         // low | medium | high — drives chart suggestions
  "icon": "Megaphone",
  "formatter": null                 // categorical rarely needs one; temporal/geo do
}
```

### 4.3 Complete Dimension Catalog

| id | label | type | sources | field | cardinality | hierarchy parent→child | notes |
|---|---|---|---|---|---|---|---|
| `date` | Date | temporal | all | `date` | high | — (grain rolls day→week→month→qtr→year) | the universal time axis |
| `channel` | Channel | categorical | all | `platform` | low | root → campaign_type | Google Ads, Meta Ads, … |
| `campaign_type` | Campaign Type / Objective | categorical | all | `campaign_type` | low | channel → campaign | normalized via `objective` map (§4.9) |
| `campaign` | Campaign | categorical | all | `campaign_name` | medium | campaign_type → ad_group | |
| `ad_group` | Ad Group / Ad Set | categorical | all | `ad_group` | medium | campaign → creative | label flips to "Ad Set" for Meta |
| `creative` | Creative | categorical | creative sources | `creative_id` | high | ad_group → (leaf) | carries `creative_url` for thumbnails |
| `creative_type` | Creative Type | categorical | all | `creative_type` | low | — | Image / Video / Text |
| `city` | City / Location | geographic | all | `city` | medium | — | maps to a geo layer (§6.7) |
| `funnel` | Funnel | categorical | all | `funnel` | low | — | TOFU/MOFU (G) · Awareness/Traffic/Conversions (M), normalized via `funnel` map |
| `status` | Status | categorical | all | `status` | low | — | Enabled / Paused |
| `ad_name` | Ad Name | categorical | meta_creative | `ad_name` | high | — | Meta only |
| `age_group` | Age Group | categorical | google_creative | `age_group` | low | — | Google only |
| `category` | Category | categorical | google_creative | `category` | low | — | Google only |
| `network` | Network | categorical | campaign_perf (Pipeline B) | `network` | low | — | Search/Maps/Display/YouTube — **not built yet** |
| `week`, `month`, `quarter`, `year`, `dow` | Date parts | temporal-derived | all | derived from `date` | low–med | — | `dow` = day-of-week, for seasonality heatmaps |

> **Derived temporal dimensions** (`week`, `month`, `dow`, …) are computed from `date` at query time — not stored. `dow` in particular unlocks the weekday-seasonality heatmap (§6.5) with zero new data.

### 4.4 Measure definition schema

```jsonc
{
  "id": "ctr",
  "label": "CTR",
  "class": "ratio",                 // additive | ratio | weighted-average
  "sources": ["google_creative", "meta_creative"],
  // additive → { "field": "clicks" }
  // ratio    → { "numerator": "clicks", "denominator": "impressions", "scale": 100 }
  // weighted → { "value": "hook_rate_raw", "weight": "impressions" }
  "formula": { "numerator": "clicks", "denominator": "impressions", "scale": 100 },
  "format": { "type": "percent", "decimals": 2, "abbreviate": false },
  "polarity": "higher_better",      // higher_better | lower_better | neutral
  "goodThreshold": null,            // optional — colors the value good/bad
  "nullHandling": "zero"            // zero | omit — how missing base values behave
}
```

### 4.5 Complete Measure Catalog

**Base additive measures** (safe to sum across any dimension):

| id | label | class | field | format | polarity |
|---|---|---|---|---|---|
| `impressions` | Impressions | additive | `impressions` | number, abbreviate | neutral |
| `clicks` | Clicks | additive | `clicks` | number, abbreviate | neutral |
| `cost` | Spend | additive | `cost` | currency ₹ | neutral (vs Target) |
| `conversions` | Leads / Conversions | additive | `conversions` | number | higher_better |
| `landing_page_views` | Landing Page Views | additive | `landing_page_views` | number | higher_better | (Meta) |
| `thruplays` | ThruPlays | additive | `thruplays` | number | higher_better | (Meta) |

**Ratio measures** (recomputed from summed base — §4.6):

| id | label | numerator / denominator | scale | format | polarity |
|---|---|---|---|---|---|
| `ctr` | CTR | clicks / impressions | ×100 | percent 2dp | higher_better |
| `cpc` | CPC | cost / clicks | — | ₹ 2dp | lower_better |
| `cpm` | CPM | cost / impressions | ×1000 | ₹ 2dp | lower_better |
| `cvr` | CVR / CR | conversions / clicks | ×100 | percent 2dp | higher_better |
| `cpl` | CPL / CPA | cost / conversions | — | ₹ 0dp | lower_better |
| `lpv_rate` | LPV Rate | landing_page_views / clicks | ×100 | percent 2dp | higher_better | (Meta; new calc field) |
| `thruplay_rate` | ThruPlay Rate | thruplays / impressions | ×100 | percent 2dp | higher_better | (Meta) |

**Weighted-average measures** (Meta — averaged by a weight, NOT summed, NOT simple-averaged):

| id | label | value / weight | format | polarity |
|---|---|---|---|---|
| `hook_rate` | Hook Rate | hook_rate_raw weighted by impressions | percent | higher_better |
| `video_avg_watch_time` | Avg Watch Time | watch_time weighted by thruplays | duration (s) | higher_better |

> These are already computed correctly upstream in the Apps Script per RCA-plan-adjacent logic; the semantic layer must carry the **weight accumulators** (Σ value×weight, Σ weight) through the pivot so re-grouping stays correct (§5.2).

**Contribution/share measures** (computed relative to the current query's total, always available):

| id | label | definition |
|---|---|---|
| `pct_of_total` | % of Total | this row's measure ÷ query total for that measure |
| `share_impr` | Impression Share | this row's impressions ÷ total impressions |

### 4.6 THE RULE (expanded)

> **A ratio or weighted-average measure is NEVER pre-aggregated, averaged, or summed. It is recomputed from summed base fields at the exact grain of the chart.**

**Why, concretely.** Suppose a user builds "CTR by campaign." Campaign A: 60,000 impr / 2,700 clicks; Campaign B: 140,000 impr / 1,540 clicks.
- ✅ Correct A-bar: 2,700 / 60,000 = **4.50%**. Correct account total: (2,700+1,540)/(60,000+140,000) = 4,240/200,000 = **2.12%**.
- ❌ Wrong (average of daily CTRs, or average of creative CTRs): would produce a number that doesn't reconcile to the real blended rate and shifts with grain — the classic Simpson's-paradox error (see `RCA_ENGINE_PLAN.md` §3, §5, same math).

**Enforcement, not documentation.** The pivot engine (§5) only ever stores summed base fields per group; ratio measures are a *pure function of the summed bases*, evaluated at render. There is no code path that could average a ratio. The Explore UI (§8) additionally refuses to drop a ratio measure into an encoding that implies averaging. Correctness is structural.

### 4.7 Calculated fields (user-defined measures) — grammar

Users define new measures with a small, safe expression language over existing measures and a fixed function set:

**Operators:** `+ − × ÷` (÷ auto-uses safe-divide → 0 on zero denominator).
**Functions:** `SAFE_DIV(a,b)`, `IF(cond, x, y)`, `MIN/MAX/ABS`, `SUM(measure)` (explicit aggregation), literals.
**Class inference:** the editor infers additive vs ratio from the expression (a bare sum/difference of additive measures is additive; any division producing a rate is ratio) and asks the user to confirm — because the class determines whether §4.6 applies.

Examples:
```
Engagement Rate  = SAFE_DIV(clicks + thruplays, impressions) * 100      // ratio
Cost per LPV     = SAFE_DIV(cost, landing_page_views)                    // ratio
Lead Value*      = conversions * 1500                                     // additive (needs a value/lead input)
Blended ROAS*    = SAFE_DIV(revenue, cost)                                // ratio (needs revenue source)
```
(*) requires a not-yet-connected source (revenue/CRM). Calculated fields are stored per-user; admins can publish one org-wide (governed, §22).

### 4.8 Normalization maps (cross-platform vocabulary)

Different platforms name the same concept differently. A normalization map lets a cross-channel chart group sensibly while preserving raw values.

```jsonc
// "objective" map — unifies Google campaign_type + Meta objective
{
  "Lead Gen":   ["OUTCOME_LEADS", "Search", "DGen"],
  "Awareness":  ["OUTCOME_AWARENESS", "Display"],
  "Traffic":    ["OUTCOME_TRAFFIC"],
  "Shopping":   ["PMax", "Shopping"]
}
// "funnel" map — TOFU/MOFU (Google) ↔ Awareness/Traffic/Conversions (Meta)
{
  "Upper":  ["TOFU", "Awareness"],
  "Mid":    ["MOFU", "Traffic"],
  "Lower":  ["Conversions"]
}
```
A dimension with a normalization map offers a toggle: **Raw** (platform value) vs **Unified** (mapped bucket). Unmapped values fall into "Other (unmapped)" and are surfaced so the map can be extended (governed, like the Change taxonomy).

### 4.9 Grain & data sources

The semantic layer exposes each fact table as a named **source** with an explicit grain and honest coverage:

| Source | Grain | Coverage | Status |
|---|---|---|---|
| `google_creative` | creative × day | creative-attributed spend only | ✅ live |
| `meta_creative` | creative × day | creative-attributed spend only | ✅ live |
| `campaign_perf` | ad_group × day | **all** spend incl. no-creative (Maps/Search-text/pull) | ⚠️ Pipeline B, not built |
| `revenue` | order/day | first-party revenue for ROAS | ⚠️ not connected |

Charts declare their source; the UI labels "creative-attributed" vs "total spend" so a user always knows which universe they're in. Blending across sources: §4.10.

### 4.10 Data blending

Two sources can be joined on shared dimensions (date, city, campaign_type, channel) to combine measures — e.g. `revenue` (once connected) joined to `google_creative`+`meta_creative` on date×campaign gives blended ROAS. This is the same operation `account_aggregator.py` already performs across channels; blending generalizes it to arbitrary shared-key joins. Join type defaults to full-outer on the shared keys with null→0 for missing measures (surfaced, not silent).

---

## 5. The Pivot / Aggregation Engine

The generalization of `aggregator.ts`. Pure function; no I/O; unit-testable against the numbers already verified this session.

### 5.1 Input / output contract

```jsonc
// INPUT
{
  "rows": [ /* raw daily rows for the scoped source(s) + date range */ ],
  "groupBy": ["campaign_type", "channel"],   // 0..n dimensions
  "measures": ["cost", "ctr", "cpl"],        // 1..n measures
  "filters": [ /* §11 */ ],
  "topN": { "by": "cost", "n": 10, "otherBucket": true },  // optional
  "sort": { "by": "cost", "dir": "desc" }
}
// OUTPUT
{
  "groups": [
    { "keys": {"campaign_type":"Lead Gen","channel":"Meta Ads"},
      "measures": {"cost": 288002.8, "ctr": 1.2, "cpl": 121.9},
      "_bases": {"impressions": 78366604, "clicks": 940718, "cost": 288002.8, "conversions": 2362} }
  ],
  "total": { "measures": {"cost": 422415.4, "ctr": 3.33, "cpl": 86.5} },
  "meta": { "rowsScanned": 12408, "partial": false }
}
```

### 5.2 The algorithm (step by step)

```
1. FILTER rows (apply §11 filters, incl. date range and any cross-filter).
2. INIT one accumulator per distinct groupBy composite key. Each accumulator holds:
      Σimpressions, Σclicks, Σcost, Σconversions, Σlpv, Σthruplays,
      Σ(hook_rate_raw × impressions), Σ(watch_time × thruplays)   ← weighted accumulators
3. FOR each row: locate its group's accumulator, add every base field and every
   weighted-accumulator product.
4. FOR each group, COMPUTE the requested measures purely from its accumulator:
      additive  → the summed field
      ratio     → SAFE_DIV(Σnum, Σden) × scale
      weighted  → SAFE_DIV(Σ(value×weight), Σweight)
5. COMPUTE the grand-total row the same way over ALL rows (not by summing group
   ratios — recompute from the total accumulator). This is why ratios reconcile.
6. If topN set: keep top N groups by the chosen measure; fold the rest into a
   single "Other" group by summing THEIR accumulators, then recomputing measures.
7. SORT groups.
8. Attach pct_of_total / share measures relative to the total row.
9. RETURN { groups, total, meta }.
```

**Complexity:** O(rows) single pass + O(groups·measures). For a single account/channel/90-day span (~few thousand rows) this is sub-10ms in the browser (§18).

### 5.3 Worked example (reconciliation proof)

`groupBy: [channel]`, `measures: [cost, ctr]`, real Aukera May 1–Jun 24 (verified this session):

| channel | Σimpr | Σclicks | Σcost | → cost | → ctr = Σclicks/Σimpr |
|---|---|---|---|---|---|
| Google Ads | 40,458,170 | 3,017,214 | 1,344,125.84 | ₹13,44,126 | 7.46% |
| Meta Ads | 78,366,604 | 940,718 | 2,880,028.10 | ₹28,80,028 | 1.20% |
| **Total** | 118,824,774 | 3,957,932 | 4,224,153.94 | **₹42,24,154** | **3.33%** |

Total CTR = 3,957,932 / 118,824,774 = **3.33%** — recomputed from summed bases, **not** (7.46%+1.20%)/2 = 4.33% (which would be wrong). This reconciles exactly to the account-summary figure already verified. The pivot engine's correctness is testable against this table.

### 5.4 Top-N + "Other"

Ranked charts (bar, treemap) cap at N groups with the remainder folded into "Other" — computed by summing the *excluded groups' accumulators* then recomputing measures (so "Other"'s CTR is a real blended CTR, not a sum). N is a live control (§9). "Other" is visually muted and excluded from cross-filter unless explicitly clicked.

### 5.5 Totals, subtotals, null/zero

- **Grand total** always available (§5.2 step 5). **Subtotals** per parent group in pivot tables (recomputed, never summed for ratios).
- **Null base** → treated per measure's `nullHandling` (default 0). **Zero denominator** → SAFE_DIV → 0, and the cell is marked "n/a" visually so 0 CPL (no leads) isn't misread as "great, free leads."

---

## 6. Chart Catalog (full spec cards)

Every chart consumes the universal Chart Data Contract (§7). Each card: **encodings** (required ●, optional ○), **config**, **interactions**, **use / avoid**, **Saarthi example**.

### 6.1 Trend / time-series

**Line chart**
- Encodings: ● x=`date` (or any temporal-derived) ● y=1+ measures ○ color=1 breakdown dim ○ small-multiples=1 dim.
- Config: grain (day/week/month), smoothing (raw / trailing-7 / trailing-28), log-Y, markers on/off, null-gap vs connect.
- Interactions: hover crosshair tooltip (all series at that date), legend toggle, click-point → drill to that day's detail, **Change Log markers** (§14.1), **Target band** (§14.3).
- Use: any "over time." Avoid: >6 series (use small-multiples or a filter).
- Saarthi: daily `cost` by `channel` over the month, trailing-7 smoothing, budget line overlaid.

**Area / Stacked area**
- As line, but y stacked by the color dim. Config: stacked | 100%-stacked (share). 100%-stacked area over `date` × impression-share by `channel` **is the exact mix-shift the RCA engine detects** — visualized.
- Avoid stacked when series cross zero or when you need per-series exact reads (use line).

**Combo (bar + line, dual axis)**
- ● x=`date` ● bars=1 additive measure ● line=1 ratio measure, secondary axis.
- Use: "did scaling spend hurt efficiency?" — `cost` bars + `cpl` line. The single most-used diagnostic combo.

**Sparkline** — tiny inline line, no axes, for embedding a trend inside a table cell or KPI card. y=1 measure over `date`.

### 6.2 Comparison / ranking

**Bar / Column**
- ● dim (1) ● measure (1) ○ breakdown (color) ○ 2nd measure (grouped).
- Config: horizontal (long labels) | vertical, sort by measure/alpha, top-N+Other, grouped | stacked | 100%-stacked, value labels, reference line (avg/target).
- Interactions: click bar → cross-filter (§9), drill-down (campaign_type bar → its campaigns).
- Use: "which segment is biggest/best." Avoid: temporal x (use line); >~25 bars (top-N).
- Saarthi: `cost` by `campaign` (top 10, horizontal, avg reference line).

**Bullet chart** — compact actual-vs-target per row. ● dim ● measure ● target. Saarthi: each account's `conversions` vs `target_leads`.

**Diverging bar** — bars from a zero baseline, +/- colored. ● dim ● delta-measure. Saarthi: **RCA per-campaign contribution to a metric move** (rate+mix), visualized (§14.2).

### 6.3 Distribution / correlation

**Scatter**
- ● x=measure ● y=measure ○ color=dim ○ size=measure ○ point=dim value.
- Config: log axes, quadrant lines (at median or a threshold), trend line, **point = creative thumbnail** (§14.4).
- Use: relationship between two metrics, find outliers/winners — `ctr` (x) vs `cpc` (y) per `creative`, quadrant lines → top-left = high-CTR-cheap-click winners.
- Avoid: >~500 points without density/sampling.

**Bubble** — scatter + size measure (3 metrics). `ctr` × `cpl` × size=`cost` per campaign.

**Histogram** — ● 1 measure, binned. Distribution of `cpl` across all ad groups → spot the long tail. Config: bin count/width, cumulative overlay.

**Box plot** — ● dim ● measure → spread/median/outliers per segment. `cpl` spread per `campaign_type`.

### 6.4 Part-to-whole

**Pie / Donut** — ● dim (≤6 slices) ● measure. `cost` share by `channel`. Avoid >6 slices (→ bar/treemap). Donut center shows the total.

**Treemap** — ● 1–2 nested dims ● measure (size) ○ 2nd measure (color). `cost` by `campaign_type` → `campaign` (nested rectangles), color by `cpl`. Handles many categories where pie can't.

**Funnel** — ● ordered stages ● measure. Impressions → Clicks → LPV → Leads, with step conversion %. The literal marketing funnel; Meta's LPV makes this richer than Google's.

**Waterfall** — ● ordered contributions from a start to an end value. Month-start leads → per-campaign ± → month-end; **or the RCA rate/mix breakdown** as a waterfall (start CTR → rate effects → mix effects → end CTR), §14.2.

### 6.5 Matrix / table

**Pivot table** — ● 1–2 row dims ● 0–1 col dim ● 1+ measures. `campaign` (rows) × `month` (cols) = `cost` cells, with subtotals + grand total (ratios recomputed at every total level). Config: expand/collapse row groups, conditional formatting, in-cell bars/sparklines.

**Data table (enriched)** — the generalized DirectoryTree: sortable columns, conditional color (CTR heat), in-cell spend bars, **creative thumbnail column**, sticky header, virtualized rows. The workhorse for detail.

**Heatmap** — ● dim (rows) ● dim (cols) ● measure (color intensity). `city` × `dow` CTR heatmap → when/where CTR peaks. Sequential palette (§13).

### 6.6 Single-value / status

**Scorecard / KPI card** — ● 1 measure ○ comparison. Big number + ▲/▼ vs comparison period + optional sparkline. Total `conversions` MTD, +12% vs last month. The building block of curated dashboards.

**Gauge** — ● measure ● bound(s). `cost` vs monthly budget, with amber/red zones near/over 100%.

**Progress bar** — ● measure ÷ target. Already built on the account screen; reused as a tile.

### 6.7 Geographic

**Filled map (choropleth)** — ● `city`/geo ● measure (color). `cpl` by Indian city, graded. Needs a city→geo lookup (India cities → lat/lng or a region shape set).

**Bubble map** — ● geo ● measure (size). Lead volume per city as sized bubbles. Better than choropleth when regions vary wildly in size.

### 6.8 Saarthi-native (see §14 for full behavior)
**Annotated time series · RCA waterfall · Creative leaderboard · Target-banded trend.**

---

## 7. The Universal Chart Data Contract

Every chart component consumes one shape (decoupling charts from the pivot engine):

```jsonc
{
  "encoding": {
    "x":     { "dim": "date", "grain": "day" },
    "y":     [ { "measure": "cost" }, { "measure": "cpl", "axis": "secondary" } ],
    "color": { "dim": "channel" },
    "size":  { "measure": "impressions" }        // scatter/bubble only
  },
  "data": [ /* pivot engine `groups`, shaped to the encoding */ ],
  "total": { /* pivot `total` */ },
  "format": { /* per-measure formatters, §12 */ },
  "annotations": [ /* Change Log events, Target lines, RCA markers — §14 */ ],
  "interactions": { "crossFilter": true, "drillDim": "campaign", "onPointClick": "..." },
  "state": { "loading": false, "error": null, "partial": false }
}
```

A new chart type = a new component that reads this contract. No chart ever calls the API or the pivot engine directly.

---

## 8. The Explore Experience

The self-serve build surface (Looker's Explore / PBI's field well):

```
┌─ FIELDS ────────┐  ┌─ CANVAS (live) ──────────────┐  ┌─ CHART TYPE ─┐
│ Search…          │  │                               │  │ suggested ▸  │
│ ▸ Dimensions     │  │   [ chart re-renders on every │  │  Line        │
│   date · channel │  │     shelf change ]            │  │  Bar         │
│   campaign · city│  │                               │  │  Scatter ✓   │
│ ▸ Measures       │  └───────────────────────────────┘  │  Pie · Table │
│   spend · CTR    │  ┌─ SHELVES ─────────────────────┐  └──────────────┘
│   CPL · leads    │  │ X/Rows:  [campaign]           │  ┌─ FILTERS ────┐
│ ▸ Calculated  +  │  │ Y/Values:[CTR] [CPC]          │  │ date: 30d    │
└──────────────────┘  │ Color:   [channel]            │  │ channel: Meta│
                       │ Size:    [spend]              │  │ + add        │
                       └───────────────────────────────┘  └──────────────┘
```

**Behaviors:**
- Drag or click a field into a shelf → chart re-renders live (client-side pivot, no round-trip).
- **Invalid drops prevented, not errored:** a ratio measure can't enter a shelf that would average it (§4.6); a high-cardinality dim can't go into a pie (suggest treemap/bar inline).
- **Chart-type suggestion decision table** (given chosen fields):

| Fields chosen | Suggested (default) | Also offered |
|---|---|---|
| 1 temporal dim + 1+ measure | Line | Area, Combo, Table |
| 1 low-card dim + 1 measure | Bar | Pie/Donut, Treemap |
| 1 high-card dim + 1 measure | Bar (top-N) | Table, Treemap |
| 1 dim + 2 measures | Grouped bar | Scatter (if both ratio), Table |
| 2 measures, no dim breakdown | Scatter | Bubble (if 3rd measure) |
| 1 measure only | Scorecard | Gauge (if target), Histogram |
| geo dim + measure | Filled map | Bubble map, Bar |
| 2 dims + 1 measure | Heatmap | Pivot table, Stacked bar |

- Every Explore is **savable** → becomes a tile pinnable to a dashboard (§16).

---

## 9. Interactivity

| Interaction | Detailed behavior |
|---|---|
| **Global filters** | A filter bar re-scopes every tile at once. Filters flow into the pivot engine (§5 step 1). Date range reuses the existing picker. |
| **Cross-filtering** | Click a mark (bar/slice/point) → an implicit filter `{dim = clicked value}` is applied to all *other* tiles; the clicked tile highlights the selection. Click again to release. Multiple selections OR within a dim, AND across dims (§11). |
| **Drill-down** | Click a mark on a dimension with a `hierarchy` → replace that dim with its child, keeping the mark as a filter (campaign_type "Lead Gen" → its campaigns). Breadcrumb shows the path; click to go back up. Temporal drill: month → week → day. |
| **Drill-through** | Right-click a mark → menu: "See underlying creatives" (opens a filtered detail table), "Open in channel dashboard" (deep-links to `/dashboard?channel_id=…` with the filter), "Explain this change" (opens RCA for that point). |
| **Tooltips** | Hover shows every measure for the mark, formatted (§12), plus a mini creative thumbnail where the mark is a creative, plus any Change Log event on that date. |
| **Top-N control** | A live N slider on ranked charts; "Other" folds the rest (§5.4). |
| **Sort** | Any table column / bar order by any measure or dim, asc/desc. |
| **Legend** | Click to show/hide a series; shift-click to isolate. |
| **Reference lines** | Add avg / median / target / custom-value line to any cartesian chart. |

Cross-filter and drill state live in the dashboard's client state (Zustand-style store — the research report's suggested pattern, compatible here), so it survives tile-to-tile without refetch.

---

## 10. Time Intelligence (exact formulas)

All are transformations over the pivot output for a metric series `M`; one module serves every chart.

| Name | Formula | Renders as |
|---|---|---|
| **Period-over-period Δ** | `M(t) − M(t−1period)` | scorecard ▲/▼, delta column |
| **PoP %** | `(M(t) − M(t−1)) / M(t−1) × 100` | scorecard %, diverging bar |
| **MoM / WoW / DoD** | PoP with period = month / week / day | ghost line, delta col |
| **YoY** | `M(t) vs M(t−52w)` | dual line, index |
| **Trailing average** | `mean(M over trailing k days)` | smoothed line (RCA plan §7 rationale) |
| **Running / cumulative** | `Σ M from period start to t` | cumulative area vs budget line |
| **% of total** | `M(segment) / M(total)` | 100%-stacked, table col |
| **Index vs baseline** | `M(t) / M(baseline) × 100` (baseline=100) | normalized multi-line |
| **Same-day-last-week** | `M(t) vs M(t−7)` | seasonality-controlled delta |

Ratios in comparisons are always recomputed both periods from bases (§4.6), then compared — never a delta of pre-averaged ratios.

---

## 11. Filters & Controls (full model)

**Filter definition:**
```jsonc
{ "dim": "campaign_type", "op": "in", "values": ["Lead Gen","Shopping"] }
{ "dim": "cost", "op": "between", "values": [10000, 100000] }   // measure filter (post-aggregation)
{ "dim": "date", "op": "relative", "value": "last_30_days" }     // or absolute range
```
**Operators by dim type:** categorical → `in / not_in`; temporal → `range / relative (last N, MTD, QTD, YTD, custom)`; numeric/measure → `= ≠ < ≤ > ≥ between`.
**Combination:** OR within a single dimension's values, AND across different dimensions (standard BI semantics). A cross-filter (§9) is just an implicit `in` filter.
**Scope:** filters are **dashboard-global** (all tiles) or **tile-local** (one tile overrides). Precedence: tile-local > cross-filter > global.
**Measure filters** apply *after* aggregation (e.g. "campaigns with spend > ₹10k") — the engine computes groups, then filters groups.

**Control widgets:** date-range picker (+presets), dimension multi-select, search box, top-N slider, comparison toggle, metric switcher (swap a chart's measure without rebuilding), grain switcher (day/week/month), segment/pivot control (the generalized GroupingSidebar).

---

## 12. Formatting & Number Display

Agency-in-India context → **Indian numbering by default**.

| Type | Rule | Example |
|---|---|---|
| Currency | ₹ prefix, Indian grouping (lakh/crore), 0 decimals for large | `₹42,24,154` · compact `₹42.2L` / `₹4.2Cr` |
| Number | Indian grouping; abbreviate large (K/L/Cr) | `1,18,82,4774` → `1.19Cr` |
| Percent | `%` suffix, 2dp for rates; **`pp`** for percentage-point deltas | `3.33%` · `−0.88pp` |
| Duration | seconds → compact | `3.2s`, `1m 04s` |
| Delta | signed, colored by polarity (§13) | `▲ +12.4%`, `▼ −0.5pp` |
| Ratio n/a | zero-denominator → `—` not `0` | `CPL —` when 0 leads |

Compact vs full is context-driven: KPI cards and axes → compact; tables and tooltips → full. Every measure carries its formatter in the semantic model (§4.4).

---

## 13. Color & Visual System

Reuse Saarthi's existing token/tone system (`styles.css`, tones: primary/info/success/warning/danger/neutral) so charts inherit the palette + light/dark + gold/indigo/mint/rose switcher automatically.

- **Categorical series** (channels, campaign types): a fixed, colorblind-safe qualitative palette; **channel-consistent** colors (Google = its multi-hue mark isn't usable as a fill, so assign a stable hue; Meta = its blue) so a channel is the same color across every chart.
- **Sequential** (heatmaps, choropleth): single-hue light→dark ramp keyed to the active palette.
- **Diverging** (deltas, RCA rate/mix, above/below target): red↔neutral↔green, **polarity-aware** — for `lower_better` measures (CPC/CPL) the ramp inverts so "good" is always green.
- **Semantic accents:** target lines = gold; Change Log markers = neutral/amber (pending) ; RCA "mix" vs "rate" = two distinct hues held constant.
- **Accessibility:** never encode by color alone (add shape/label/pattern); maintain WCAG-AA contrast on labels; respect the existing light/dark themes.

---

## 14. Saarthi-Native Chart Features (the moat)

### 14.1 Change Log annotations
Any time-series tile can toggle **"Show changes."** The engine fetches `/api/changes` for the scoped account, and plots each on the date axis as a vertical marker with a hover card (change_type, reason, who). Colored by `change_category`. This is impossible in Looker — the events live in Saarthi. Directly answers "what did we do right before this moved?"

### 14.2 RCA overlays
On a metric time series, a detected significant move (from the RCA engine, `RCA_ENGINE_PLAN.md`) renders a small badge at that date; clicking opens the rate-vs-mix waterfall inline ("−0.88pp CTR = 84% mix, 16% rate; biggest contributor: Meta Prospecting"). A dedicated **RCA waterfall** chart type (§6.4) visualizes the decomposition as a first-class tile.

### 14.3 Target reference lines / bands
Any `cost` or `conversions` tile can overlay the account's monthly Target (`/api/account-targets`) as a reference line or a goal band (0→target shaded). A cumulative spend line against a straight-line budget pace shows over/under-pacing at a glance.

### 14.4 Creative thumbnails in charts
Scatter/bubble points and table rows for the `creative` dimension render the actual `creative_url` image. A **Creative Leaderboard** tile ranks creatives by any measure with their thumbnail + a sparkline. Looker cannot show your ad; Saarthi always can.

---

## 15. Curated Dashboards (concrete tile lists)

Ship these pre-built so there's instant value before anyone builds their own. Each is just a saved layout of Explore tiles.

**A. Account Health** (default landing analytics for an account)
1. Scorecards row: `conversions` (vs target), `cost` (vs budget), `ctr`, `cpl` — each with MoM ▲/▼.
2. Line: daily `cost` + `conversions` (dual axis), Change Log markers on.
3. 100%-stacked area: impression **share** by `channel` over time (mix drift).
4. Bar: `cpl` by `campaign_type` (top 8), avg reference line.
5. Target-banded cumulative spend vs budget.

**B. Creative Performance**
1. Creative Leaderboard: top 12 creatives by `ctr`, thumbnails + spend sparkline.
2. Scatter: `ctr` × `cpc` per creative, quadrant lines, points = thumbnails.
3. 100%-stacked bar: creative-type mix (`impressions` by `creative_type`) per campaign.
4. Table: creatives with thumbnail, all measures, conditional CTR heat.

**C. Efficiency Deep-Dive**
1. Combo: `cost` bars + `cpl` line over time.
2. Heatmap: `city` × `dow` on `cvr`.
3. Box plot: `cpl` spread by `campaign_type`.
4. Diverging bar: DoD `cpl` contribution by campaign (RCA).

**D. Weekly Client Review** (feeds the Reports/deck export, already built)
Scorecards + trend + channel split + top creatives + change log — i.e. the Business Review deck's slides as live tiles.

### Governance of curated dashboards
Admin-published, org-wide, versioned (same pattern as the Change taxonomy). A user can **duplicate** a curated dashboard into their own editable copy.

---

## 16. Dashboard Canvas & Layout Schema

**Canvas:** responsive 12-column grid; tiles have `{x,y,w,h}`; drag to move, drag-edge to resize; multiple **pages/tabs** per dashboard; text/heading tiles for annotation.

**Saved layout JSON:**
```jsonc
{
  "id": "dash_account_health",
  "name": "Account Health",
  "scope": { "account_id": "acc_aukera" },      // or template (no fixed account)
  "globalFilters": [ { "dim": "date", "op": "relative", "value": "last_30_days" } ],
  "pages": [
    {
      "id": "p1", "name": "Overview",
      "tiles": [
        { "id": "t1", "x":0,"y":0,"w":3,"h":2, "type":"scorecard",
          "explore": { "source":"account", "measures":["conversions"], "comparison":"mom", "target":"leads" },
          "titleOverride": "Leads" },
        { "id": "t2", "x":0,"y":2,"w":8,"h":4, "type":"line",
          "explore": { "measures":["cost","conversions"], "groupBy":["date"], "color":"channel",
                       "annotations":["change_log"] } }
      ]
    }
  ],
  "sharedWith": [ { "email":"...", "role":"viewer" } ],
  "owner": "sourabhchaudhari8830@gmail.com",
  "createdAt": "...", "version": 3
}
```
Storage: same gitignored-JSON / dedicated-Sheet pattern as the rest of `org_data` for v1 (§25 decision 3); a real DB later if dashboard volume demands. Each tile's `explore` block is exactly what the Explore UI (§8) produces — so building a chart and pinning it are the same object.

---

## 17. Export, Scheduling, Embedding

- **Tile/dashboard export:** PNG (modern-screenshot, as ContentMaster already uses) · PDF (print-CSS path already built for Reports) · CSV (raw pivot rows behind the chart) · deck JSON.
- **Scheduled delivery:** email a dashboard PDF on a cadence (weekly TGIM / monthly BR) — needs a scheduler (future). Reuses the Reports deck pipeline.
- **Shareable link:** a saved dashboard at a URL, access-scoped by the viewer's own grants (§22).
- **Embed:** read-only iframe for a client portal, governed.

The Reports/Decks feature (already built, `deck_builder.py` + `/reports`) and this Analytics layer **share one semantic layer** — a curated dashboard's tiles and a deck's slides are two renderings of the same Explore configs.

---

## 18. Performance & Compute Tiers

| Tier | When | Where | Budget |
|---|---|---|---|
| **Client-side** | 1 account, ≤2 channels, ≤90 days (~≤10k rows) | browser, over IndexedDB rows the dashboards already cache | pivot <10ms, chart render <100ms; **zero network** |
| **Server-side** | multi-account, or >90 days, or cross-source blends | FastAPI, extends `account_aggregator.py`, cached in the existing two-tier cache | first query ≤1.5s (Apps Script cold), cached <50ms |
| **BigQuery** | row counts past the Sheets/browser ceiling (~years of data, or agency-wide) | the migration path in `workflow.md` §7.2 Layer 5 / RCA plan §11 — **same semantic layer**, different executor | sub-second at 10M+ rows |

The semantic layer abstracts the executor: the Explore UX and chart contract are identical regardless of tier. **Rule of thumb:** single-account short-span = client; wide/long = server; massive = BigQuery. Client-side first is Saarthi's speed edge over Looker's every-query-round-trips model.

**Guardrails:** cap client-side scatter at ~500 points (sample/aggregate beyond); virtualize tables; debounce Explore re-renders (150ms) while dragging fields.

---

## 19. Architecture & File-Level Fit

**Reuse (don't rebuild):**
- `frontend/src/lib/aggregator.ts` → generalize into the pivot engine (§5).
- `frontend/src/lib/hierarchy.ts` → source of dimension hierarchies (drill-down).
- `frontend/src/lib/metrics.ts` → measure formulas (already has the ratio math).
- `backend/account_aggregator.py` → the server-tier pivot for cross-account.
- Recharts, the existing filter/date components, the theme tokens, the grants (`org_access.py`).

**New pieces:**
- `frontend/src/lib/semanticModel.ts` — the single source of truth (dims, measures, aggregation rules, normalization maps, formatters). Backend mirrors it (§25 decision 2).
- `frontend/src/lib/pivot.ts` — the pure pivot engine (§5), unit-tested against §5.3.
- `frontend/src/components/charts/*` — one thin Recharts wrapper per §6 chart, all consuming §7's contract.
- `frontend/src/components/explore/*` — the field-well/shelf Explore UI (§8).
- `frontend/src/routes/explore.tsx` (`/explore?account_id=`) and `dashboards.tsx` / `dashboards.$id.tsx`.
- Backend: extend `account_aggregator.py` into a generic `/api/pivot` for the server tier; a saved-dashboard store.

**New routes:** `/explore?account_id=` (build a chart), `/dashboards` (list), `/dashboards/:id` (view/edit). Reachable from the account overview (a "Analyze" / "Explore" button next to "Business Review").

---

## 20. Accessibility

- Every chart has a **data-table fallback** (toggle "view as table") — the most reliable a11y affordance for viz.
- Keyboard: tab to a chart, arrow through marks, Enter to drill/cross-filter; all controls (shelves, filters) keyboard-operable.
- Never color-alone (§13); ARIA labels on marks; `role` + live-region announcements for filter/drill changes.
- Respect reduced-motion (disable chart transition animations).
- Tooltips reachable by keyboard focus, not hover-only.

---

## 21. Empty / Loading / Error / Partial States

Per tile, explicitly designed (not an afterthought):
- **Loading:** skeleton in the tile's shape (bar/line silhouette), not a spinner.
- **Empty (no rows in scope):** "No data for these filters" + the active filters, with a one-click "clear filters."
- **Empty (metric n/a):** a ratio with zero denominator shows "—" per §5.5, tile explains why.
- **Error:** inline, retryable, never a blank tile or a raw stack trace.
- **Partial:** if one channel/source failed (the `partial` flag already in `account_aggregator`), the tile renders what it has + a small "some data unavailable" note — never silently drops it.

---

## 22. Governance

No new access system. The **existing grants** (`org_access.py`) already scope which accounts/channels a user can query — an analyst physically cannot build a chart over data they can't see (the pivot only ever receives rows the API already access-filtered). Dashboard/Explore **sharing** is a thin layer: owner + shared-with list, each viewer further bounded by *their own* data grants (a shared dashboard shows a viewer only the accounts they're entitled to). Org-wide calculated fields, normalization-map edits, and published curated dashboards are admin-gated (same pattern as the Change taxonomy in `Changelogfeature.md`).

---

## 23. Constraints & Honest Limits

- **Creative-spend gap** — analytics over creative sources isn't total account spend until Pipeline B (`campaign_perf`) lands. Every tile labels its source (§4.9).
- **Ratio-metric literacy** — §4.6 protects correctness, but users trained on naive tools may *expect* averaged CTRs. Every ratio measure carries a "how this is calculated" affordance.
- **Scale inversion** — the client-side speed edge flips past the row ceiling; BigQuery (§18) is the pressure valve, not optional forever.
- **Not data science** — this is descriptive/diagnostic BI (what happened, why). Forecasting/statistical modeling is the future AI layer (RCA §14, Changelog §17), not this.
- **Geo needs a lookup** — choropleth/bubble maps need a city→coordinates/region table for India; small but must be sourced.
- **Scope discipline** — the trap is building all 25 charts + a full Looker clone at once. Don't. Phase it (§24) — 4 charts on a *correct* semantic layer beats 25 on a subtly-wrong pivot.

---

## 24. Phased Build Plan (smallest verified slice first)

1. **Semantic model + pivot engine** (`semanticModel.ts`, `pivot.ts`) — codify dims/measures + the §4.6 rule; unit-test the ratio-recomputation against §5.3's real numbers. *No UI — the correctness foundation.*
2. **Chart set v1** — the 4 that cover ~80%: **line, bar, scorecard, pivot table**. Thin Recharts wrappers on §7's contract.
3. **Explore UI v1** — pick dim + measure + one of the 4 → live chart, single account/channel, client-side, with the §8 suggestion table.
4. **Save + dashboard canvas** — pin tiles to a 12-col grid; global date/dimension filters across tiles; the §16 layout schema.
5. **Curated dashboards A & B** (§15) — instant value + reference implementation for self-serve.
6. **Saarthi-native layer** — Change Log annotations + Target lines on time series (§14.1, §14.3) — the differentiators.
7. **Breadth** — rest of the chart catalog (§6), cross-filter, drill-through, full time intelligence (§10), geo.
8. **Scale** — server-tier `/api/pivot`, then BigQuery; scheduled export.

Steps 1–4 are fully buildable now against existing `raw_daily` data — no new data source required.

---

## 25. Open Decisions

1. **Charting library** — recommend staying on **Recharts** (already a dependency, covers §6). Revisit visx/ECharts/deck.gl only if 100k-point canvas rendering or advanced geo is needed later.
2. **Semantic-model location** — recommend one shared TS module as source of truth, backend importing/mirroring identical definitions, so client and server aggregation can never disagree.
3. **Saved-dashboard storage** — recommend the existing gitignored-JSON / Google-Sheet pattern for v1; move to a DB only if dashboard volume demands.
4. **Curated-first vs blank-canvas-first** — recommend shipping 2–3 curated dashboards (§15 A, B) before the blank canvas: immediate value + a reference the self-serve mode reuses.
5. **Total-spend analytics** — gated on Pipeline B. Recommend shipping creative-attributed analytics now, clearly labeled; upgrade the source when Pipeline B lands.
6. **Geo data** — confirm the India city→coordinates/region source before building map charts.
7. **Client state lib** — the research report suggests Zustand for cross-tile filter/drill state; confirm adopting it here vs the existing lighter patterns (a small store is genuinely warranted for dashboard interaction state).
