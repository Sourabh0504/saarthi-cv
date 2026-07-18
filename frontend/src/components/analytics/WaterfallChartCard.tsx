/**
 * frontend/src/components/analytics/WaterfallChartCard.tsx
 * ==============================================================
 * Thin Recharts wrapper over chartData.buildWaterfall() — chart-set-v1
 * "Waterfall" (Analytics.md §6.4): a start value bridged by the top
 * contributors' deltas to an end value. Rendered as a stacked bar per step
 * — a transparent "riser" (the cumulative floor) plus a colored "delta" bar
 * — the standard waterfall trick, done with two stacked series instead of
 * a bespoke SVG layout.
 */

import {
  BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
  ResponsiveContainer, Cell,
} from "recharts";
import { buildWaterfall, formatMeasureValue } from "@/lib/analytics/chartData";
import { MEASURES, type AnalyticsRow } from "@/lib/analytics/semanticModel";
import type { Filter } from "@/lib/analytics/pivot";
import { GRID_STROKE, AXIS_STROKE, tooltipStyle, chartCardClass } from "./chartTheme";

export function WaterfallChartCard({
  title,
  rows,
  dim,
  measure,
  currentFilters,
  previousFilters,
  topN = 6,
  height = 260,
}: {
  title: string;
  rows: AnalyticsRow[];
  dim: string;
  /** Additive measure only (cost/conversions/impressions/clicks) — see buildWaterfall's doc comment for why. */
  measure: string;
  currentFilters: Filter[];
  previousFilters: Filter[];
  topN?: number;
  height?: number;
}) {
  const { steps } = buildWaterfall(rows, { dim, measure, currentFilters, previousFilters, topN });
  const m = MEASURES[measure];

  const data = steps.map((s) => ({
    label: s.label,
    riser: s.cumulativeStart,
    delta: s.cumulativeEnd - s.cumulativeStart,
    type: s.type,
    rawDelta: s.delta,
  }));

  return (
    <div className={chartCardClass()}>
      {title && (
        <h4 className="text-xs font-display font-semibold uppercase tracking-widest text-muted-foreground mb-2">
          {title}
        </h4>
      )}
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
            <XAxis dataKey="label" stroke={AXIS_STROKE} fontSize={10} interval={0} angle={-20} textAnchor="end" height={50} />
            <YAxis stroke={AXIS_STROKE} fontSize={10} tickFormatter={(v: number) => formatMeasureValue(m, v)} />
            <Tooltip
              contentStyle={tooltipStyle}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const p = payload[0].payload as { label: string; type: string; rawDelta: number | null; riser: number; delta: number };
                const shown = p.type === "delta" ? p.rawDelta! : p.riser + p.delta;
                return (
                  <div style={tooltipStyle} className="px-2.5 py-1.5">
                    <div className="text-[11px] font-medium text-foreground">{p.label}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {p.type === "delta" ? (shown >= 0 ? "+" : "") : ""}
                      {formatMeasureValue(m, shown)}
                    </div>
                  </div>
                );
              }}
            />
            <Bar dataKey="riser" stackId="wf" fill="transparent" />
            <Bar dataKey="delta" stackId="wf" radius={[3, 3, 3, 3]}>
              {data.map((d) => (
                <Cell
                  key={d.label}
                  fill={
                    d.type === "start" || d.type === "end"
                      ? "#c8a350"
                      : (d.rawDelta ?? 0) >= 0
                        ? "#3dbf9e"
                        : "#e0757a"
                  }
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
