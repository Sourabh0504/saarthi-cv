/**
 * frontend/src/components/analytics/HeatmapChartCard.tsx
 * ============================================================
 * Chart-set-v1 "Heatmap" (Analytics.md §6.5): rowDim × colDim × measure,
 * color intensity instead of formatted text. Reuses chartData.buildPivotTable
 * unchanged — a heatmap and a pivot table are the same matrix, only the
 * cell rendering differs, so there's no risk of the two ever disagreeing
 * about what a cell's value actually is.
 */

import { buildPivotTable, formatMeasureValue } from "@/lib/analytics/chartData";
import { MEASURES, DIMENSIONS, type AnalyticsRow } from "@/lib/analytics/semanticModel";
import type { Filter } from "@/lib/analytics/pivot";
import { heatmapRange, cellIntensity } from "@/lib/analytics/heatmap";
import { chartCardClass } from "./chartTheme";

export function HeatmapChartCard({
  title,
  rows,
  rowDim,
  colDim,
  measure,
  filters,
  topNRows = 10,
}: {
  title: string;
  rows: AnalyticsRow[];
  rowDim: string;
  colDim: string;
  measure: string;
  filters?: Filter[];
  topNRows?: number;
}) {
  const table = buildPivotTable(rows, { rowDim, colDim, measures: [measure], filters, topNRows });
  const m = MEASURES[measure];

  const allValues = table.rowKeys.flatMap((rk) => table.colKeys.map((ck) => table.cell(rk, ck, measure)));
  const range = heatmapRange(allValues);

  if (table.rowKeys.length === 0 || table.colKeys.length === 0) {
    return (
      <div className={chartCardClass()}>
        {title && <h4 className="text-xs font-display font-semibold uppercase tracking-widest text-muted-foreground mb-2">{title}</h4>}
        <p className="text-xs text-muted-foreground">No data for this period yet.</p>
      </div>
    );
  }

  return (
    <div className={chartCardClass()}>
      {title && (
        <h4 className="text-xs font-display font-semibold uppercase tracking-widest text-muted-foreground mb-2">
          {title}
        </h4>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-[11px] border-separate" style={{ borderSpacing: 3 }}>
          <thead>
            <tr>
              <th className="text-left font-medium text-muted-foreground pr-2">{DIMENSIONS[rowDim]?.label ?? rowDim}</th>
              {table.colKeys.map((ck) => (
                <th key={ck} className="font-medium text-muted-foreground px-1 whitespace-nowrap">{ck}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rowKeys.map((rk) => (
              <tr key={rk}>
                <td className="text-foreground pr-2 whitespace-nowrap">{rk}</td>
                {table.colKeys.map((ck) => {
                  const value = table.cell(rk, ck, measure);
                  const alpha = 0.08 + cellIntensity(value, range) * 0.82;
                  return (
                    <td
                      key={ck}
                      className="text-center align-middle rounded-md"
                      style={{
                        background: value == null ? "transparent" : `rgba(200, 163, 80, ${alpha})`,
                        border: value == null ? "1px dashed oklch(1 0 0 / 0.08)" : undefined,
                        color: value == null ? "var(--muted-foreground)" : "white",
                        minWidth: 44,
                        height: 28,
                      }}
                      title={`${rk} × ${ck}: ${formatMeasureValue(m, value)}`}
                    >
                      {value == null ? "—" : formatMeasureValue(m, value)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
