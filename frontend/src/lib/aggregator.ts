/**
 * frontend/src/lib/aggregator.ts
 * ================================
 * Client-side aggregation of raw daily rows.
 *
 * The backend sends ALL daily rows (one row per creative per day) once.
 * When the user changes the date range, this module re-aggregates in-browser
 * in < 10ms — no network call, no spinner.
 *
 * Flow:
 *   1. Load raw data once  →  sort by date  →  store in React state
 *   2. Date range changes  →  aggregateByDateRange() in useMemo  →  instant
 *      Uses binary search (O(log n)) to find boundaries instead of O(n) scan.
 *   3. City/status/funnel  →  already client-side  →  instant
 */

import type { Creative, FilterOptions } from "@/lib/api";
import { computeMetrics } from "@/lib/metrics";

// ─────────────────────────────────────────────────────────────────────────────
// Types (mirror Apps Script + backend shapes)
// ─────────────────────────────────────────────────────────────────────────────

/** Dimension fields for one creative (deduplicated, no performance data). */
export interface CreativeDimension {
  creative_url:  string;
  creative_type: "Image" | "Video" | "Text";
  campaign_name: string;
  campaign_type: string;
  city:          string;
  funnel:        string;
  ad_group:      string;
  status:        "Enabled" | "Paused";
  // Meta "Ad name" — absent for Google.
  ad_name?:      string;
}

/** One row of daily performance data for one creative on one day. */
export interface RawDailyRow {
  creative_id: string;
  date:        string;   // "YYYY-MM-DD"
  impressions: number;
  clicks:      number;
  cost:        number;
  conversions: number;
  // Extra Meta-only metrics (carried through; absent/ignored for Google rows).
  landing_page_views?:   number;
  thruplays?:            number;
  hook_rate?:            number; // per-day fraction/percentage
  video_avg_watch_time?: number; // per-day seconds
}

// ─────────────────────────────────────────────────────────────────────────────
// Core: aggregate raw rows into Creative[] for a given date range
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Aggregate daily rows into Creative[] for the given date range.
 *
 * Steps:
 *   1. Filter rows to [startDate, endDate] — O(n) array scan, < 5ms
 *   2. Sum impressions/clicks/cost/conversions per creative_id
 *   3. Join with dimensions map
 *   4. Compute CTR / CPC / CPM / CR / CPA
 *   5. Drop creatives with 0 impressions
 *
 * @param dimensions  Map of creative_id → dimension fields (from API)
 * @param dailyRows   All raw daily rows (from API, NOT pre-filtered)
 * @param startDate   "YYYY-MM-DD" or undefined (include all)
 * @param endDate     "YYYY-MM-DD" or undefined (include all)
 */
