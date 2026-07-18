/**
 * frontend/src/components/analytics/ScorecardCard.tsx
 * ========================================================
 * chart-set-v1 "Scorecard / KPI card" (Analytics.md §6.6): big number,
 * optional ▲/▼ delta vs a comparison period, optional sparkline.
 */

import { Line, LineChart, ResponsiveContainer } from "recharts";
import { ArrowUp, ArrowDown, Minus } from "lucide-react";
import { buildScorecard } from "@/lib/analytics/chartData";
import type { AnalyticsRow } from "@/lib/analytics/semanticModel";
import type { Filter } from "@/lib/analytics/pivot";
import { cn } from "@/lib/utils";

export function ScorecardCard({
  title,
  rows,
  measure,
  previousRows,
  previousFilters,
  sparklineDim,
  filters,
}: {
  title: string;
  rows: AnalyticsRow[];
  measure: string;
  previousRows?: AnalyticsRow[];
  previousFilters?: Filter[];
  sparklineDim?: string;
  filters?: Filter[];
}) {
  const card = buildScorecard(rows, measure, { previousRows, previousFilters, sparklineDim, filters });
  const sparkData = card.sparkline?.map((v) => ({ v })) ?? [];

  return (
    <div className="rounded-2xl border border-border bg-card/60 backdrop-blur-2xl shadow-card p-4">
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{title}</div>
      <div className="mt-1 flex items-end justify-between gap-3">
        <span className="text-2xl font-bold text-foreground tabular-nums">{card.formatted}</span>
        {sparkData.length > 1 && (
          <div className="h-8 w-16 shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={sparkData}>
                <Line type="monotone" dataKey="v" stroke="#c8a350" strokeWidth={1.5} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
      {card.delta && (
        <div
          className={cn(
            "mt-1.5 flex items-center gap-1 text-xs",
            card.delta.direction === "up" && "text-emerald-400",
            card.delta.direction === "down" && "text-destructive",
            card.delta.direction === "flat" && "text-muted-foreground",
          )}
        >
          {card.delta.direction === "up" && <ArrowUp className="w-3 h-3" />}
          {card.delta.direction === "down" && <ArrowDown className="w-3 h-3" />}
          {card.delta.direction === "flat" && <Minus className="w-3 h-3" />}
          {card.delta.pct != null ? `${Math.abs(card.delta.pct).toFixed(1)}% vs prior period` : "vs prior period"}
        </div>
      )}
    </div>
  );
}
