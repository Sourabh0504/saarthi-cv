/**
 * frontend/src/lib/analytics/drill.ts
 * =======================================
 * Pure logic for drill-down (Analytics.md §9): "click a mark on a dimension
 * with a hierarchy -> replace that dim with its child, keeping the mark as
 * a filter... breadcrumb shows the path; click to go back up." Uses the
 * `drillTo` chains already declared in semanticModel.ts's DIMENSIONS
 * registry (channel -> campaign_type -> campaign -> ad_group -> creative),
 * unused since Phase 1.
 */

import { DIMENSIONS } from "./semanticModel";
import type { Filter } from "./pivot";

export interface DrillStep {
  dim: string;
  value: string;
}

export function canDrill(dim: string): boolean {
  return !!DIMENSIONS[dim]?.drillTo;
}

/** Push a drill step: the user clicked `clickedValue` while viewing by `currentDim`. */
export function drillInto(path: DrillStep[], currentDim: string, clickedValue: string): DrillStep[] {
  if (!canDrill(currentDim) || clickedValue === "Other") return path;
  return [...path, { dim: currentDim, value: clickedValue }];
}

/** Truncate the path back to (and including) the step at `index`, or clear entirely for -1 ("All"). */
export function drillUpTo(path: DrillStep[], index: number): DrillStep[] {
  if (index < 0) return [];
  return path.slice(0, index + 1);
}

/** The dimension actually being viewed right now, given the root choice and how deep the path goes. */
export function effectiveGroupBy(rootDim: string, path: DrillStep[]): string {
  if (path.length === 0) return rootDim;
  const last = path[path.length - 1];
  return DIMENSIONS[last.dim]?.drillTo ?? last.dim;
}

/** Each drilled step becomes an `in` filter scoping the data to that segment. */
export function pathToFilters(path: DrillStep[]): Filter[] {
  return path.map((step) => ({ dim: step.dim, op: "in" as const, values: [step.value] }));
}
