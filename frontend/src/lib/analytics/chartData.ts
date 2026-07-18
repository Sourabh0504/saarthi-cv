/**
 * frontend/src/lib/analytics/chartData.ts
 * ===========================================
 * Reshapes pivot.ts output into the flat/matrix shapes each chart-set-v1
 * component needs (Analytics.md §7's Chart Data Contract, minus the parts
 * — annotations/interactions — later phases add). No chart ever calls
 * pivot()/the API directly; it goes through one of these builders instead,
 * so the "ratio never averaged" guarantee (semanticModel.ts) always holds.
 */

import { pivot, type Filter } from "./pivot";
import {
  MEASURES, DIMENSIONS, EMPTY_ACCUMULATOR, mergeAccumulators,
  type AnalyticsRow, type Measure, type BaseAccumulator,
} from "./semanticModel";

function computeAll(measureIds: string[], acc: BaseAccumulator): Record<string, number | null> {
  const out: Record<string, number | null> = {};
  for (const id of measureIds) {
    const m = MEASURES[id];
    out[id] = m ? m.compute(acc) : null;
  }
  return out;
}

// ── Formatting (Analytics.md §12 — zero-denominator shows "—", not 0) ────────

export function formatMeasureValue(measure: Measure | undefined, v: number | null | undefined): string {
  if (v == null) return "—";
  const decimals = measure?.format.decimals ?? 0;
  switch (measure?.format.type) {
    case "currency":
      return "₹" + v.toLocaleString("en-IN", { maximumFractionDigits: decimals, minimumFractionDigits: decimals });
    case "percent":
      return v.toFixed(decimals) + "%";
    case "duration":
      return v.toFixed(decimals) + "s";
    default:
      return v.toLocaleString("en-IN", { maximumFractionDigits: decimals });
  }
}

// ── Cartesian (line / bar) ────────────────────────────────────────────────────

export interface CartesianSeries {
  id: string;
  label: string;
}

export interface CartesianData {
  data: Record<string, number | string | null>[];
  series: CartesianSeries[];
  xKey: string;
}

/**
 * Line-chart shape: one row per x value, one column per (measure, or per
 * color-dim value when `color` is given). A color breakdown only makes sense
 * for a single measure — the color values themselves become the series.
 */
export function buildCartesian(
  rows: AnalyticsRow[],
  opts: { x: string; y: string[]; color?: string; filters?: Filter[] },
): CartesianData {
  const { x, y, color, filters } = opts;

  if (!color) {
    const result = pivot({ rows, groupBy: [x], measures: y, filters });
    const data = result.groups
      .map((g) => ({ [x]: g.keys[x], ...g.measures }))
      .sort((a, b) => String(a[x]).localeCompare(String(b[x])));
    return { data, series: y.map((id) => ({ id, label: MEASURES[id]?.label ?? id })), xKey: x };
  }

  const measureId = y[0];
  const result = pivot({ rows, groupBy: [x, color], measures: [measureId], filters });

  const xValues = Array.from(new Set(result.groups.map((g) => g.keys[x]))).sort();
  const colorValues = Array.from(new Set(result.groups.map((g) => g.keys[color])));
  const cell = new Map<string, number | null>();
  for (const g of result.groups) cell.set(`${g.keys[x]}␟${g.keys[color]}`, g.measures[measureId]);

  const data = xValues.map((xv) => {
    const row: Record<string, number | string | null> = { [x]: xv };
    for (const cv of colorValues) row[cv] = cell.get(`${xv}␟${cv}`) ?? null;
    return row;
  });
  return { data, series: colorValues.map((cv) => ({ id: cv, label: cv })), xKey: x };
}

/** Bar-chart shape: one dimension ranked by one measure, with top-N + Other. */
export function buildRanked(
  rows: AnalyticsRow[],
  opts: { dim: string; measure: string; topN?: number; filters?: Filter[] },
): CartesianData {
  const { dim, measure, topN, filters } = opts;
  const result = pivot({
    rows, groupBy: [dim], measures: [measure], filters,
    // Top-N already sorts descending and pins "Other" last (pivot.ts) — an
    // explicit `sort` here would run afterward and could re-order Other
    // ahead of a kept bar, so only ask for a sort when there's no top-N.
    topN: topN ? { by: measure, n: topN, otherBucket: true } : undefined,
    sort: topN ? undefined : { by: measure, dir: "desc" },
  });
  const data = result.groups.map((g) => ({ [dim]: g.keys[dim], ...g.measures }));
  return { data, series: [{ id: measure, label: MEASURES[measure]?.label ?? measure }], xKey: dim };
}

