/**
 * frontend/src/components/analytics/EncodingChart.tsx
 * ========================================================
 * Resolves a "chart-set-v1 encoding" (dim + optional breakdown + measures +
 * chart type) into the matching chart component. Shared by ExploreBuilder's
 * live preview and the saved dashboard canvas (Analytics.md §16 — "each
 * tile's `explore` block is exactly what the Explore UI produces, so
 * building a chart and pinning it are the same object").
 */

import { MEASURES, DIMENSIONS, type AnalyticsRow } from "@/lib/analytics/semanticModel";
import type { Filter } from "@/lib/analytics/pivot";
import type { ExploreChartType } from "@/lib/analytics/suggest";
import type { ChangeRecord } from "@/lib/api";
import { LineChartCard } from "./LineChartCard";
import { BarChartCard } from "./BarChartCard";
import { ScorecardCard } from "./ScorecardCard";
import { PivotTableCard } from "./PivotTableCard";

export interface ChartEncoding {
  groupBy: string;
  breakdownBy?: string;
  measures: string[];
  chartType: ExploreChartType;
  /** Line only — secondary-axis measures (Analytics.md §6.1 combo/dual-axis). */
  y2?: string[];
  /** Scorecard only — show a delta vs. the caller-supplied `previousFilters` window. */
  compareToPrevious?: boolean;
}

export function defaultTitle(encoding: ChartEncoding): string {
  const measureLabel = encoding.measures.map((m) => MEASURES[m]?.label ?? m).join(", ");
  const dimLabel = DIMENSIONS[encoding.groupBy]?.label ?? encoding.groupBy;
  const breakdownLabel = encoding.breakdownBy ? ` × ${DIMENSIONS[encoding.breakdownBy]?.label ?? encoding.breakdownBy}` : "";
  return `${measureLabel} by ${dimLabel}${breakdownLabel}`;
}

export function EncodingChart({
  rows,
  filters,
  previousFilters,
  changes,
  targetLine,
  onBarClick,
  encoding,
  title,
}: {
  rows: AnalyticsRow[];
  filters?: Filter[];
  /** Only consulted when `encoding.compareToPrevious` is set (scorecard MoM). */
  previousFilters?: Filter[];
  /** Line only (Analytics.md §14.1) — ignored by other chart types. */
  changes?: ChangeRecord[];
  /** Line only (Analytics.md §14.3) — ignored by other chart types. */
  targetLine?: { value: number; label: string };
  /** Bar only (Analytics.md §9 drill-down) — ignored by other chart types. Omit for static/saved tiles. */
  onBarClick?: (value: string) => void;
  encoding: ChartEncoding;
  title?: string;
}) {
  const { groupBy, breakdownBy, measures, chartType, y2, compareToPrevious } = encoding;

  if (measures.length === 0) {
    return <p className="text-xs text-muted-foreground">Pick at least one measure.</p>;
  }

  const resolvedTitle = title ?? defaultTitle(encoding);

  if (chartType === "scorecard") {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {measures.map((m) => (
          <ScorecardCard
            key={m}
            title={MEASURES[m]?.label ?? m}
            rows={rows}
            measure={m}
            sparklineDim={groupBy}
            filters={filters}
            previousFilters={compareToPrevious ? previousFilters : undefined}
          />
        ))}
      </div>
    );
  }

  if (chartType === "line") {
    return (
      <LineChartCard
        title={resolvedTitle}
        rows={rows}
        x={groupBy}
        y={measures}
        y2={y2}
        color={breakdownBy || undefined}
        filters={filters}
        changes={changes}
        targetLine={targetLine}
        height={320}
      />
    );
  }

  if (chartType === "bar") {
    return (
      <BarChartCard title={resolvedTitle} rows={rows} dim={groupBy} measure={measures[0]} topN={10} filters={filters} height={320} onBarClick={onBarClick} />
    );
  }

  return (
    <PivotTableCard
      title={resolvedTitle}
      rows={rows}
      rowDim={groupBy}
      colDim={breakdownBy || undefined}
      measures={measures}
      filters={filters}
      topNRows={12}
    />
  );
}
