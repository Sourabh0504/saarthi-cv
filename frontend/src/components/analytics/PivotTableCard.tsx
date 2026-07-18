/**
 * frontend/src/components/analytics/PivotTableCard.tsx
 * =========================================================
 * chart-set-v1 "Pivot table" (Analytics.md §6.5): rows × optional columns ×
 * measures, with subtotals + grand total. Every total is recomputed from its
 * own summed bases (chartData.buildPivotTable), so ratio measures reconcile
 * at every level instead of drifting from an average-of-averages.
 */

import { buildPivotTable, formatMeasureValue } from "@/lib/analytics/chartData";
import { MEASURES, type AnalyticsRow } from "@/lib/analytics/semanticModel";
import type { Filter } from "@/lib/analytics/pivot";
import { chartCardClass } from "./chartTheme";

export function PivotTableCard({
  title,
  rows,
  rowDim,
  colDim,
  measures,
  topNRows = 10,
  filters,
}: {
  title: string;
  rows: AnalyticsRow[];
  rowDim: string;
  colDim?: string;
  measures: string[];
  topNRows?: number;
  filters?: Filter[];
}) {
  const table = buildPivotTable(rows, { rowDim, colDim, measures, filters, topNRows });

  return (
    <div className={chartCardClass()}>
      {title && (
        <h4 className="text-xs font-display font-semibold uppercase tracking-widest text-muted-foreground mb-2">
          {title}
        </h4>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border/60 text-muted-foreground">
              <th className="text-left font-medium py-1.5 pr-3">{table.rowLabel}</th>
              {table.colKeys.map((ck) =>
                measures.map((mid) => (
                  <th key={`${ck}:${mid}`} className="text-right font-medium py-1.5 px-2 whitespace-nowrap">
                    {table.colLabel && ck !== "__all__" ? ck : ""} {MEASURES[mid]?.label ?? mid}
                  </th>
                )),
              )}
            </tr>
          </thead>
          <tbody>
            {table.rowKeys.map((rk) => (
              <tr key={rk} className={rk === "Other" ? "text-muted-foreground" : "text-foreground"}>
                <td className="py-1.5 pr-3">{rk}</td>
                {table.colKeys.map((ck) =>
                  measures.map((mid) => (
                    <td key={`${ck}:${mid}`} className="text-right py-1.5 px-2 tabular-nums whitespace-nowrap">
                      {formatMeasureValue(MEASURES[mid], table.cell(rk, ck, mid))}
                    </td>
                  )),
                )}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-border/60 font-semibold text-foreground">
              <td className="py-1.5 pr-3">Total</td>
              {table.colKeys.map((ck) =>
                measures.map((mid) => (
                  <td key={`${ck}:${mid}`} className="text-right py-1.5 px-2 tabular-nums whitespace-nowrap">
                    {formatMeasureValue(MEASURES[mid], table.colTotal(ck, mid))}
                  </td>
                )),
              )}
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
