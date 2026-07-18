/**
 * frontend/src/lib/analytics/suggest.ts
 * =========================================
 * Chart-type suggestion for Explore v1 (Analytics.md §8's decision table),
 * scoped to chart-set-v1's four types (line/bar/scorecard/pivot).
 */

import { DIMENSIONS } from "./semanticModel";

export type ExploreChartType = "line" | "bar" | "scorecard" | "pivot";

export function suggestChartType(dims: string[], measures: string[]): ExploreChartType {
  if (dims.length === 0) return "scorecard";
  if (dims.length >= 2) return "pivot";

  const dim = DIMENSIONS[dims[0]];
  if (dim?.type === "temporal") return "line";
  return "bar";
}
