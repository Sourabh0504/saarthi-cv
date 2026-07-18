/**
 * frontend/src/components/analytics/LineChartCard.tsx
 * ========================================================
 * Thin Recharts wrapper over chartData.buildCartesian() — chart-set-v1
 * "Line chart" (Analytics.md §6.1). Never touches pivot()/the API directly.
 *
 * Also carries the two Saarthi-native, time-series-only features (§14):
 * §14.1 Change Log annotations (vertical markers + an enriched hover card —
 * impossible in Looker/PBI since the events live in Saarthi) and §14.3
 * Target reference lines. Both are opt-in via props; the caller (who already
 * has account-level rows/target/changes loaded) supplies the data — this
 * component still never calls the API itself (§7's contract).
 */

import {
  LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid,
  ResponsiveContainer, Legend, ReferenceLine,
} from "recharts";
import { useState } from "react";
import { History } from "lucide-react";
import { buildCartesian, formatMeasureValue } from "@/lib/analytics/chartData";
import { MEASURES, type AnalyticsRow, type Measure } from "@/lib/analytics/semanticModel";
import type { Filter } from "@/lib/analytics/pivot";
import { changesOnDate, datesWithChanges, categoryColor } from "@/lib/analytics/annotations";
import type { ChangeRecord } from "@/lib/api";
import { GRID_STROKE, AXIS_STROKE, tooltipStyle, seriesColor, chartCardClass } from "./chartTheme";
import { cn } from "@/lib/utils";

export function LineChartCard({
  title,
  rows,
  x,
  y,
  y2,
  color,
  filters,
  changes,
  targetLine,
  height = 240,
}: {
  title: string;
  rows: AnalyticsRow[];
  x: string;
  y: string[];
  /** Secondary-axis measures (Analytics.md §6.1's "combo/dual-axis" pattern) — ignored when `color` is set. */
  y2?: string[];
  color?: string;
  filters?: Filter[];
  /** Analytics.md §14.1 — only aligns when `x === "date"` (daily grain); ignored otherwise. */
  changes?: ChangeRecord[];
  /** Analytics.md §14.3 — a horizontal reference line, e.g. the account's monthly cost target. */
  targetLine?: { value: number; label: string };
  height?: number;
}) {
  const [showChanges, setShowChanges] = useState(true);

  const hasSecondary = !color && !!y2?.length;
  const allMeasures = hasSecondary ? [...y, ...y2!] : y;
  const { data, series, xKey } = buildCartesian(rows, { x, y: allMeasures, color, filters });
  const measure = !color ? MEASURES[y[0]] : undefined;
  const measure2 = hasSecondary ? MEASURES[y2![0]] : undefined;
  const y2Ids = new Set(y2 ?? []);

  const canAnnotate = x === "date" && !!changes?.length;
  const plottedDates = canAnnotate ? data.map((r) => String(r[xKey])) : [];
  const markerDates = canAnnotate && showChanges ? datesWithChanges(changes!, plottedDates) : [];

  return (
    <div className={chartCardClass()}>
      <div className="flex items-center justify-between mb-2">
        {title && (
          <h4 className="text-xs font-display font-semibold uppercase tracking-widest text-muted-foreground">
            {title}
          </h4>
        )}
        {canAnnotate && (
          <button
            onClick={() => setShowChanges((v) => !v)}
            className={cn(
              "flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] transition-colors ml-auto",
              showChanges ? "text-gold" : "text-muted-foreground hover:text-foreground",
            )}
            title="Toggle Change Log markers"
          >
            <History className="w-3 h-3" /> Changes
          </button>
        )}
      </div>
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
            <XAxis dataKey={xKey} stroke={AXIS_STROKE} fontSize={10} />
            <YAxis
              yAxisId="l"
              stroke={AXIS_STROKE}
              fontSize={10}
              tickFormatter={(v: number) => formatMeasureValue(measure ?? MEASURES[y[0]], v)}
            />
            {hasSecondary && (
              <YAxis
                yAxisId="r"
                orientation="right"
                stroke={AXIS_STROKE}
                fontSize={10}
                tickFormatter={(v: number) => formatMeasureValue(measure2, v)}
              />
            )}
            <Tooltip
              contentStyle={tooltipStyle}
              content={(props) => (
                <LineTooltip
                  {...props}
                  changes={showChanges ? changes : undefined}
                  resolveMeasure={(name: string) => measure ?? MEASURES[name] ?? MEASURES[y[0]]}
                />
              )}
            />
            {(series.length > 1 || hasSecondary) && <Legend wrapperStyle={{ fontSize: 11 }} />}
            {targetLine && (
              <ReferenceLine
                yAxisId="l"
                y={targetLine.value}
                stroke="#c8a350"
                strokeDasharray="4 4"
                label={{ value: targetLine.label, position: "insideTopRight", fill: "#c8a350", fontSize: 10 }}
              />
            )}
            {markerDates.map((d) => (
              <ReferenceLine
                key={d}
                yAxisId="l"
                x={d}
                stroke={categoryColor(changesOnDate(changes!, d)[0].change_category)}
                strokeDasharray="2 2"
              />
            ))}
            {series.map((s, i) => (
              <Line
                key={s.id}
                yAxisId={y2Ids.has(s.id) ? "r" : "l"}
                type="monotone"
                dataKey={s.id}
                name={s.label}
                stroke={seriesColor(s.id, i)}
                strokeWidth={2}
                dot={false}
                connectNulls={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

interface RechartsTooltipPayloadItem {
  dataKey?: string | number;
  name?: string | number;
  value?: number | string | (number | string)[];
  color?: string;
}

/** Default measure tooltip + (§14.1) an enriched Change Log section when the hovered date has documented changes. */
function LineTooltip({
  active,
  payload,
  label,
  changes,
  resolveMeasure,
}: {
  active?: boolean;
  payload?: RechartsTooltipPayloadItem[];
  label?: string;
  changes?: ChangeRecord[];
  resolveMeasure: (name: string) => Measure | undefined;
}) {
  if (!active || !payload?.length) return null;
  const dateChanges = changes && label ? changesOnDate(changes, label) : [];

  return (
    <div style={tooltipStyle} className="px-2.5 py-1.5">
      {label && <div className="text-[11px] font-medium text-foreground mb-1">{label}</div>}
      <div className="flex flex-col gap-0.5">
        {payload.map((item) => (
          <div key={String(item.dataKey)} className="flex items-center gap-1.5 text-[11px]">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: item.color }} />
            <span className="text-muted-foreground">{item.name}:</span>
            <span className="text-foreground font-medium tabular-nums">
              {typeof item.value === "number" ? formatMeasureValue(resolveMeasure(String(item.dataKey)), item.value) : "—"}
            </span>
          </div>
        ))}
      </div>
      {dateChanges.length > 0 && (
        <div className="mt-1.5 pt-1.5 border-t border-border/40 flex flex-col gap-1">
          <div className="text-[10px] uppercase tracking-widest text-gold">Changes logged</div>
          {dateChanges.map((c) => (
            <div key={c.change_id} className="text-[11px]">
              <span className="font-medium" style={{ color: categoryColor(c.change_category) }}>{c.change_type}</span>
              <span className="text-muted-foreground"> — {c.reason}</span>
              <div className="text-[10px] text-muted-foreground">by {c.performed_by}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
