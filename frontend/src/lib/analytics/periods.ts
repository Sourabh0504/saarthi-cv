/**
 * frontend/src/lib/analytics/periods.ts
 * =========================================
 * Minimal time-intelligence helper (a sliver of Analytics.md §10 — full PoP/
 * MoM/YoY formulas are Phase 7 "Breadth"). Just enough to compute a MoM
 * comparison window for the curated Account Health dashboard's scorecards.
 */

const DAY_MS = 86400000;

/** The immediately-preceding period of equal length to [start, end] (inclusive, "YYYY-MM-DD"). */
export function previousPeriod(start: string, end: string): { start: string; end: string } {
  const startMs = Date.parse(start);
  const endMs = Date.parse(end);
  const days = Math.round((endMs - startMs) / DAY_MS) + 1;
  const prevEndMs = startMs - DAY_MS;
  const prevStartMs = prevEndMs - (days - 1) * DAY_MS;
  return { start: toISODate(prevStartMs), end: toISODate(prevEndMs) };
}

function toISODate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}