export function aggregateByDateRange(
  dimensions: Record<string, CreativeDimension>,
  dailyRows:  RawDailyRow[],   // must be pre-sorted by date (call sortDailyRows first)
  startDate?: string,
  endDate?:   string,
): Creative[] {
  // 1. Filter by date range using binary search — O(log n) instead of O(n).
  //    This is imperceptible on small datasets but future-proofs for large ones.
  //    Requires dailyRows to be sorted by date (sortDailyRows() below).
  let filtered: RawDailyRow[];
  if (!startDate && !endDate) {
    filtered = dailyRows;
  } else {
    const lo = startDate ? _lowerBound(dailyRows, startDate) : 0;
    const hi = endDate   ? _upperBound(dailyRows, endDate)   : dailyRows.length;
    filtered = dailyRows.slice(lo, hi);
  }

  // 2. Sum per creative_id. Core metrics are simple sums. Extra Meta metrics:
  //      landing_page_views, thruplays  -> sums
  //      hook_rate (plain %)            -> impression-weighted average
  //      video_avg_watch_time (seconds) -> thruplay-weighted average
  //    so we accumulate weighted sums and divide at the end. These fields are
  //    always 0 for Google rows (never set on RawDailyRow), so this is a no-op
  //    for the Google dashboard's data.
  type Bucket = {
    impr: number; clicks: number; cost: number; conv: number;
    lpv: number; thru: number; hrWsum: number; wtWsum: number;
  };
  const buckets = new Map<string, Bucket>();
  for (const row of filtered) {
    const impr = row.impressions;
    const thru = row.thruplays ?? 0;
    let b = buckets.get(row.creative_id);
    if (!b) {
      b = { impr: 0, clicks: 0, cost: 0, conv: 0, lpv: 0, thru: 0, hrWsum: 0, wtWsum: 0 };
      buckets.set(row.creative_id, b);
    }
    b.impr   += impr;
    b.clicks += row.clicks;
    b.cost   += row.cost;
    b.conv   += row.conversions;
    b.lpv    += row.landing_page_views ?? 0;
    b.thru   += thru;
    b.hrWsum += (row.hook_rate ?? 0) * impr;
    b.wtWsum += (row.video_avg_watch_time ?? 0) * thru;
  }

  // 3. Join with dimensions + compute metrics
  const creatives: Creative[] = [];
  for (const [id, m] of buckets) {
    if (m.impr <= 0) continue;          // drop zero-impression rows
    const dim = dimensions[id];
    if (!dim) continue;                 // orphan row — skip

    const metrics = computeMetrics({
      impressions: m.impr,
      clicks:      m.clicks,
      cost:        m.cost,
      conversions: m.conv,
    });

    creatives.push({
      creative_id:   id,
      creative_url:  dim.creative_url,
      creative_type: dim.creative_type,
      ad_name:       dim.ad_name,
      campaign_name: dim.campaign_name,
      campaign_type: dim.campaign_type,
      city:          dim.city,
      funnel:        dim.funnel,
      ad_group:      dim.ad_group,
      status:        dim.status,
      age_group:     "",
      category:      "",
      impressions:   m.impr,
      clicks:        m.clicks,
      cost:          m.cost,
      conversions:   m.conv,
      // Extra Meta metrics — 0 for Google creatives (harmless extra fields).
      landing_page_views:   m.lpv,
      thruplays:            m.thru,
      hook_rate:            m.impr > 0 ? m.hrWsum / m.impr : 0,
      video_avg_watch_time: m.thru > 0 ? m.wtWsum / m.thru : 0,
      ctr:           metrics.ctr,
      cpc:           metrics.cpc,
      cpm:           metrics.cpm,
      cr:            metrics.cr,
      cpa:           metrics.cpa,
      cvr:           metrics.cvr,
      cpl:           metrics.cpl,
    });
  }

  return creatives;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Derive FilterOptions from the dimensions map (no network call needed). */
export function deriveFilterOptions(
  dimensions: Record<string, CreativeDimension>,
): FilterOptions {
  const cities          = new Set<string>();
  const campaign_types  = new Set<string>();
  const campaign_names  = new Set<string>();
  const funnels         = new Set<string>();
  const statuses        = new Set<string>();

  for (const d of Object.values(dimensions)) {
    if (d.city)          cities.add(d.city);
    if (d.campaign_type) campaign_types.add(d.campaign_type);
    if (d.campaign_name) campaign_names.add(d.campaign_name);
    if (d.funnel)        funnels.add(d.funnel);
    if (d.status)        statuses.add(d.status);
  }

  return {
    cities:          Array.from(cities).sort(),
    campaign_types:  Array.from(campaign_types).sort(),
    campaign_names:  Array.from(campaign_names).sort(),
    funnels:         Array.from(funnels).sort(),
    categories:      [],
    age_groups:      [],
    statuses:        Array.from(statuses).sort(),
  };
}

/** Derive the min/max date range from daily rows (no extra API field needed). */
export function deriveAvailableRange(
  dailyRows: RawDailyRow[],
): { min: string; max: string } | null {
  if (dailyRows.length === 0) return null;
  let min = dailyRows[0].date;
  let max = dailyRows[0].date;
  for (const r of dailyRows) {
    if (r.date < min) min = r.date;
    if (r.date > max) max = r.date;
  }
  return { min, max };
}

// ────────────────────────────────────────────────────────────────────────────────
// Binary search helpers (date strings are lexicographically comparable)
// ────────────────────────────────────────────────────────────────────────────────

/**
 * Sort a RawDailyRow array in-place by date (ascending).
 * Call this ONCE after fetching from the API or IDB.
 * After sorting, aggregateByDateRange() uses binary search for O(log n) filtering.
 * YYYY-MM-DD strings are lexicographically comparable, so string comparison works.
 */
export function sortDailyRows(rows: RawDailyRow[]): RawDailyRow[] {
  return rows.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/**
 * Binary search: find the index of the first row with date >= target.
 * Precondition: rows is sorted ascending by date.
 */
function _lowerBound(rows: RawDailyRow[], target: string): number {
  let lo = 0;
  let hi = rows.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (rows[mid].date < target) lo = mid + 1;
    else                         hi = mid;
  }
  return lo;
}

/**
 * Binary search: find the index ONE PAST the last row with date <= target.
 * Precondition: rows is sorted ascending by date.
 */
function _upperBound(rows: RawDailyRow[], target: string): number {
  let lo = 0;
  let hi = rows.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (rows[mid].date <= target) lo = mid + 1;
    else                          hi = mid;
  }
  return lo;
}
