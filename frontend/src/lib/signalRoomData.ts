/**
 * frontend/src/lib/signalRoomData.ts
 * ====================================
 * Pure derivation helpers for the Signal Room (Overview/Media) dashboard.
 * No fetching here — components fetch via `lib/api.ts` and pass the raw
 * responses in. Every function here computes something *real* from that
 * data; where a Lovable-mock concept has no real backing (ROAS, full RCA
 * axes, historical baselines beyond what's actually available), it is
 * either omitted or explicitly flagged as unavailable — never fabricated.
 */

import type { RawDailyRow, CreativeDimensionMap, AccountSummaryTotals } from "@/lib/api";
import { computeMetrics, safeDiv, type Aggregated } from "@/lib/metrics";

// ── Date helpers (UTC, ISO "YYYY-MM-DD") ───────────────────────────────────

export function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return isoDate(d);
}

export function daysBetween(startIso: string, endIso: string): number {
  const a = new Date(startIso + "T00:00:00Z").getTime();
  const b = new Date(endIso + "T00:00:00Z").getTime();
  return Math.round((b - a) / 86400000) + 1;
}

/** The equal-length period immediately preceding [start, end]. */
export function previousPeriod(start: string, end: string): { start: string; end: string } {
  const len = daysBetween(start, end);
  return { start: addDays(start, -len), end: addDays(start, -1) };
}

// ── Shared preset window — used by the Accounts home feed, Overview, and
//    Media/Performance tab so all three pick date ranges identically. ──

export type Preset = "7d" | "14d" | "30d" | "MTY";
export const PRESETS: Preset[] = ["7d", "14d", "30d", "MTY"];
const PRESET_DAYS: Record<string, number> = { "7d": 7, "14d": 14, "30d": 30 };

/**
 * Trailing N days, or MTY (Month Till Yesterday: 1st of the current month
 * through yesterday, excluding today's still-accruing data — the most
 * accurate rolling monthly window, and the default everywhere it's offered,
 * since monthly goals/targets are what performance is actually tracked
 * against).
 *
 * `availableMax`, when given (e.g. a channel's real `available_date_range.max`
 * from raw performance), additionally clamps MTY's end so it never asks for
 * a day later than the real data's own extent — without it (account-summary
 * call sites have no such signal), MTY's end is just calendar-yesterday.
 */
export function presetRange(preset: Preset, availableMax?: string): { start: string; end: string } {
  const todayIso = isoDate(new Date());
  const anchorEnd = availableMax ?? todayIso;
  if (preset === "MTY") {
    const d = new Date();
    const monthStart = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;
    const yesterday = addDays(todayIso, -1);
    const mtyEnd = availableMax ? (yesterday < availableMax ? yesterday : availableMax) : yesterday;
    // Today might be the 1st of the month, in which case "yesterday" falls
    // in the previous month — fall back to day 1 rather than an inverted range.
    return { start: monthStart, end: mtyEnd < monthStart ? monthStart : mtyEnd };
  }
  return { start: addDays(anchorEnd, -(PRESET_DAYS[preset] - 1)), end: anchorEnd };
}

// ── Aggregation over raw daily rows ────────────────────────────────────────

export function sumRawRows(rows: RawDailyRow[], start: string, end: string): Aggregated {
  const totals: Aggregated = { impressions: 0, clicks: 0, cost: 0, conversions: 0 };
  for (const r of rows) {
    if (r.date < start || r.date > end) continue;
    totals.impressions += r.impressions;
    totals.clicks += r.clicks;
    totals.cost += r.cost;
    totals.conversions += r.conversions;
  }
  return totals;
}

export interface TrendPoint {
  date: string;
  impressions: number;
  clicks: number;
  cost: number;
  conversions: number;
}

/** One point per calendar day in [start, end], summed across all creatives. */
export function bucketTrend(rows: RawDailyRow[], start: string, end: string): TrendPoint[] {
  const byDate = new Map<string, TrendPoint>();
  for (const r of rows) {
    if (r.date < start || r.date > end) continue;
    const pt = byDate.get(r.date) ?? { date: r.date, impressions: 0, clicks: 0, cost: 0, conversions: 0 };
    pt.impressions += r.impressions;
    pt.clicks += r.clicks;
    pt.cost += r.cost;
    pt.conversions += r.conversions;
    byDate.set(r.date, pt);
  }
  return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
}

export interface CampaignAgg extends Aggregated {
  name: string;
  ctr: number;
  cpc: number;
  cpa: number;
}

/**
 * Groups creative-attached spend by campaign_name. This is Pipeline A data
 * (spend that has a creative attached) — NOT full campaign totals, which
 * would require Pipeline B (/api/campaign-raw-performance, not yet built).
 * Callers must label this honestly (e.g. "creative-attached spend").
 */