// ── Scorecard ──────────────────────────────────────────────────────────────

export interface ScorecardData {
  value: number | null;
  formatted: string;
  delta?: { abs: number; pct: number | null; direction: "up" | "down" | "flat" };
  sparkline?: number[];
}

/**
 * Single-measure total, optionally vs. a prior period (delta) and a trend
 * (sparkline). `previousRows` defaults to `currentRows` (the same full row
 * history) scoped by `previousFilters` — that's how a MoM comparison works
 * without fetching data twice: one array, two different date windows.
 */
export function buildScorecard(
  currentRows: AnalyticsRow[],
  measureId: string,
  opts?: { previousRows?: AnalyticsRow[]; previousFilters?: Filter[]; sparklineDim?: string; filters?: Filter[] },
): ScorecardData {
  const measure = MEASURES[measureId];
  const cur = pivot({ rows: currentRows, groupBy: [], measures: [measureId], filters: opts?.filters }).total.measures[measureId];

  let delta: ScorecardData["delta"];
  if (opts?.previousRows || opts?.previousFilters) {
    const prevRows = opts.previousRows ?? currentRows;
    const prevFilters = opts.previousFilters ?? opts.filters;
    const prev = pivot({ rows: prevRows, groupBy: [], measures: [measureId], filters: prevFilters }).total.measures[measureId];
    if (cur != null && prev != null) {
      const abs = cur - prev;
      const pct = prev !== 0 ? (abs / Math.abs(prev)) * 100 : null;
      const goodDir = measure?.polarity === "lower_better" ? abs < 0 : abs > 0;
      delta = { abs, pct, direction: abs === 0 ? "flat" : goodDir ? "up" : "down" };
    }
  }

  let sparkline: number[] | undefined;
  if (opts?.sparklineDim) {
    const series = pivot({ rows: currentRows, groupBy: [opts.sparklineDim], measures: [measureId], filters: opts?.filters });
    sparkline = series.groups
      .sort((a, b) => String(a.keys[opts.sparklineDim!]).localeCompare(String(b.keys[opts.sparklineDim!])))
      .map((g) => (typeof g.measures[measureId] === "number" ? (g.measures[measureId] as number) : 0));
  }

  return { value: cur, formatted: formatMeasureValue(measure, cur), delta, sparkline };
}

// ── Pivot table ────────────────────────────────────────────────────────────

const ALL_COLS = "__all__";

export interface PivotTableData {
  rowLabel: string;
  colLabel?: string;
  rowKeys: string[];
  colKeys: string[]; // [ALL_COLS] when there's no column dimension
  measureIds: string[];
  cell: (rowKey: string, colKey: string, measureId: string) => number | null;
  rowTotal: (rowKey: string, measureId: string) => number | null;
  colTotal: (colKey: string, measureId: string) => number | null;
  grandTotal: (measureId: string) => number | null;
}

/**
 * Rows × (optional) columns × measures, with subtotals and a grand total —
 * every total recomputed from its own summed bases (never a sum of cells),
 * which is why ratio measures reconcile at every level (Analytics.md §6.5).
 *
 * Top-N ranks ROWS by their own total (rowTotals), independent of columns —
 * NOT row×column combinations. Passing `topN` straight through to a 2D
 * pivot() call would rank cells instead of rows, and pivot.ts's Other-bucket
 * only labels the *first* groupBy dim ("Other"), leaving the column key
 * blank for the folded remainder. So the excluded rows' cells are re-merged
 * here, per column, into a properly column-keyed "Other" row.
 */
