/**
 * frontend/src/components/analytics/BarChartCard.tsx
 * =======================================================
 * Thin Recharts wrapper over chartData.buildRanked() — chart-set-v1
 * "Bar / Column" (Analytics.md §6.2), horizontal + top-N + Other.
 */

import {
  BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
  ResponsiveContainer, Cell,
} from "recharts";
import { buildRanked, formatMeasureValue } from "@/lib/analytics/chartData";
import { MEASURES, type AnalyticsRow } from "@/lib/analytics/semanticModel";
import type { Filter } from "@/lib/analytics/pivot";
import { GRID_STROKE, AXIS_STROKE, tooltipStyle, seriesColor, chartCardClass } from "./chartTheme";

export function BarChartCard({
  title,
  rows,
  dim,
  measure,
  topN = 8,
  filters,
  height = 240,
  onBarClick,
}: {
  title: string;
  rows: AnalyticsRow[];
  dim: string;
  measure: string;
  topN?: number;
  filters?: Filter[];
  height?: number;
  /** Analytics.md §9 drill-down — fires with the clicked bar's dimension value ("Other" is never passed). */
  onBarClick?: (value: string) => void;
}) {
  const { data, xKey } = buildRanked(rows, { dim, measure, topN, filters });
  const m = MEASURES[measure];

  return (
    <div className={chartCardClass()}>
      {title && (
        <h4 className="text-xs font-display font-semibold uppercase tracking-widest text-muted-foreground mb-2">
          {title}
        </h4>
      )}
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 8, right: 16, left: 8, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} horizontal={false} />
            <XAxis type="number" stroke={AXIS_STROKE} fontSize={10} tickFormatter={(v: number) => formatMeasureValue(m, v)} />
            <YAxis type="category" dataKey={xKey} stroke={AXIS_STROKE} fontSize={10} width={90} />
            <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [formatMeasureValue(m, v), m?.label ?? measure]} />
            <Bar dataKey={measure} radius={[0, 4, 4, 0]} cursor={onBarClick ? "pointer" : undefined}>
              {data.map((row, i) => {
                const value = String(row[xKey]);
                return (
                  <Cell
                    key={value}
                    fill={value === "Other" ? "oklch(0.5 0.01 260)" : seriesColor(value, i)}
                    onClick={onBarClick && value !== "Other" ? () => onBarClick(value) : undefined}
                  />
                );
              })}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
