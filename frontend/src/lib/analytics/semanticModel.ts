/**
 * frontend/src/lib/analytics/semanticModel.ts
 * =============================================
 * The single source of truth for the Analytics layer's dimensions and
 * measures (Analytics.md §4). The pivot engine (pivot.ts) reads ONLY from
 * this model — it has no hardcoded knowledge of what CTR is or how it's
 * computed. That indirection is what makes the correctness rule (§4.6)
 * enforceable in one place.
 *
 * THE RULE (Analytics.md §4.6): a ratio or weighted-average measure is never
 * summed or averaged. It is recomputed from summed base fields at the current
 * grain. This module encodes that by describing, per measure, WHICH base
 * fields to accumulate and HOW to derive the measure from those sums — the
 * pivot engine only ever sums bases and then calls `computeMeasure`.
 *
 * Grounded in Saarthi's real row fields (frontend/src/lib/aggregator.ts
 * RawDailyRow + CreativeDimension, backend/calculator*.py).
 */

// ─────────────────────────────────────────────────────────────────────────────
// Base fields — the only things ever summed. Everything else derives from these.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The additive base fields accumulated per group. Ratio/weighted measures are
 * pure functions of these sums. `hookRateXImpr` / `watchTimeXThruplay` are the
 * weighted-average accumulators (Σ value×weight) that keep Meta's hook_rate and
 * watch_time correct across re-grouping (Analytics.md §5.2).
 */
export interface BaseAccumulator {
  impressions: number;
  clicks: number;
  cost: number;
  conversions: number;
  landing_page_views: number;
  thruplays: number;
  hookRateXImpr: number;      // Σ(hook_rate × impressions)
  watchTimeXThruplay: number; // Σ(video_avg_watch_time × thruplays)
}

export const EMPTY_ACCUMULATOR = (): BaseAccumulator => ({
  impressions: 0,
  clicks: 0,
  cost: 0,
  conversions: 0,
  landing_page_views: 0,
  thruplays: 0,
  hookRateXImpr: 0,
  watchTimeXThruplay: 0,
});

/** A flat analytics row: dimension fields + the raw base fields for one grain unit. */
export interface AnalyticsRow {
  [dim: string]: string | number | undefined;
  // base fields (numbers)
  impressions?: number;
  clicks?: number;
  cost?: number;
  conversions?: number;
  landing_page_views?: number;
  thruplays?: number;
  hook_rate?: number;            // per-row rate (weighted by impressions on accumulate)
  video_avg_watch_time?: number; // per-row seconds (weighted by thruplays on accumulate)
}

const num = (v: unknown): number => (typeof v === "number" && isFinite(v) ? v : 0);

/** Fold one raw row's base fields into an accumulator (in place). */
export function accumulate(acc: BaseAccumulator, row: AnalyticsRow): void {
  const impr = num(row.impressions);
  const thru = num(row.thruplays);
  acc.impressions += impr;
  acc.clicks += num(row.clicks);
  acc.cost += num(row.cost);
  acc.conversions += num(row.conversions);
  acc.landing_page_views += num(row.landing_page_views);
  acc.thruplays += thru;
  acc.hookRateXImpr += num(row.hook_rate) * impr;
  acc.watchTimeXThruplay += num(row.video_avg_watch_time) * thru;
}

/** Merge accumulator `b` into `a` (in place) — used for "Other" bucketing and totals. */
export function mergeAccumulators(a: BaseAccumulator, b: BaseAccumulator): void {
  a.impressions += b.impressions;
  a.clicks += b.clicks;
  a.cost += b.cost;
  a.conversions += b.conversions;
  a.landing_page_views += b.landing_page_views;
  a.thruplays += b.thruplays;
  a.hookRateXImpr += b.hookRateXImpr;
  a.watchTimeXThruplay += b.watchTimeXThruplay;
}

const safeDiv = (n: number, d: number): number => (!d ? 0 : n / d);
const round2 = (v: number): number => Math.round(v * 100) / 100;

// ─────────────────────────────────────────────────────────────────────────────
// Measures
// ─────────────────────────────────────────────────────────────────────────────

export type MeasureClass = "additive" | "ratio" | "weighted";
export type Polarity = "higher_better" | "lower_better" | "neutral";
export type FormatType = "number" | "currency" | "percent" | "duration";

export interface Measure {
  id: string;
  label: string;
  cls: MeasureClass;
  polarity: Polarity;
  format: { type: FormatType; decimals: number };
  /**
   * Derive this measure's value from a group's summed bases. This is the ONLY
   * place a measure value is produced — never by summing/averaging the measure
   * itself. Additive measures read their base sum; ratio/weighted recompute.
   * Returns `null` for genuinely undefined ratios (zero denominator) so the UI
   * can show "—" rather than a misleading 0 (Analytics.md §5.5).
   */
  compute: (a: BaseAccumulator) => number | null;
}

