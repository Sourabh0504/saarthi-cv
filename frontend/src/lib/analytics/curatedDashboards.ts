/**
 * frontend/src/lib/analytics/curatedDashboards.ts
 * ====================================================
 * Curated dashboards (Analytics.md §15) — pre-built layouts of Explore
 * tiles, shipped so there's instant value before anyone builds their own.
 *
 * v1 scope note: §15 specifies chart types chart-set-v1 doesn't have yet
 * (100%-stacked area for mix drift, target-banded cumulative spend, creative
 * leaderboards with thumbnails, scatter plots). Rather than fake those with
 * the wrong chart type, "Account Health" ships only the tiles buildable
 * honestly on today's four chart types; "Creative Performance" (dashboard B)
 * needs three chart types that don't exist yet and is deferred entirely
 * (Phase 7 "Breadth", §23's own warning against a subtly-wrong pivot).
 *
 * A curated dashboard isn't tied to one account (§16: "or template, no
 * fixed account") — it's just a list of ChartEncodings, resolved against
 * whichever account's rows the caller supplies. "Duplicate into your own
 * copy" (§15) is `addTile`-ing each of these into the viewer's saved
 * dashboard (dashboardStore.ts) — same object, no separate template engine.
 */

import type { ChartEncoding } from "@/components/analytics/EncodingChart";

export interface CuratedTile {
  title: string;
  encoding: ChartEncoding;
}

export const ACCOUNT_HEALTH_TILES: CuratedTile[] = [
  {
    title: "Key Metrics (vs. last period)",
    encoding: {
      groupBy: "date",
      measures: ["conversions", "cost", "ctr", "cpl"],
      chartType: "scorecard",
      compareToPrevious: true,
    },
  },
  {
    title: "Spend & Leads Over Time",
    encoding: {
      groupBy: "date",
      measures: ["cost"],
      y2: ["conversions"],
      chartType: "line",
    },
  },
  {
    title: "Cost / Lead by Campaign Type",
    encoding: {
      groupBy: "campaign_type",
      measures: ["cpl"],
      chartType: "bar",
    },
  },
];

/**
 * Deferred until the needed chart types exist (Phase 7):
 * - 100%-stacked area: impression share by channel over time (mix drift)
 * - Target-banded cumulative spend vs. budget (needs §14.3 target overlays, Phase 6)
 * - Dashboard B "Creative Performance": leaderboard w/ thumbnails, scatter, stacked bar, enriched table
 */
