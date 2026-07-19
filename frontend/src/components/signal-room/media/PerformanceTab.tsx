import { useEffect, useMemo, useState } from "react";
import { fetchRawPerformance, type HomeChannel, type AccountTargetResponse, type RawPerformanceResponse } from "@/lib/api";
import { computeMetrics } from "@/lib/metrics";
import { makeKPI } from "@/lib/metrics";
import {
  bucketTrend, computeForecast, computePacing, computeRCA, sumRawRows, topCampaignsFromRaw, previousPeriod, presetRange, PRESETS, type Preset,
} from "@/lib/signalRoomData";
import { ChannelSelector } from "@/components/signal-room/ChannelSelector";
import { KPICard } from "@/components/signal-room/KPICard";
import { TrendChart } from "@/components/signal-room/TrendChart";
import { ErrorState, Skeleton } from "@/components/signal-room/StateViews";
import { RCAPanel } from "./RCAPanel";
import { ForecastPanel } from "./ForecastPanel";
import { TopPerformers } from "./TopPerformers";
import { CampaignTable } from "./CampaignTable";
import { PacingWidget } from "@/components/signal-room/PacingWidget";
import { cn } from "@/lib/utils";
import { Table2 } from "lucide-react";

export function PerformanceTab({
  channels,
  channelId,
  onChannelChange,
  target,
}: {
  channels: HomeChannel[];
  channelId: string;
  onChannelChange: (id: string) => void;
  target: AccountTargetResponse | null;
}) {
  const [preset, setPreset] = useState<Preset>("MTY");
  const [raw, setRaw] = useState<RawPerformanceResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!channelId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchRawPerformance(channelId)
      .then((data) => { if (!cancelled) setRaw(data); })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load performance data."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [channelId]);

  const derived = useMemo(() => {
    if (!raw) return null;
    // Clamped to this channel's real data extent — MTY never asks for a day
    // later than what's actually synced, and 7d/14d/30d end there too rather
    // than assuming calendar-today has complete data.
    const { start: startIso, end } = presetRange(preset, raw.available_date_range.max);
    const prev = previousPeriod(startIso, end);

    const current = sumRawRows(raw.daily_rows, startIso, end);
    const previous = sumRawRows(raw.daily_rows, prev.start, prev.end);
    const curM = computeMetrics(current);
    const prevM = computeMetrics(previous);

    const kpis = {
      spend: makeKPI(current.cost, previous.cost, `₹${current.cost.toLocaleString(undefined, { maximumFractionDigits: 0 })}`, false),
      conversions: makeKPI(current.conversions, previous.conversions, Math.round(current.conversions).toLocaleString(), true),
      cpa: makeKPI(curM.cpa, prevM.cpa, `₹${curM.cpa}`, false),
      clicks: makeKPI(current.clicks, previous.clicks, current.clicks.toLocaleString(), true),
      ctr: makeKPI(curM.ctr, prevM.ctr, `${curM.ctr}%`, true),
    };

    const trend = bucketTrend(raw.daily_rows, startIso, end);
    // Real per-day series for the KPI card sparklines — derived from the same
    // trend buckets already computed above, never a separate/fabricated source.
    const sparklines = {
      spend: trend.map((p) => p.cost),
      conversions: trend.map((p) => p.conversions),
      cpa: trend.map((p) => (p.conversions > 0 ? p.cost / p.conversions : 0)),
      clicks: trend.map((p) => p.clicks),
      ctr: trend.map((p) => (p.impressions > 0 ? (p.clicks / p.impressions) * 100 : 0)),
    };
    const campaigns = topCampaignsFromRaw(raw.daily_rows, raw.dimensions, startIso, end, 8);
    const rca = computeRCA(current, previous);

    let forecast = null;
    let pacing = null;
    if (target?.found && target.month) {
      const monthStart = `${target.month}-01`;
      const mtd = sumRawRows(raw.daily_rows, monthStart, end);
      if (target.target_spend) {
        forecast = computeForecast("Spend", mtd.cost, target.month, target.target_spend, false);
        pacing = computePacing(mtd.cost, target.target_spend, target.month);
      }
    }

    return { kpis, trend, sparklines, campaigns, rca, forecast, pacing };
  }, [raw, preset, target]);

  const channelOptions = channels.map((c) => ({ id: c.id, name: c.name }));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <ChannelSelector channels={channelOptions} value={channelId} onChange={onChannelChange} />
        <div className="flex rounded-lg border border-sr-border bg-sr-card p-0.5">
          {PRESETS.map((p) => (
            <button
              key={p}
              onClick={() => setPreset(p)}
              className={cn(
                "rounded-md px-3 py-1 text-xs font-medium transition-all active:scale-95",
                preset === p ? "bg-sr-primary text-sr-primary-foreground" : "text-sr-muted-foreground hover:text-sr-foreground",
              )}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {error && <ErrorState message={error} />}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <KPICard label="Spend" kpi={derived?.kpis.spend} loading={loading} sparkline={derived?.sparklines.spend} style={{ animationDelay: "0ms" }} />
        <KPICard label="Conversions" kpi={derived?.kpis.conversions} loading={loading} sparkline={derived?.sparklines.conversions} style={{ animationDelay: "40ms" }} />
        <KPICard label="CPA" kpi={derived?.kpis.cpa} loading={loading} sparkline={derived?.sparklines.cpa} style={{ animationDelay: "80ms" }} />
        <KPICard label="Clicks" kpi={derived?.kpis.clicks} loading={loading} sparkline={derived?.sparklines.clicks} style={{ animationDelay: "120ms" }} />
        <KPICard label="CTR" kpi={derived?.kpis.ctr} loading={loading} sparkline={derived?.sparklines.ctr} style={{ animationDelay: "160ms" }} />
      </div>

      {loading || !derived ? <Skeleton className="h-72 w-full rounded-xl" /> : <TrendChart data={derived.trend} />}

      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
        <RCAPanel rca={derived?.rca ?? null} loading={loading} />
        <PacingWidget pacing={derived?.pacing ?? null} loading={loading} />
        <ForecastPanel forecast={derived?.forecast ?? null} loading={loading} />
      </div>

      <TopPerformers campaigns={derived?.campaigns.slice(0, 5) ?? []} loading={loading} />

      <div>
        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-sr-foreground">
          <Table2 className="h-4 w-4 text-sr-primary" aria-hidden="true" /> Campaigns (creative-attached spend)
        </h3>
        {loading || !derived ? <Skeleton className="h-64 w-full rounded-xl" /> : <CampaignTable campaigns={derived.campaigns} />}
      </div>
    </div>
  );
}
