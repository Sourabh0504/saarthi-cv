# Day-over-Day Change Detection & Automated RCA Engine
## Technical Design Plan — Saarthi Account Overview

> **Status:** Design plan — no implementation yet. This is the spec a developer implements from.
> **Goal:** Given an account (and each of its channels), automatically detect which performance metrics moved day-over-day, and mathematically attribute *each* move down the hierarchy — Channel → Campaign Type → Campaign → Ad Group → Creative — separating genuine performance change from traffic-mix shifts. Surfaced at a glance on the Account Overview screen (`/account`), per channel and blended.
> **Non-goal (for v1):** LLM-written narratives. Every insight in v1 is produced by deterministic math; an LLM narration layer is an explicit future layer (§14), not a dependency.

---

## 1. The Problem, Stated Precisely

An account manager opens the account screen and sees: **"CTR dropped from 3.00% to 2.12% since yesterday."** The questions that matter:

1. **Is this real, or noise?** (a 12-impression ad group swinging doesn't matter)
2. **Where did it come from?** Which channel → campaign type → campaign → ad group → creative is responsible?
3. **What *kind* of problem is it?** Did something genuinely get worse (a creative fatigued, a bid change backfired), or did we simply shift spend toward inherently-lower-performing inventory (a budget/allocation change)? These need opposite responses.
4. **Do we already know why?** Does a documented Change Log entry (the module already built — see `Changelogfeature.md`) coincide with the drop?

A naive engine answers #2 wrong. It sees "account CTR down, Campaign A's CTR also down → blame A." As the worked example in §5 proves, that can attribute 84% of a drop to the wrong cause. The whole value of this engine is getting #2 and #3 *correct*.

---

## 2. Metric Taxonomy — Additive vs Ratio

Every metric this engine handles falls into one of two mathematical classes. The class dictates the attribution method entirely.

### 2.1 Additive metrics (the easy ones)
`impressions`, `clicks`, `cost`/`spend`, `conversions`/`leads`.

Account total = **sum** of segment totals. Attribution is trivial:
```
ΔAccount = Σ ΔSegment_i
contribution_i = ΔSegment_i          (in absolute units)
contribution_share_i = ΔSegment_i / ΔAccount    (as a %)
```
"Who was responsible for the spend increase" = rank segments by ΔSegment_i. Done. No mix/rate subtlety because there's no denominator.

### 2.2 Ratio metrics (the hard ones — where the real engine lives)
| Metric | Formula | Numerator N | Denominator D (= mix weight basis) |
|---|---|---|---|
| CTR | clicks / impressions | clicks | **impressions** |
| CPC | cost / clicks | cost | **clicks** |
| CPM | cost / impressions × 1000 | cost | **impressions** |
| CVR / CR | conversions / clicks | conversions | **clicks** |
| CPL / CPA | cost / conversions | cost | **conversions** |
| Hook Rate (Meta) | hook / impressions | hook | **impressions** |

The critical fact: **each ratio metric weights its mix by its *own* denominator.** CTR mix is impression-share; CPC mix is click-share; CPA mix is conversion-share. The engine must key the weighting basis off the metric definition, not use impressions for everything.

### 2.3 Metric polarity (for direction/coloring/alerting)
| Metric | Up is… | Down is… |
|---|---|---|
| CTR, CVR/CR, conversions, leads, hook rate | good ▲ | bad ▼ |
| CPC, CPM, CPA/CPL | bad ▲ | good ▼ |
| Spend, impressions, clicks | neutral (context: compare to Targets, §11 of the Account Overview) | neutral |

Polarity drives whether a detected move is framed as an alert (bad) or a positive callout (good) — and colors it — but does **not** change the attribution math.

---

## 3. The Core Math — Rate vs Mix Decomposition

For a ratio metric `R = N/D` aggregated over segments `i`, rewrite the account ratio as a **weighted average of segment rates**:

```
R = ΣN_i / ΣD_i = Σ (D_i/D)·(N_i/D_i) = Σ w_i · r_i

where:
  w_i = D_i / D    → segment's share of the denominator (e.g. impression share)   ... Σw_i = 1
  r_i = N_i / D_i  → segment's own rate (e.g. segment CTR)
```

So **account CTR is a weighted average of campaign CTRs, weighted by impression share.** The day-over-day change:

```
ΔR = R₁ − R₀ = Σ(w_i,1·r_i,1) − Σ(w_i,0·r_i,0)
```
(subscript 0 = baseline day, 1 = current day)

### 3.1 The exact symmetric decomposition
Each segment's total contribution to `ΔR` decomposes **exactly** (proven identity, zero residual) into a **rate effect** and a **mix effect**:

```
Δ(w_i·r_i) = w̄_i·Δr_i  +  r̄_i·Δw_i
             └─ rate ─┘    └─ mix ─┘

where:
  w̄_i = (w_i,0 + w_i,1)/2     (average weight across the two days)
  r̄_i = (r_i,0 + r_i,1)/2     (average rate across the two days)
  Δr_i = r_i,1 − r_i,0
  Δw_i = w_i,1 − w_i,0
```

**Proof that this is exact (no interaction residual):**
```
w̄·Δr + r̄·Δw
= ½(w₀+w₁)(r₁−r₀) + ½(r₀+r₁)(w₁−w₀)
= ½(w₀r₁ − w₀r₀ + w₁r₁ − w₁r₀ + r₀w₁ − r₀w₀ + r₁w₁ − r₁w₀)
= ½(−2w₀r₀ + 2w₁r₁)          (cross terms cancel)
= w₁r₁ − w₀r₀ = Δ(w·r)   ✓
```
Using the *symmetric* (average-day) weights is what makes it exact and order-independent — as opposed to Laspeyres (base-day weights) or Paasche (current-day weights), which each leave an interaction term and bias the answer depending on which day you call "base."

### 3.2 Totals
```
Total rate effect = Σ w̄_i·Δr_i     "how much did ΔR come from segments genuinely changing their rate"
Total mix effect  = Σ r̄_i·Δw_i     "how much did ΔR come from traffic redistributing across segments"
Total rate effect + Total mix effect = ΔR   (exact)
```

### 3.3 Per-segment mix — a presentation nuance the implementer must know
The raw per-segment mix term `r̄_i·Δw_i` reconciles exactly (rate+mix = segment's true contribution), but reads oddly: a below-average segment that *gains* share shows a *positive* mix number, even though gaining low-performers is what drags the average down.

For **interpretation and ranking**, use the **mean-centered** mix:
```
mix_effect_interpretive_i = (r̄_i − R̄)·Δw_i        where R̄ = (R₀+R₁)/2
```
This reads correctly: *"an above-average segment losing share hurts (negative); a below-average segment gaining share hurts (negative)."* Because `R̄·ΣΔw_i = 0`, the **total is identical** to §3.2 — only the per-segment split differs. 

**Recommendation:** report per-segment as two separate rankings — a "Rate movers" list (`w̄_i·Δr_i`) and a "Mix movers" list (mean-centered) — rather than one blended per-segment number. This is both more correct *and* clearer to the user than forcing a single number per segment.

---

## 4. Hierarchical Attribution (Channel → Type → Campaign → Ad Group → Creative)

Two complementary strategies; the engine uses both.

### 4.1 Leaf-grain computation (the substrate)
Compute rate/mix at the **finest available grain** (creative for creative data; ad-group or `dim_id` for campaign data), with each leaf's weight = its share of the **total account (or channel) denominator**. Because rate and mix effects are additive per leaf and sum to `ΔR`, you can **group leaf contributions by any dimension** (`campaign_type`, `campaign`, `ad_group`) and the grouped sums still add up to `ΔR`. Compute once, roll up to answer "which campaign type / campaign / ad group" at any level.

### 4.2 Progressive drill-down (the UX model)
For the on-screen experience, decompose **level by level**:
1. **Level 1 — Channels:** attribute account `ΔR` across `{Google Ads, Meta Ads}`. Rank.
2. Drill into the biggest contributor → **Level 2 — Campaign Types** within that channel.
3. → **Level 3 — Campaigns** → **Level 4 — Ad Groups** → **Level 5 — Creatives**.

Each level's decomposition is self-contained and exact for that level's `ΔR`-contribution. This matches how a human actually investigates ("it's Meta → it's the Prospecting campaigns → it's this one campaign → this ad group's CTR collapsed") and gives a natural expand-to-explore interaction.

> **Block view vs leaf-sum view:** a campaign type analyzed *as a single block* (its aggregated impressions/clicks) can differ slightly from the sum of its leaves — because the block view hides intra-group mix shifts. Both are valid: the block view answers "which campaign type," the leaf-sum captures everything inside. The drill-down (§4.2) is the block view at each level; §4.1 is the safety net that guarantees full reconciliation. Show the block view; keep the leaf-sum as the "Σ reconciles to 100%" guarantee.

---

## 5. Worked Example (proving the engine earns its keep)

Account, two campaigns, yesterday (D0) → today (D1):

| Campaign | D0 impr | D0 clicks | D0 CTR | D1 impr | D1 clicks | D1 CTR |
|---|---|---|---|---|---|---|
| **A** (high CTR) | 100,000 | 5,000 | 5.00% | 60,000 | 2,700 | 4.50% |
| **B** (low CTR) | 100,000 | 1,000 | 1.00% | 140,000 | 1,540 | 1.10% |
| **Account** | 200,000 | 6,000 | **3.00%** | 200,000 | 4,240 | **2.12%** |

**Total impressions identical both days (200k). Account CTR fell 0.88pp. Why?**

Weights (impression share): A: w₀=0.50, w₁=0.30 (Δw=−0.20) · B: w₀=0.50, w₁=0.70 (Δw=+0.20)
Rates: A: Δr=−0.50pp · B: Δr=+0.10pp
Averages: w̄_A=0.40, w̄_B=0.60 · r̄_A=4.75%, r̄_B=1.05% · R̄=2.56%

**Rate effect** `Σ w̄·Δr`:
- A: 0.40 × (−0.50) = **−0.20pp**
- B: 0.60 × (+0.10) = **+0.06pp**
- **Total rate = −0.14pp**

**Mix effect** `Σ (r̄−R̄)·Δw` (interpretive form):
- A: (4.75 − 2.56) × (−0.20) = **−0.438pp**  (high-CTR A *lost* share)
- B: (1.05 − 2.56) × (+0.20) = **−0.302pp**  (low-CTR B *gained* share)
- **Total mix = −0.74pp**

**Check:** −0.14 + (−0.74) = **−0.88pp** = account ΔCTR ✓

### The insight the engine produces
> **CTR ↓ 0.88pp. Only 16% (−0.14pp) is genuine performance decline — Campaign A's CTR slipped 5.0%→4.5%. The other 84% (−0.74pp) is a traffic-mix shift: 20 points of impression share moved from high-CTR Campaign A to low-CTR Campaign B. No creative "broke" — the account is simply spending more impressions on inherently-lower-CTR inventory.**

A naive engine would have said *"CTR dropped, Campaign A's CTR dropped, fix Campaign A."* The correct action is to look at **why impression share moved to B** — a budget change, a bid change, B's campaign scaling — which the Change Log correlation (§9) may already explain. This single example is the entire justification for the rate/mix split.

---

## 6. Detection Layer (what counts as a "change" worth surfacing)

Attribution (§3–5) answers *who*. Detection decides *whether it's worth showing at all*. Two stages run in order: **detect notable moves → attribute each one.**

A metric move is surfaced only if it clears **all** of:

1. **Absolute floor** — `|ΔR|` ≥ metric-specific minimum (e.g. CTR ≥ 0.05pp; CPA ≥ ₹5). Kills trivial wiggles.
2. **Relative floor** — `|ΔR| / R₀` ≥ e.g. 3%. Kills changes that are large in absolute terms only because the base was huge.
3. **Volume floor** — the account/channel had ≥ minimum denominator on *both* days (e.g. ≥ 1,000 impressions for CTR). A metric computed on tiny volume is noise by construction.
4. **(Optional, recommended) Statistical significance** — for rate metrics on counts, a **two-proportion z-test**: is today's clicks/impressions rate different from yesterday's beyond binomial sampling noise?
   ```
   z = (p₁ − p₀) / sqrt( p·(1−p)·(1/n₁ + 1/n₀) )      p = pooled rate, n = impressions
   ```
   Flag `significant` when |z| ≥ 2 (~95%). This elevates the engine from "arithmetic" to "defensible" — an account manager can trust that a flagged CTR drop isn't just a coin-flip day. Apply the same gate per-segment when ranking contributors, so a segment's contribution isn't over-read when its own volume is thin.

Segments failing the volume/significance gate are **excluded from the "responsible" ranking** but still counted in the totals (their contribution is real arithmetic, just not individually actionable) — bucketed as "long tail / low-volume."

---

## 7. Comparison Basis (what "day-over-day" actually compares to)

Pure DoD (today vs yesterday) is what was asked, and is the default — but single-day data has real seasonality (weekday/weekend, payday spikes). The engine should support a **comparison-basis toggle**, all using the identical decomposition math with a different baseline `D0`:

| Basis | `D0` = | Best for |
|---|---|---|
| **Yesterday** (default) | previous calendar day | true day-over-day, fastest signal |
| **Trailing 7-day avg** | mean of the prior 7 days | smooths daily noise; "is today off-trend?" |
| **Same day last week** | same weekday, −7 days | controls weekly seasonality (Mon vs Mon) |

Recommendation: ship **Yesterday** in v1 (matches the ask), architect the baseline as a pluggable input so the other two are a small addition, not a rewrite.

---

## 8. Edge Cases (each needs explicit handling)

| Case | Handling |
|---|---|
| **New segment** (campaign didn't exist D0) | `w₀=0`. No rate effect computable (no D0 rate). Pure **mix-in**; bucket as "New this period." |
| **Disappeared segment** (paused today) | `w₁=0`. Pure **mix-out**; bucket as "Stopped this period." |
| **Zero denominator one day** (0 impressions D0, some D1) | Rate undefined on one side → treat as entry/exit (mix only), never fabricate a rate. |
| **Account denominator zero** (metric undefined) | Suppress that metric's RCA entirely for the day; show "no data." |
| **Cost metric, "lower is better"** | Attribution identical; only the polarity/coloring (§2.3) and alert framing flip. |
| **Creative-spend gap** | Creative data only covers spend that *has* a creative — misses pull-based/Maps/Search-text spend (documented limitation, `PROJECT_SPEC.md` §3). Campaign-level RCA derived from creative data must be labeled "creative spend" until Pipeline B (total spend) exists (§10). |
| **Rounding drift** | Contributions are computed on raw values; sum guaranteed to reconcile to `ΔR` within float epsilon. Display rounded, reconcile on raw. |

---

## 9. Connecting Detection to the Change Log (the payoff)

The engine tells you *what* moved in the numbers (`ΔCTR`, responsible segment). The **Change Log** (already built, `Changelogfeature.md`) records *what the team did*. Correlate them:

- After attributing a move to a segment, query the Change Log for documented changes on the same account **on or 1–2 days before** the change date, especially matching `Change_Category` (a CTR drop pairs naturally with `Ads`/`Creative`/`Bid Strategy` changes; a mix shift pairs with `Budget`/`Bid Strategy`).
- Surface as a **"Likely cause"** link: *"CTR ↓ concentrated in Ad Group Y — coincides with a documented change: 'New RSA created' (Jan 12, logged by …)."*
- This is exactly the deterministic seed of the AI-layer "Root Cause Analysis" capability in `Changelogfeature.md` §17 — built with math + correlation first, before any model. When v1 Change Log is account-scoped (per `PROJECT_SPEC.md` §12.1), correlation is account-level; it sharpens automatically once Change Log becomes campaign-scoped.

**This is why building the Change Log first was worth it** — the RCA engine turns it from a passive ledger into an active "here's probably why" system.

---

## 10. Data Dependencies (what's ready, what's needed)

| Need | Source | Status |
|---|---|---|
| Creative-level, per-day impr/clicks/cost/conv, with `campaign_name`/`campaign_type`/`ad_group`/`city`/`funnel` dims | existing `raw_daily` (`/api/raw-performance`) — **already carries every dimension needed to roll creatives up to ad group / campaign / campaign type** | ✅ Available now (both Google & Meta channels) |
| Two adjacent days of the above | filter existing raw_daily to `date == D0` and `date == D1` | ✅ trivial from existing data |
| **Total-spend** campaign/ad-group daily (incl. no-creative inventory) | Pipeline B (`campaignPerformanceDoGet.js` / `/api/campaign-raw-performance`) | ⚠️ TODO (`PROJECT_SPEC.md` §7.1) |
| Documented changes for correlation | Change Log (`/api/changes`) | ⚠️ built, awaiting sheet deployment (`PROJECT_SPEC.md` §12.3) |

**Consequence for phasing:** creative-level RCA *and* campaign/type/ad-group RCA *derived from creative data* can be built **now** — the raw_daily rows already contain `campaign_type`, `campaign_name`, `ad_group`. The only thing waiting on Pipeline B is *total-spend-accurate* campaign RCA (capturing Maps/Search-text/pull-based spend that has no creative). Label v1 clearly as "creative-attributed" and upgrade the denominator source later without touching the math.

---

## 11. Architecture

### 11.1 Modules
- **`backend/rca_engine.py` — pure math, zero I/O.** Input: two lists of leaf rows (each `{dims…, impressions, clicks, cost, conversions}`) for D0 and D1. Output: the structured attribution (§12). No network, no sheets, no FastAPI — **unit-testable in isolation** with synthetic rows (the §5 example becomes a test asserting −0.14 rate / −0.74 mix). This mirrors how `calculator.py` / `account_aggregator.py` are kept as pure functions.
- **`backend/rca_service.py` — orchestration.** Pulls two days of leaf data per channel (reuses the existing `fetch_raw_data(channel_id)` / raw_daily path, filters to the two dates), runs `rca_engine` per channel, blends to the account level (channel as top decomposition dimension), and correlates with `/api/changes`.
- **Routes in `main.py`:**
  - `GET /api/account-rca?account_id=&date=&basis=` → account-level, with per-channel breakdown.
  - `GET /api/channel-rca?channel_id=&date=&basis=` → single channel (also usable directly on the channel dashboards).
  - Auth/scoping via the existing `require_account_access` / `require_channel_access` dependencies — no new access model.

### 11.2 Where the math runs — recommendation
**Server-side, on-demand.** Reasons:
- The Account Overview screen already talks to server-aggregated endpoints (`/api/account-summary`) and does *not* load the large raw_daily blob — so server-side keeps the account screen's data flow simple and the payload small (only the computed insights cross the wire, not two days of raw rows).
- The math is cheap (arithmetic over a few thousand leaf rows) → on-demand computation is fast and always fresh, consistent with the project's established **"lazy, not eager, no scheduler"** principle (`architecture.md` §2.2).
- Cacheable with the existing two-tier cache, keyed `{account_id}:rca:{date}:{basis}` — an RCA for a *past* day never changes, so it caches permanently; today's recomputes cheaply.

Alternative worth noting: the **per-channel dashboards** already hold raw_daily in IndexedDB, so a *client-side* RCA there would be instant with zero backend calls. Reasonable to add later for the dashboard context; the account screen stays server-side.

### 11.3 Future: RCA history
Persisting each day's computed RCA (its own small sheet/table, like Change Log) enables trend insights: *"CTR has declined 5 days running, mix-driven every day → this is a sustained budget-allocation drift, not a one-day blip."* Out of scope for v1, enabled by the caching key above.

---

## 12. Output Schema (the contract the frontend consumes)

```jsonc
{
  "account_id": "acc_aukera",
  "date": "2026-07-14",
  "basis": "yesterday",                 // yesterday | trailing_7d | same_day_last_week
  "compared_to": "2026-07-13",
  "metrics": [
    {
      "metric": "ctr",
      "class": "ratio",
      "polarity": "higher_is_better",
      "value_current": 2.12,            // %
      "value_baseline": 3.00,
      "delta": -0.88,                   // pp for ratios, absolute for additive
      "delta_pct": -29.3,
      "significant": true,              // passed §6 gates
      "z_score": -14.2,
      "decomposition": {
        "rate_effect_total": -0.14,     // "things genuinely changed"
        "mix_effect_total": -0.74,      // "traffic redistributed"
        "rate_share": 0.16,             // 16% of the move
        "mix_share": 0.84
      },
      "top_contributors": [             // ranked, drill-down tree
        {
          "level": "channel", "key": "Meta Ads", "channel_id": "ch_aukera_meta_ads",
          "contribution": -0.61, "contribution_share": 0.69,
          "rate_effect": -0.10, "mix_effect": -0.51,
          "dominant": "mix",
          "children": [ { "level": "campaign_type", "key": "Prospecting", "...": "..." } ]
        }
      ],
      "buckets": {                      // §8 edge-case buckets
        "new_segments": [], "stopped_segments": [], "low_volume_tail_contribution": -0.03
      },
      "likely_causes": [               // §9 Change Log correlation
        { "change_id": "CH-9F2A1B", "change_type": "New RSA created",
          "logged_at": "2026-07-13", "matched_segment": "Ad Group Y", "confidence": "same_day_same_category" }
      ]
    }
    // … one object per detected metric (additive metrics use the simpler shape: contribution = ΔSegment, no rate/mix)
  ],
  "channels": [ /* same shape, scoped per channel */ ]
}
```

---

## 13. UX on the Account Overview Screen

At a glance, per the account screen's role as the "insights hub":

- A **"Day-over-Day"** strip: each key metric as a chip — value, ▲/▼, %, colored by polarity, with a subtle significance marker (bold if statistically significant, muted if within noise).
- Each *significant* chip expands into a **"Why?"** panel:
  - One deterministic sentence (template-filled from the math): *"CTR ↓ 0.88pp — 84% traffic-mix shift (share moved to low-CTR Meta Prospecting), 16% genuine decline."*
  - A **rate vs mix split bar** (the single most important visual — it tells the manager which *kind* of problem this is).
  - The **drill-down tree** (§4.2): tap a channel → campaign type → campaign → ad group, each row showing its contribution and whether it's rate- or mix-driven.
  - **Likely cause** chip linking to the Change Log entry, when correlated (§9).
- A **channel toggle** (blended account ↔ per channel), since the user explicitly wants it channel-wise — the same panel, scoped.
- Deliberately **low cognitive load**: only significant moves get the full treatment; the rest collapse into a quiet "N other metrics stable" line. (Applying the `frontend-design`/`marketing-psychology` skill guidance from earlier: one clear signal per glance, not a wall of equal numbers.)

---

## 14. Future Layers (explicitly out of v1)

- **LLM narration** — turn the deterministic decomposition into prose/summaries. The math stays the source of truth; the model only *describes* it, so it's auditable ("because CH-9F2A1B"). Directly the `Changelogfeature.md` §17 vision.
- **Multi-day / trend RCA** — §11.3.
- **Anomaly baselining** — replace fixed thresholds (§6) with per-account learned volatility bands (a metric that swings ±5% daily shouldn't alert at 3%).
- **Predictive** — "this mix drift, if it continues, lands CTR at X by month-end" — feeds the Targets pacing (Account Overview §11).
- **Cross-metric causal chains** — "CVR held, CTR fell, so leads fell purely on CTR" — linking the additive and ratio stories into one narrative.

---

## 15. Phased Build Plan (smallest verified slice first)

1. **`rca_engine.py` — pure math + tests.** Implement additive attribution and the §3 rate/mix decomposition. Unit test against the §5 worked example (assert −0.14 rate / −0.74 mix, exact reconciliation). *Verifiable in complete isolation, no data, no UI.*
2. **`rca_service.py` + `/api/channel-rca`.** Wire one channel's two-day raw_daily into the engine; verify against real Aukera data for a date pair that actually has data.
3. **Detection gates (§6)** — thresholds + z-test, so only real moves surface.
4. **Account blend + `/api/account-rca`** — channel as the top decomposition dimension.
5. **Frontend RCA panel** on `/account` — DoD strip, rate/mix bar, drill-down, channel toggle.
6. **Change Log correlation (§9)** — once the Change Log sheet is deployed.
7. **Comparison-basis toggle, campaign-total via Pipeline B, RCA history** — later.

Steps 1–2 are the foundation and are **fully buildable now** against existing data.

---

## 16. Open Decisions (flagged, not blocking this plan)

1. **Comparison basis for v1** — recommend Yesterday-only, others pluggable later (§7). Confirm.
2. **Significance test in v1 or v2** — recommend including the z-test from day one (§6.4); it's cheap and it's what makes flags trustworthy. Confirm scope.
3. **Server-side (recommended) vs client-side math** for the account screen (§11.2) — recommend server-side.
4. **Campaign RCA fidelity** — ship "creative-attributed" campaign RCA now (from raw_daily dims), upgrade to total-spend when Pipeline B lands (§10). Confirm this is acceptable as an interim.
```
