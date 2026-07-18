/**
 * frontend/src/lib/analytics/dashboardTypes.ts
 * =================================================
 * The saved-layout schema from Analytics.md §16, trimmed to what v1 needs:
 * one page per dashboard, tiles auto-placed in a 12-col grid (drag/resize
 * interaction is a later phase — see dashboardStore.ts's addTile). A tile's
 * `explore` block is exactly a chart-set-v1 ChartEncoding, so pinning a
 * chart from Explore and rendering it on the canvas are the same object.
 */

import type { Filter } from "./pivot";
import type { ChartEncoding } from "@/components/analytics/EncodingChart";

export interface DashboardTile {
  id: string;
  x: number;
  y: number;
  w: number; // out of 12 columns
  h: number; // grid rows
  explore: ChartEncoding;
  titleOverride?: string;
}

export interface DashboardPage {
  id: string;
  name: string;
  tiles: DashboardTile[];
}

export interface DashboardLayout {
  id: string;
  name: string;
  scope: { account_id: string };
  globalFilters: Filter[];
  pages: DashboardPage[];
  owner: string;
  createdAt: string;
  version: number;
}
