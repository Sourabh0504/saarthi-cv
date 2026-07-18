/**
 * frontend/src/lib/analytics/annotations.ts
 * =============================================
 * Pure logic for Analytics.md §14.1 (Change Log annotations) — the one
 * feature no generic BI tool can replicate, because the events live in
 * Saarthi. Kept separate from the chart component so the date-matching and
 * color-mapping rules are unit-verifiable without rendering anything.
 */

import type { ChangeRecord } from "@/lib/api";
import { stableColor } from "@/components/analytics/chartTheme";

/** A change's date, in the same "YYYY-MM-DD" shape chart x-axis values use. */
export function changeDate(change: ChangeRecord): string {
  return change.timestamp.slice(0, 10);
}

/** All changes whose date matches `date` exactly (a line chart's x-axis grain must be daily for these to align). */
export function changesOnDate(changes: ChangeRecord[], date: string): ChangeRecord[] {
  return changes.filter((c) => changeDate(c) === date);
}

/** The distinct dates (within `plottedDates`) that have at least one change — i.e. where a marker should render. */
export function datesWithChanges(changes: ChangeRecord[], plottedDates: string[]): string[] {
  const plotted = new Set(plottedDates);
  const withChanges = new Set(changes.map(changeDate).filter((d) => plotted.has(d)));
  return Array.from(withChanges);
}

/**
 * Color per change_category (Analytics.md §13: markers colored by category).
 * The taxonomy (changeTaxonomy.ts) has 26 categories and can grow — rather
 * than hardcode a partial, wrong-prone map, hash the category label into the
 * same qualitative palette every other categorical series uses, so a color
 * is always defined and a given category is always the same color.
 */
export function categoryColor(category: string): string {
  return stableColor(category);
}
