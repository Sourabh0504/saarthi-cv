/**
 * frontend/src/lib/analytics/rows.ts
 * =====================================
 * Bridges the existing raw-performance API shape (RawDailyRow + dimensions,
 * per channel) into the semantic model's flat AnalyticsRow shape the pivot
 * engine consumes. No new backend endpoint — reuses /api/raw-performance
 * (fetchRawPerformance), already cached client-side via aggregator.ts.
 */

import type { RawDailyRow, CreativeDimensionMap } from "@/lib/api";
import type { AnalyticsRow } from "./semanticModel";

/**
 * Flatten one channel's (dimensions, dailyRows) into AnalyticsRow[], tagging
 * every row with `channel` so cross-channel pivots (e.g. blended CTR) work.
 */
export function toAnalyticsRows(
  dimensions: CreativeDimensionMap,
  dailyRows: RawDailyRow[],
  channelLabel: string,
): AnalyticsRow[] {
  return dailyRows.map((row): AnalyticsRow => {
    const dim = dimensions[row.creative_id];
    return {
      channel: channelLabel,
      date: row.date,
      creative: row.creative_id,
      campaign_name: dim?.campaign_name ?? "",
      campaign_type: dim?.campaign_type ?? "",
      ad_group: dim?.ad_group ?? "",
      creative_type: dim?.creative_type ?? "",
      city: dim?.city ?? "",
      funnel: dim?.funnel ?? "",
      status: dim?.status ?? "",
      impressions: row.impressions,
      clicks: row.clicks,
      cost: row.cost,
      conversions: row.conversions,
      landing_page_views: row.landing_page_views,
      thruplays: row.thruplays,
      hook_rate: row.hook_rate,
      video_avg_watch_time: row.video_avg_watch_time,
    };
  });
}