export const MEASURES: Record<string, Measure> = {
  // ── Additive ──────────────────────────────────────────────────────────────
  impressions: {
    id: "impressions", label: "Impressions", cls: "additive", polarity: "neutral",
    format: { type: "number", decimals: 0 }, compute: (a) => a.impressions,
  },
  clicks: {
    id: "clicks", label: "Clicks", cls: "additive", polarity: "neutral",
    format: { type: "number", decimals: 0 }, compute: (a) => a.clicks,
  },
  cost: {
    id: "cost", label: "Spend", cls: "additive", polarity: "neutral",
    format: { type: "currency", decimals: 0 }, compute: (a) => a.cost,
  },
  conversions: {
    id: "conversions", label: "Leads", cls: "additive", polarity: "higher_better",
    format: { type: "number", decimals: 0 }, compute: (a) => a.conversions,
  },
  landing_page_views: {
    id: "landing_page_views", label: "Landing Page Views", cls: "additive", polarity: "higher_better",
    format: { type: "number", decimals: 0 }, compute: (a) => a.landing_page_views,
  },
  thruplays: {
    id: "thruplays", label: "ThruPlays", cls: "additive", polarity: "higher_better",
    format: { type: "number", decimals: 0 }, compute: (a) => a.thruplays,
  },

  // ── Ratio (recomputed from summed bases — THE RULE) ─────────────────────────
  ctr: {
    id: "ctr", label: "CTR", cls: "ratio", polarity: "higher_better",
    format: { type: "percent", decimals: 2 },
    compute: (a) => (a.impressions ? round2(safeDiv(a.clicks, a.impressions) * 100) : null),
  },
  cpc: {
    id: "cpc", label: "CPC", cls: "ratio", polarity: "lower_better",
    format: { type: "currency", decimals: 2 },
    compute: (a) => (a.clicks ? round2(safeDiv(a.cost, a.clicks)) : null),
  },
  cpm: {
    id: "cpm", label: "CPM", cls: "ratio", polarity: "lower_better",
    format: { type: "currency", decimals: 2 },
    compute: (a) => (a.impressions ? round2(safeDiv(a.cost, a.impressions) * 1000) : null),
  },
  cvr: {
    id: "cvr", label: "CVR", cls: "ratio", polarity: "higher_better",
    format: { type: "percent", decimals: 2 },
    compute: (a) => (a.clicks ? round2(safeDiv(a.conversions, a.clicks) * 100) : null),
  },
  cpl: {
    id: "cpl", label: "Cost / Lead", cls: "ratio", polarity: "lower_better",
    format: { type: "currency", decimals: 0 },
    compute: (a) => (a.conversions ? Math.round(safeDiv(a.cost, a.conversions)) : null),
  },

  // ── Weighted average (Meta) ─────────────────────────────────────────────────
  hook_rate: {
    id: "hook_rate", label: "Hook Rate", cls: "weighted", polarity: "higher_better",
    format: { type: "percent", decimals: 2 },
    compute: (a) => (a.impressions ? round2(safeDiv(a.hookRateXImpr, a.impressions)) : null),
  },
  video_avg_watch_time: {
    id: "video_avg_watch_time", label: "Avg Watch Time", cls: "weighted", polarity: "higher_better",
    format: { type: "duration", decimals: 1 },
    compute: (a) => (a.thruplays ? round2(safeDiv(a.watchTimeXThruplay, a.thruplays)) : null),
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Dimensions (the sliceable fields — Analytics.md §4.3)
// ─────────────────────────────────────────────────────────────────────────────

export type DimensionType = "temporal" | "categorical" | "geographic";

export interface Dimension {
  id: string;
  label: string;
  type: DimensionType;
  /** the row field to read; for derived temporal dims (week/month/dow) see `derive` */
  field: string;
  cardinality: "low" | "medium" | "high";
  /** optional child dimension for drill-down (Analytics.md §9) */
  drillTo?: string;
  /** optional: derive the group key from the row (e.g. month from a date field) */
  derive?: (row: AnalyticsRow) => string;
}

export const DIMENSIONS: Record<string, Dimension> = {
  date:          { id: "date", label: "Date", type: "temporal", field: "date", cardinality: "high", drillTo: undefined },
  month:         { id: "month", label: "Month", type: "temporal", field: "date", cardinality: "medium",
                   derive: (r) => String(r.date ?? "").slice(0, 7), drillTo: "date" },
  dow:           { id: "dow", label: "Day of Week", type: "temporal", field: "date", cardinality: "low",
                   derive: (r) => {
                     const d = new Date(String(r.date ?? ""));
                     return isNaN(d.getTime()) ? "" : ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][d.getUTCDay()];
                   } },
  channel:       { id: "channel", label: "Channel", type: "categorical", field: "channel", cardinality: "low", drillTo: "campaign_type" },
  campaign_type: { id: "campaign_type", label: "Campaign Type", type: "categorical", field: "campaign_type", cardinality: "low", drillTo: "campaign" },
  campaign:      { id: "campaign", label: "Campaign", type: "categorical", field: "campaign_name", cardinality: "medium", drillTo: "ad_group" },
  ad_group:      { id: "ad_group", label: "Ad Group", type: "categorical", field: "ad_group", cardinality: "medium", drillTo: "creative" },
  creative:      { id: "creative", label: "Creative", type: "categorical", field: "creative", cardinality: "high" },
  creative_type: { id: "creative_type", label: "Creative Type", type: "categorical", field: "creative_type", cardinality: "low" },
  city:          { id: "city", label: "City", type: "geographic", field: "city", cardinality: "medium" },
  funnel:        { id: "funnel", label: "Funnel", type: "categorical", field: "funnel", cardinality: "low" },
  status:        { id: "status", label: "Status", type: "categorical", field: "status", cardinality: "low" },
};

/** Resolve a row's value for a dimension (using `derive` if present, else the raw field). */
export function dimValue(dim: Dimension, row: AnalyticsRow): string {
  if (dim.derive) return dim.derive(row);
  const v = row[dim.field];
  return v == null ? "" : String(v);
}
