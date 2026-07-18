/**
 * frontend/src/lib/analytics/dashboardStore.ts
 * =================================================
 * Persistence for saved dashboards — localStorage-backed, one dashboard per
 * account, keyed by account_id (same "no backend needed yet" precedent as
 * this app's theme/palette prefs). Analytics.md §16 notes real storage
 * (shared/multi-user) is a later call once dashboard volume demands it —
 * this is the smallest slice that makes "pin a chart -> see it saved" real.
 *
 * v1 tiles are auto-placed full-width in a simple vertical stack (x=0,
 * w=12, y stacks by height) rather than free drag/resize — the schema
 * (§16's {x,y,w,h}) is honored so a real grid-drag interaction can be added
 * later without a data migration.
 */

import type { DashboardLayout, DashboardTile } from "./dashboardTypes";
import type { ChartEncoding } from "@/components/analytics/EncodingChart";

const KEY_PREFIX = "cv-dashboard:";

function storageKey(accountId: string): string {
  return `${KEY_PREFIX}${accountId}`;
}

export function loadDashboard(accountId: string): DashboardLayout | null {
  const raw = localStorage.getItem(storageKey(accountId));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as DashboardLayout;
  } catch {
    return null;
  }
}

export function saveDashboard(layout: DashboardLayout): void {
  localStorage.setItem(storageKey(layout.scope.account_id), JSON.stringify(layout));
}

export function deleteDashboard(accountId: string): void {
  localStorage.removeItem(storageKey(accountId));
}

export function createEmptyDashboard(accountId: string, owner: string): DashboardLayout {
  return {
    id: `dash_${accountId}`,
    name: "My Dashboard",
    scope: { account_id: accountId },
    globalFilters: [],
    pages: [{ id: "p1", name: "Overview", tiles: [] }],
    owner,
    createdAt: new Date().toISOString(),
    version: 1,
  };
}

const TILE_HEIGHT_BY_TYPE: Record<ChartEncoding["chartType"], number> = {
  scorecard: 2,
  line: 4,
  bar: 4,
  pivot: 4,
};

/** Appends a new full-width tile at the bottom of the first page. Returns a new layout (immutable). */
export function addTile(layout: DashboardLayout, explore: ChartEncoding, titleOverride?: string): DashboardLayout {
  const page = layout.pages[0];
  const nextY = page.tiles.reduce((max, t) => Math.max(max, t.y + t.h), 0);
  const tile: DashboardTile = {
    id: `t_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    x: 0,
    y: nextY,
    w: 12,
    h: TILE_HEIGHT_BY_TYPE[explore.chartType],
    explore,
    titleOverride,
  };
  return {
    ...layout,
    version: layout.version + 1,
    pages: [{ ...page, tiles: [...page.tiles, tile] }, ...layout.pages.slice(1)],
  };
}

/** Removes a tile and restacks the remaining ones so there's no gap. */
export function removeTile(layout: DashboardLayout, tileId: string): DashboardLayout {
  const page = layout.pages[0];
  let y = 0;
  const tiles = page.tiles
    .filter((t) => t.id !== tileId)
    .map((t) => {
      const placed = { ...t, y };
      y += t.h;
      return placed;
    });
  return {
    ...layout,
    version: layout.version + 1,
    pages: [{ ...page, tiles }, ...layout.pages.slice(1)],
  };
}
