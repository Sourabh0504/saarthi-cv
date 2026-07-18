/**
 * frontend/src/lib/analytics/pivot.ts
 * =====================================
 * The pure pivot / aggregation engine (Analytics.md §5). Generalizes
 * aggregator.ts from "sum by date range" to "group by any dimensions,
 * aggregate any measures, with ratio/weighted measures recomputed from
 * summed bases (never averaged)."
 *
 * Pure function, no I/O, no framework. Unit-verifiable against real numbers
 * (see pivot.verify.ts — reproduces Analytics.md §5.3's Aukera reconciliation).
 *
 * Correctness guarantee: this engine ONLY ever sums base fields into
 * accumulators (semanticModel.accumulate). Measure VALUES are produced solely
 * by each measure's `compute(accumulator)` — so there is no code path that
 * could average a ratio. That is THE RULE (Analytics.md §4.6) made structural.
 */

import {
  DIMENSIONS, MEASURES, EMPTY_ACCUMULATOR, accumulate, mergeAccumulators, dimValue,
  type AnalyticsRow, type BaseAccumulator,
} from "./semanticModel";

// ── Filters (Analytics.md §11 — the subset needed at the engine level) ────────

export type Filter =
  | { dim: string; op: "in" | "not_in"; values: string[] }
  | { dim: string; op: "between"; values: [string, string] }; // temporal/string range on the dim value

export interface PivotInput {
  rows: AnalyticsRow[];
  groupBy: string[];   // dimension ids, in order (nesting order for keys)
  measures: string[];  // measure ids
  filters?: Filter[];
  topN?: { by: string; n: number; otherBucket?: boolean };
  sort?: { by: string; dir: "asc" | "desc" };
}

export interface PivotGroup {
  keys: Record<string, string>;          // { channel: "Meta Ads", ... }
  measures: Record<string, number | null>;
  /** the summed base accumulator behind this group — exposed for share/contribution + debugging */
  bases: BaseAccumulator;
}

export interface PivotResult {
  groups: PivotGroup[];
  total: { measures: Record<string, number | null>; bases: BaseAccumulator };
  meta: { rowsScanned: number; groupCount: number };
}

// ─────────────────────────────────────────────────────────────────────────────

function rowPassesFilters(row: AnalyticsRow, filters: Filter[]): boolean {
  // AND across different dimensions; a single filter's own values are its semantics.
  for (const f of filters) {
    const dim = DIMENSIONS[f.dim];
    if (!dim) continue;
    const v = dimValue(dim, row);
    if (f.op === "in" && !f.values.includes(v)) return false;
    if (f.op === "not_in" && f.values.includes(v)) return false;
    if (f.op === "between") {
      const [lo, hi] = f.values;
      if (v < lo || v > hi) return false;
    }
  }
  return true;
}

function computeMeasures(measureIds: string[], acc: BaseAccumulator): Record<string, number | null> {
  const out: Record<string, number | null> = {};
  for (const id of measureIds) {
    const m = MEASURES[id];
    out[id] = m ? m.compute(acc) : null;
  }
  return out;
}

/**
 * Group `rows` by `groupBy` dimensions, aggregate `measures`. See Analytics.md
 * §5.2 for the algorithm. Returns groups + a grand-total row (recomputed from
 * the total accumulator, NOT by summing group measures — that's why ratios
 * reconcile).
 */
export function pivot(input: PivotInput): PivotResult {
  const { rows, groupBy, measures, filters = [], topN, sort } = input;
  const dims = groupBy.map((id) => DIMENSIONS[id]).filter(Boolean);

  const accByKey = new Map<string, { keys: Record<string, string>; acc: BaseAccumulator }>();
  const totalAcc = EMPTY_ACCUMULATOR();
  let scanned = 0;

  for (const row of rows) {
    if (filters.length && !rowPassesFilters(row, filters)) continue;
    scanned++;

    // total always accumulates (over the filtered universe)
    accumulate(totalAcc, row);

    // composite group key
    const keyParts: string[] = [];
    const keys: Record<string, string> = {};
    for (const dim of dims) {
      const val = dimValue(dim, row);
      keys[dim.id] = val;
      keyParts.push(val);
    }
    const key = keyParts.join("␟"); // unit-separator, won't collide with data

    let entry = accByKey.get(key);
    if (!entry) {
      entry = { keys, acc: EMPTY_ACCUMULATOR() };
      accByKey.set(key, entry);
    }
    accumulate(entry.acc, row);
  }

  let groups: PivotGroup[] = Array.from(accByKey.values()).map((e) => ({
    keys: e.keys,
    measures: computeMeasures(measures, e.acc),
    bases: e.acc,
  }));

  // ── Top-N + Other (Analytics.md §5.4) ──────────────────────────────────────
  if (topN && topN.n > 0 && groups.length > topN.n) {
    const byMeasure = MEASURES[topN.by];
    const val = (g: PivotGroup) => {
      const v = byMeasure ? byMeasure.compute(g.bases) : g.measures[topN.by];
      return typeof v === "number" ? v : 0;
    };
    groups.sort((a, b) => val(b) - val(a));
    const kept = groups.slice(0, topN.n);
    const rest = groups.slice(topN.n);
    if (topN.otherBucket !== false && rest.length) {
      const otherAcc = EMPTY_ACCUMULATOR();
      for (const g of rest) mergeAccumulators(otherAcc, g.bases);
      kept.push({
        keys: Object.fromEntries(dims.map((d, i) => [d.id, i === 0 ? "Other" : ""])),
        measures: computeMeasures(measures, otherAcc),
        bases: otherAcc,
      });
    }
    groups = kept;
  }

  // ── Sort ────────────────────────────────────────────────────────────────────
  if (sort) {
    const dir = sort.dir === "asc" ? 1 : -1;
    if (DIMENSIONS[sort.by]) {
      groups.sort((a, b) => (a.keys[sort.by] > b.keys[sort.by] ? 1 : a.keys[sort.by] < b.keys[sort.by] ? -1 : 0) * dir);
    } else {
      const v = (g: PivotGroup) => (typeof g.measures[sort.by] === "number" ? (g.measures[sort.by] as number) : -Infinity);
      groups.sort((a, b) => (v(a) - v(b)) * dir);
    }
  }

  return {
    groups,
    total: { measures: computeMeasures(measures, totalAcc), bases: totalAcc },
    meta: { rowsScanned: scanned, groupCount: groups.length },
  };
}