export function topCampaignsFromRaw(
  rows: RawDailyRow[],
  dimensions: CreativeDimensionMap,
  start: string,
  end: string,
  n = 5,
): CampaignAgg[] {
  const byCampaign = new Map<string, Aggregated>();
  for (const r of rows) {
    if (r.date < start || r.date > end) continue;
    const name = dimensions[r.creative_id]?.campaign_name ?? "(unknown campaign)";
    const agg = byCampaign.get(name) ?? { impressions: 0, clicks: 0, cost: 0, conversions: 0 };
    agg.impressions += r.impressions;
    agg.clicks += r.clicks;
    agg.cost += r.cost;
    agg.conversions += r.conversions;
    byCampaign.set(name, agg);
  }
  return Array.from(byCampaign.entries())
    .map(([name, agg]) => {
      const m = computeMetrics(agg);
      return { name, ...agg, ctr: m.ctr, cpc: m.cpc, cpa: m.cpa };
    })
    .sort((a, b) => b.cost - a.cost)
    .slice(0, n);
}

/** Real creative-attached spend grouped by the real `funnel` field (TOFU/MOFU/...). */
export function spendByFunnel(
  rows: RawDailyRow[],
  dimensions: CreativeDimensionMap,
  start: string,
  end: string,
): { funnel: string; cost: number }[] {
  const byFunnel = new Map<string, number>();
  for (const r of rows) {
    if (r.date < start || r.date > end) continue;
    const funnel = dimensions[r.creative_id]?.funnel || "Unlabeled";
    byFunnel.set(funnel, (byFunnel.get(funnel) ?? 0) + r.cost);
  }
  return Array.from(byFunnel.entries())
    .map(([funnel, cost]) => ({ funnel, cost }))
    .sort((a, b) => b.cost - a.cost);
}

// ── Pacing (real: target_spend from /api/account-targets + actual-to-date) ─

export interface PacingResult {
  allocated: number;
  achieved: number;
  expected: number;
  status: "ahead" | "on_pace" | "behind";
  pct: number;
}

export function computePacing(actualMTD: number, targetSpend: number, monthStr: string): PacingResult | null {
  if (!targetSpend) return null;
  const [year, month] = monthStr.split("-").map(Number);
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const today = new Date();
  const dayOfMonth = Math.min(today.getUTCDate(), daysInMonth);
  const expected = (targetSpend / daysInMonth) * dayOfMonth;
  const ratio = expected === 0 ? 1 : actualMTD / expected;
  return {
    allocated: targetSpend,
    achieved: actualMTD,
    expected: Math.round(expected),
    status: ratio > 1.05 ? "ahead" : ratio < 0.95 ? "behind" : "on_pace",
    pct: +((ratio - 1) * 100).toFixed(1),
  };
}

// ── Forecast (real: run-rate projection from actual-to-date) ──────────────

export interface ForecastResult {
  label: string;
  actualToDate: number;
  projectionEop: number;
  confidenceLow: number;
  confidenceHigh: number;
  planTarget: number | null;
  breachesTarget: boolean;
}

/** Simple run-rate projection — NOT a statistical model. Band is an approximate +/-8%. */
export function computeForecast(
  label: string,
  actualToDate: number,
  monthStr: string,
  planTarget: number | null,
  higherIsBetter = true,
): ForecastResult {
  const [year, month] = monthStr.split("-").map(Number);
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const today = new Date();
  const dayOfMonth = Math.min(today.getUTCDate(), daysInMonth);
  const frac = dayOfMonth / daysInMonth;
  const projection = frac === 0 ? actualToDate : actualToDate / frac;
  const band = projection * 0.08;
  const breaches =
    planTarget !== null && (higherIsBetter ? projection < planTarget * 0.95 : projection > planTarget);
  return {
    label,
    actualToDate,
    projectionEop: Math.round(projection),
    confidenceLow: Math.round(projection - band),
    confidenceHigh: Math.round(projection + band),
    planTarget,
    breachesTarget: breaches,
  };
}

// ── RCA — two-driver decomposition (CPC + CVR contribution to CPA change) ──
// A simplified, honest real approximation — not the full multi-axis engine
// documented in RCA_ENGINE_PLAN.md.

export interface RCAResult {
  cpaChangePct: number | null;
  drivers: { label: string; contributionPct: number; detail: string }[];
}

export function computeRCA(current: Aggregated, previous: Aggregated): RCAResult {
  const curM = computeMetrics(current);
  const prevM = computeMetrics(previous);
  if (!prevM.cpa) return { cpaChangePct: null, drivers: [] };

  const cpaChangePct = ((curM.cpa - prevM.cpa) / prevM.cpa) * 100;
  // CPA = CPC / CVR. Approximate each factor's %-change contribution to the CPA %-change.
  const cpcChangePct = prevM.cpc ? ((curM.cpc - prevM.cpc) / prevM.cpc) * 100 : 0;
  const cvrChangePct = prevM.cr ? ((curM.cr - prevM.cr) / prevM.cr) * 100 : 0;

  return {
    cpaChangePct: +cpaChangePct.toFixed(1),
    drivers: [
      {
        label: "CPC",
        contributionPct: +cpcChangePct.toFixed(1),
        detail: `Cost per click moved from ${prevM.cpc.toFixed(2)} to ${curM.cpc.toFixed(2)}.`,
      },
      {
        label: "Conversion rate",
        // CVR rising lowers CPA, so its contribution to CPA change is the inverse sign.
        contributionPct: +(-cvrChangePct).toFixed(1),
        detail: `Conversion rate moved from ${prevM.cr.toFixed(2)}% to ${curM.cr.toFixed(2)}%.`,
      },
    ],
  };
}

