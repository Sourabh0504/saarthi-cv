/**
 * frontend/src/components/analytics/ScatterChartCard.tsx
 * ============================================================
 * Thin Recharts wrapper over chartData.buildScatter() — chart-set-v1
 * "Scatter" (Analytics.md §6.3): one point per dimension value (e.g. one
 * creative), x/y = two measures, optional color-by-dim, quadrant lines at
 * the median so "top-left = high-CTR-cheap-click winners" reads at a glance.
 */

import {
  ScatterChart, Scatter, XAxis, YAxis, ZAxis, Tooltip, CartesianGrid,
  ResponsiveContainer, ReferenceLine, Cell,
} from "recharts";
import { buildScatter, formatMeasureValue } from "@/lib/analytics/chartData";
import { MEASURES, type AnalyticsRow } from "@/lib/analytics/semanticModel";
import type { Filter } from "@/lib/analytics/pivot";
import { GRID_STROKE, AXIS_STROKE, tooltipStyle, stableColor, chartCardClass } from "./chartTheme";

export function ScatterChartCard({
  title,
  rows,
  pointDim,
  x,
  y,
  size,
  color,
  filters,
  height = 280,
}: {
  title: string;
  rows: AnalyticsRow[];
  pointDim: string;
  x: string;
  y: string;
  size?: string;
  color?: string;
  filters?: Filter[];
  height?: number;
}) {
  const { points, medianX, medianY } = buildScatter(rows, { pointDim, x, y, size, color, filters });
  const xMeasure = MEASURES[x];
  const yMeasure = MEASURES[y];

  if (points.length === 0) {
    return (
      <div className={chartCardClass()}>
        {title && <h4 className="text-xs font-display font-semibold uppercase tracking-widest text-muted-foreground mb-2">{title}</h4>}
        <p className="text-xs text-muted-foreground">No points with both {xMeasure?.label ?? x} and {yMeasure?.label ?? y} for this period.</p>
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
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
            <XAxis
              type="number"
              dataKey="x"
              name={xMeasure?.label ?? x}
              stroke={AXIS_STROKE}
              fontSize={10}
              tickFormatter={(v: number) => formatMeasureValue(xMeasure, v)}
            />
            <YAxis
              type="number"
              dataKey="y"
              name={yMeasure?.label ?? y}
              stroke={AXIS_STROKE}
              fontSize={10}
              tickFormatter={(v: number) => formatMeasureValue(yMeasure, v)}
            />
            {size && <ZAxis type="number" dataKey="size" range={[40, 240]} />}
            {medianX != null && <ReferenceLine x={medianX} stroke={GRID_STROKE} strokeDasharray="4 4" />}
            {medianY != null && <ReferenceLine y={medianY} stroke={GRID_STROKE} strokeDasharray="4 4" />}
            <Tooltip
              contentStyle={tooltipStyle}
              cursor={{ strokeDasharray: "3 3" }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const p = payload[0].payload as { id: string; x: number; y: number; color?: string };
                return (
                  <div style={tooltipStyle} className="px-2.5 py-1.5">
                    <div className="text-[11px] font-medium text-foreground">{p.id}</div>
                    <div className="text-[11px] text-muted-foreground">{xMeasure?.label ?? x}: <span className="text-foreground font-medium">{formatMeasureValue(xMeasure, p.x)}</span></div>
                    <div className="text-[11px] text-muted-foreground">{yMeasure?.label ?? y}: <span className="text-foreground font-medium">{formatMeasureValue(yMeasure, p.y)}</span></div>
                  </div>
                );
              }}
            />
            <Scatter data={points}>
              {points.map((p) => (
                <Cell key={p.id} fill={p.color ? stableColor(p.color) : "#c8a350"} fillOpacity={0.85} />
              ))}
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