export function buildPivotTable(
  rows: AnalyticsRow[],
  opts: { rowDim: string; colDim?: string; measures: string[]; filters?: Filter[]; topNRows?: number },
): PivotTableData {
  const { rowDim, colDim, measures, filters, topNRows } = opts;
  const primaryMeasure = measures[0];

  const rowTotals = pivot({
    rows, groupBy: [rowDim], measures, filters,
    topN: topNRows ? { by: primaryMeasure, n: topNRows, otherBucket: true } : undefined,
  });
  const rowKeys = rowTotals.groups.map((g) => g.keys[rowDim]);
  const hasOther = rowKeys.includes("Other");
  const keptRowKeys = new Set(rowKeys.filter((k) => k !== "Other"));

  // Full, un-folded row×col detail — top-N is applied by hand below instead.
  const cellResult = pivot({ rows, groupBy: colDim ? [rowDim, colDim] : [rowDim], measures, filters });
  const colTotals = colDim ? pivot({ rows, groupBy: [colDim], measures, filters }) : null;
  const colKeys = colDim ? Array.from(new Set(cellResult.groups.map((g) => g.keys[colDim]))) : [ALL_COLS];

  const cellMap = new Map<string, Record<string, number | null>>();
  const otherBasesByCol = new Map<string, BaseAccumulator>();
  for (const g of cellResult.groups) {
    const rk = g.keys[rowDim];
    const ck = colDim ? g.keys[colDim] : ALL_COLS;
    if (!hasOther || keptRowKeys.has(rk)) {
      cellMap.set(`${rk}␟${ck}`, g.measures);
    } else {
      const acc = otherBasesByCol.get(ck) ?? EMPTY_ACCUMULATOR();
      mergeAccumulators(acc, g.bases);
      otherBasesByCol.set(ck, acc);
    }
  }
  for (const [ck, acc] of otherBasesByCol) {
    cellMap.set(`Other␟${ck}`, computeAll(measures, acc));
  }

  const rowTotalMap = new Map(rowTotals.groups.map((g) => [g.keys[rowDim], g.measures]));
  const colTotalMap = colDim ? new Map(colTotals!.groups.map((g) => [g.keys[colDim], g.measures])) : null;

  return {
    rowLabel: DIMENSIONS[rowDim]?.label ?? rowDim,
    colLabel: colDim ? DIMENSIONS[colDim]?.label : undefined,
    rowKeys,
    colKeys,
    measureIds: measures,
    cell: (rk, ck, mid) => cellMap.get(`${rk}␟${ck}`)?.[mid] ?? null,
    rowTotal: (rk, mid) => rowTotalMap.get(rk)?.[mid] ?? null,
    colTotal: (ck, mid) => (colTotalMap ? (colTotalMap.get(ck)?.[mid] ?? null) : cellResult.total.measures[mid]),
    grandTotal: (mid) => cellResult.total.measures[mid],
  };
}

// ── Scatter ────────────────────────────────────────────────────────────────

export interface ScatterPoint {
  id: string;
  color?: string;
  x: number | null;
  y: number | null;
  size?: number | null;
}