// ── Insights — real, rule-based, generated only from data already fetched ──

export interface InsightCard {
  id: string;
  severity: "info" | "warning" | "critical";
  title: string;
  body: string;
}

export function generateInsights(
  current: Aggregated,
  previous: Aggregated,
  pacing: PacingResult | null,
): InsightCard[] {
  const out: InsightCard[] = [];
  const curM = computeMetrics(current);
  const prevM = computeMetrics(previous);

  if (prevM.cpa > 0) {
    const cpaChange = ((curM.cpa - prevM.cpa) / prevM.cpa) * 100;
    if (Math.abs(cpaChange) >= 15) {
      out.push({
        id: "cpa-change",
        severity: cpaChange > 0 ? "warning" : "info",
        title: cpaChange > 0 ? "CPA rose vs. last period" : "CPA improved vs. last period",
        body: `Cost per acquisition ${cpaChange > 0 ? "rose" : "fell"} ${Math.abs(cpaChange).toFixed(1)}% (from ${prevM.cpa.toFixed(2)} to ${curM.cpa.toFixed(2)}).`,
      });
    }
  }

  if (pacing) {
    if (pacing.status === "ahead" && pacing.pct >= 15) {
      out.push({
        id: "pacing-ahead",
        severity: "critical",
        title: "Budget pacing ahead of plan",
        body: `Spend is pacing ${pacing.pct.toFixed(1)}% ahead of expected-to-date — at this rate the monthly budget may exhaust early.`,
      });
    } else if (pacing.status === "behind" && pacing.pct <= -15) {
      out.push({
        id: "pacing-behind",
        severity: "warning",
        title: "Budget pacing behind plan",
        body: `Spend is pacing ${Math.abs(pacing.pct).toFixed(1)}% behind expected-to-date.`,
      });
    }
  }

  if (prevM.ctr > 0) {
    const ctrChange = ((curM.ctr - prevM.ctr) / prevM.ctr) * 100;
    if (ctrChange <= -20) {
      out.push({
        id: "ctr-drop",
        severity: "warning",
        title: "CTR dropped vs. last period",
        body: `Click-through rate fell ${Math.abs(ctrChange).toFixed(1)}% (from ${prevM.ctr.toFixed(2)}% to ${curM.ctr.toFixed(2)}%).`,
      });
    }
  }

  return out;
}

// ── Comparison engine — DoD/WoW/MoM/QoQ/YoY x previous_period baseline ────
// Only computes a baseline when the raw data actually covers the needed
// window; otherwise the caller should show "insufficient historical data".

export type ComparisonWindow = "DoD" | "WoW" | "MoM" | "QoQ" | "YoY";
const WINDOW_DAYS: Record<ComparisonWindow, number> = { DoD: 1, WoW: 7, MoM: 30, QoQ: 90, YoY: 365 };

export interface ComparisonRow {
  metric: string;
  current: number;
  previous: number | null;
  deltaPct: number | null;
  insufficientHistory: boolean;
}

export function computeComparison(
  rows: RawDailyRow[],
  availableMin: string,
  availableMax: string,
  window: ComparisonWindow,
): ComparisonRow[] {
  const len = WINDOW_DAYS[window];
  const currentEnd = availableMax;
  const currentStart = addDays(currentEnd, -(len - 1));
  const prevEnd = addDays(currentStart, -1);
  const prevStart = addDays(prevEnd, -(len - 1));

  const insufficientHistory = prevStart < availableMin;
  const current = sumRawRows(rows, currentStart, currentEnd);
  const previous = insufficientHistory ? null : sumRawRows(rows, prevStart, prevEnd);
  const curM = computeMetrics(current);
  const prevM = previous ? computeMetrics(previous) : null;

  const metrics: { key: string; cur: number; prev: number | null }[] = [
    { key: "Spend", cur: current.cost, prev: previous?.cost ?? null },
    { key: "Conversions", cur: current.conversions, prev: previous?.conversions ?? null },
    { key: "CPA", cur: curM.cpa, prev: prevM?.cpa ?? null },
    { key: "CTR", cur: curM.ctr, prev: prevM?.ctr ?? null },
    { key: "Clicks", cur: current.clicks, prev: previous?.clicks ?? null },
  ];

  return metrics.map((m) => ({
    metric: m.key,
    current: m.cur,
    previous: m.prev,
    deltaPct: m.prev === null || m.prev === 0 ? null : +(((m.cur - m.prev) / m.prev) * 100).toFixed(1),
    insufficientHistory,
  }));
}

export function accountTotalsToAggregated(t: AccountSummaryTotals): Aggregated {
  return { impressions: t.impressions, clicks: t.clicks, cost: t.cost, conversions: t.conversions };
}

export { safeDiv };
