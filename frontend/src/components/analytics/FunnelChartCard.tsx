/**
 * frontend/src/components/analytics/FunnelChartCard.tsx
 * ===========================================================
 * Thin wrapper over chartData.buildFunnel() — chart-set-v1 "Funnel"
 * (Analytics.md §6.4): ordered stages, each bar width proportional to the
 * first stage, step-conversion % and cumulative % from the top labeled per
 * stage. Plain CSS bars, not Recharts — a funnel is fundamentally a set of
 * proportional rows, not a cartesian/pivot chart.
 */

import { buildFunnel, formatMeasureValue } from "@/lib/analytics/chartData";
import { MEASURES, type AnalyticsRow } from "@/lib/analytics/semanticModel";
import type { Filter } from "@/lib/analytics/pivot";
import { chartCardClass } from "./chartTheme";

export function FunnelChartCard({
  title,
  rows,
  stages,
  filters,
}: {
  title: string;
  rows: AnalyticsRow[];
  stages: string[];
  filters?: Filter[];
}) {
  const { stages: computed } = buildFunnel(rows, { stages, filters });
  const first = computed[0]?.value || 0;

  return (
    <div className={chartCardClass()}>
      {title && (
        <h4 className="text-xs font-display font-semibold uppercase tracking-widest text-muted-foreground mb-3">
          {title}
        </h4>
      )}
      <div className="flex flex-col gap-2.5">
        {computed.map((stage) => {
          const widthPct = first ? Math.max(4, Math.round((stage.value / first) * 100)) : 0;
          return (
            <div key={stage.measure}>
              <div className="flex items-baseline justify-between text-[11px] mb-1">
                <span className="text-muted-foreground">{stage.label}</span>
                <span className="text-foreground font-medium tabular-nums">
                  {formatMeasureValue(MEASURES[stage.measure], stage.value)}
                  {stage.pctOfPrevious != null && (
                    <span className="text-muted-foreground ml-2">
                      {stage.pctOfPrevious}% of prev
                      {stage.pctOfFirst != null && ` · ${stage.pctOfFirst}% of total`}
                    </span>
                  )}
                </span>
              </div>
              <div className="h-6 rounded-md bg-muted/30 overflow-hidden">
                <div className="h-full bg-gold-gradient transition-all" style={{ width: `${widthPct}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