export interface ScatterData {
  points: ScatterPoint[];
  medianX: number | null;
  medianY: number | null;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * One point per `pointDim` value (Analytics.md §6.3) — e.g. "ctr (x) vs cpc
 * (y) per creative, quadrant lines -> top-left = high-CTR-cheap-click
 * winners." Points with a null x or y (zero-denominator ratio at that grain)
 * are dropped rather than plotted at a misleading 0. Quadrant lines are at
 * the MEDIAN of the plotted points (§6.3's "at median or a threshold"),
 * computed from what's actually on screen, not a fixed number.
 */
export function buildScatter(
  rows: AnalyticsRow[],
  opts: { pointDim: string; x: string; y: string; size?: string; color?: string; filters?: Filter[] },
): ScatterData {
  const { pointDim, x, y, size, color, filters } = opts;
  const measures = [x, y, ...(size ? [size] : [])];
  const groupBy = color && color !== pointDim ? [pointDim, color] : [pointDim];
  const result = pivot({ rows, groupBy, measures, filters });

  const points: ScatterPoint[] = result.groups
    .filter((g) => g.keys[pointDim] !== "Other")
    .map((g) => ({
      id: g.keys[pointDim],
      color: color ? g.keys[color] : undefined,
      x: g.measures[x],
      y: g.measures[y],
      size: size ? g.measures[size] : undefined,
    }))
    .filter((p) => p.x != null && p.y != null);

  return {
    points,
    medianX: median(points.map((p) => p.x as number)),
    medianY: median(points.map((p) => p.y as number)),
  };
}

// ── Funnel ─────────────────────────────────────────────────────────────────

export interface FunnelStage {
  measure: string;
  label: string;
  value: number;
  /** null for the first stage — nothing to compare it to. */
  pctOfPrevious: number | null;
  pctOfFirst: number | null;
}

export interface FunnelData {
  stages: FunnelStage[];
}

const round2 = (v: number): number => Math.round(v * 100) / 100;

/**
 * Ordered stages -> step conversion % (Analytics.md §6.4: "Impressions ->
 * Clicks -> LPV -> Leads, with step conversion %"). Each stage is the
 * account-wide total for that measure — never a sum of per-row ratios —
 * computed the same way every other builder here does (via `pivot`'s total,
 * groupBy: []). A 0-valued earlier stage yields `null` percentages rather
 * than a divide-by-zero, per the "—" not "0%" convention (§5.5/§12).
 */
export function buildFunnel(rows: AnalyticsRow[], opts: { stages: string[]; filters?: Filter[] }): FunnelData {
  const { stages: stageIds, filters } = opts;
  const result = pivot({ rows, groupBy: [], measures: stageIds, filters });
  const totals = stageIds.map((m) => (typeof result.total.measures[m] === "number" ? (result.total.measures[m] as number) : 0));
  const first = totals[0];

  const stages: FunnelStage[] = stageIds.map((m, i) => ({
    measure: m,
    label: MEASURES[m]?.label ?? m,
    value: totals[i],
    pctOfPrevious: i === 0 || !totals[i - 1] ? null : round2((totals[i] / totals[i - 1]) * 100),
    pctOfFirst: i === 0 || !first ? null : round2((totals[i] / first) * 100),
  }));

  return { stages };
}

// ── Waterfall ──────────────────────────────────────────────────────────────

export interface WaterfallStep {
  label: string;
  delta: number | null; // null for the start/end anchor bars
  cumulativeStart: number;
  cumulativeEnd: number;
  type: "start" | "delta" | "end";
}

export interface WaterfallData {
  steps: WaterfallStep[];
  start: number;
  end: number;
}

/**
 * A start value, bridged by the top-N contributors' deltas, to an end value
 * (Analytics.md §6.4: "month-start leads -> per-campaign ± -> month-end").
 *
 * ADDITIVE MEASURES ONLY. This decomposes a total into a sum of per-segment
 * deltas — that's only mathematically sound for additive measures (cost,
 * conversions, impressions, clicks), where the sum of every segment's total
 * equals the grand total. For a ratio measure (CTR, CPL) the sum of
 * per-segment values does NOT equal the blended whole (that's the exact
 * mix/rate-decomposition problem RCA_ENGINE_PLAN.md exists to solve
 * properly) — bridging one here would silently misattribute the change.
 * Callers must pass an additive measure; not runtime-enforced here (mirrors
 * how buildCartesian/buildRanked trust the caller to pick a sane grain),
 * but documented loudly because getting this wrong produces a confident,
 * good-looking, WRONG chart — the worst kind.
 */
export function buildWaterfall(
  rows: AnalyticsRow[],
  opts: { dim: string; measure: string; currentFilters: Filter[]; previousFilters: Filter[]; topN?: number },
): WaterfallData {
  const { dim, measure, currentFilters, previousFilters, topN = 6 } = opts;

  const asNum = (v: number | null | undefined): number => (typeof v === "number" ? v : 0);
  const start = asNum(pivot({ rows, groupBy: [], measures: [measure], filters: previousFilters }).total.measures[measure]);
  const end = asNum(pivot({ rows, groupBy: [], measures: [measure], filters: currentFilters }).total.measures[measure]);

  const curByDim = pivot({ rows, groupBy: [dim], measures: [measure], filters: currentFilters });
  const prevByDim = pivot({ rows, groupBy: [dim], measures: [measure], filters: previousFilters });
  const curMap = new Map(curByDim.groups.map((g) => [g.keys[dim], asNum(g.measures[measure])]));
  const prevMap = new Map(prevByDim.groups.map((g) => [g.keys[dim], asNum(g.measures[measure])]));
  const allKeys = new Set([...curMap.keys(), ...prevMap.keys()]);

  const deltas = Array.from(allKeys)
    .map((key) => ({ label: key, delta: (curMap.get(key) ?? 0) - (prevMap.get(key) ?? 0) }))
    .filter((d) => d.delta !== 0)
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

  const kept = deltas.slice(0, topN);
  const rest = deltas.slice(topN);
  const orderedDeltas = rest.length > 0
    ? [...kept, { label: "Other", delta: rest.reduce((sum, d) => sum + d.delta, 0) }]
    : kept;

  const steps: WaterfallStep[] = [{ label: "Start", delta: null, cumulativeStart: 0, cumulativeEnd: start, type: "start" }];
  let running = start;
  for (const d of orderedDeltas) {
    const from = running;
    running += d.delta;
    steps.push({ label: d.label, delta: d.delta, cumulativeStart: Math.min(from, running), cumulativeEnd: Math.max(from, running), type: "delta" });
  }
  // The final bar renders the REAL end total (not the running sum) so any
  // float drift from summing deltas can never desync the chart from the
  // actual current-period figure shown everywhere else on the page.
  steps.push({ label: "End", delta: null, cumulativeStart: 0, cumulativeEnd: end, type: "end" });

  return { steps, start, end };
}
