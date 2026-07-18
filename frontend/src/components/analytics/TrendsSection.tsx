/**
 * frontend/src/components/analytics/TrendsSection.tsx
 * ========================================================
 * Real usage of chart-set-v1 on the Account Overview screen: takes the
 * account's flattened AnalyticsRow[] (useAccountAnalyticsRows) and feeds the
 * pivot-engine-backed chart components, scoped to the current date range.
 */

import type { Filter } from "@/lib/analytics/pivot";
import { useAccountAnalyticsRows } from "@/lib/analytics/useAccountRows";
import { useAccountChanges } from "@/lib/analytics/useAccountChanges";
import { previousPeriod } from "@/lib/analytics/periods";
import { LineChartCard } from "./LineChartCard";
import { BarChartCard } from "./BarChartCard";
import { ScorecardCard } from "./ScorecardCard";
import { PivotTableCard } from "./PivotTableCard";
import { ScatterChartCard } from "./ScatterChartCard";
import { FunnelChartCard } from "./FunnelChartCard";
import { HeatmapChartCard } from "./HeatmapChartCard";
import { WaterfallChartCard } from "./WaterfallChartCard";

interface ChannelRef {
  id: string;
  name: string;
  platform: string;
}

export function TrendsSection({
  accountId,
  channels,
  start,
  end,
  dailyTargetPace,
}: {
  accountId: string;
  channels: ChannelRef[];
  start: string;
  end: string;
  /**
   * Analytics.md §14.3 — a *daily pace* reference line, not the raw monthly
   * target: this chart plots daily (not cumulative) spend, so the caller
   * divides the monthly target by days-in-month first (§14.3's "straight-
   * line budget pace"). A flat line at the full monthly figure would make
   * every day look wildly under target, which is misleading, not useful.
   */
  dailyTargetPace?: { value: number; label: string };
}) {
  const { rows, error } = useAccountAnalyticsRows(channels);
  const changes = useAccountChanges(accountId);

  if (error) {
    return <p className="text-xs text-destructive">{error}</p>;
  }
  if (rows === null) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-60 rounded-xl bg-muted/40 animate-pulse" />)}
      </div>
    );
  }
  if (rows.length === 0) {
    return <p className="text-xs text-muted-foreground">No trend data for this period yet.</p>;
  }

  const dateFilter: Filter[] = [{ dim: "date", op: "between", values: [start, end] }];
  const prev = previousPeriod(start, end);
  const previousDateFilter: Filter[] = [{ dim: "date", op: "between", values: [prev.start, prev.end] }];

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <ScorecardCard title="Total Spend (trend)" rows={rows} measure="cost" sparklineDim="date" filters={dateFilter} />
        <ScorecardCard title="Blended CTR" rows={rows} measure="ctr" sparklineDim="date" filters={dateFilter} />
        <ScorecardCard title="Blended CPC" rows={rows} measure="cpc" sparklineDim="date" filters={dateFilter} />
        <ScorecardCard title="Cost / Lead" rows={rows} measure="cpl" sparklineDim="date" filters={dateFilter} />
      </div>
      <LineChartCard
        title="Daily Spend by Channel"
        rows={rows}
        x="date"
        y={["cost"]}
        color="channel"
        filters={dateFilter}
        changes={changes}
        targetLine={dailyTargetPace}
      />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <BarChartCard title="Spend by Campaign Type" rows={rows} dim="campaign_type" measure="cost" topN={6} filters={dateFilter} />
        <PivotTableCard title="Spend & CTR by Campaign × Channel" rows={rows} rowDim="campaign" colDim="channel" measures={["cost", "ctr"]} topNRows={8} filters={dateFilter} />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <FunnelChartCard
          title="Account Funnel"
          rows={rows}
          stages={["impressions", "clicks", "conversions"]}
          filters={dateFilter}
        />
        <ScatterChartCard
          title="CTR × CPC per Creative — top-left is best (high CTR, cheap clicks)"
          rows={rows}
          pointDim="creative"
          x="ctr"
          y="cpc"
          color="channel"
          filters={dateFilter}
        />
      </div>
      <HeatmapChartCard title="CTR by City × Day of Week" rows={rows} rowDim="city" colDim="dow" measure="ctr" filters={dateFilter} />
      <WaterfallChartCard
        title="Spend Bridge — this period vs. prior period, by campaign type"
        rows={rows}
        dim="campaign_type"
        measure="cost"
        currentFilters={dateFilter}
        previousFilters={previousDateFilter}
      />
    </div>
  );
}
