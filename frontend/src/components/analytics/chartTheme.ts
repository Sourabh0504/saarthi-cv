/**
 * frontend/src/components/analytics/chartTheme.ts
 * ===================================================
 * Shared visual constants for chart-set-v1 (Analytics.md §13), matching the
 * existing recharts styling already used in CreativeDetailModal.tsx so these
 * new charts don't introduce a second visual language.
 */

import type { CSSProperties } from "react";

export const GRID_STROKE = "oklch(1 0 0 / 0.06)";
export const AXIS_STROKE = "oklch(0.7 0.02 260)";

export const tooltipStyle: CSSProperties = {
  background: "oklch(0.18 0.012 260)",
  border: "1px solid oklch(1 0 0 / 0.1)",
  borderRadius: 8,
  fontSize: 11,
};

/**
 * Channel-consistent color (Analytics.md §13): a fixed hue per platform so
 * the same channel is always the same color across every chart. Falls back
 * to a small qualitative palette for other categorical series (campaigns,
 * campaign types, etc.) cycling by index.
 */
const CHANNEL_COLORS: Record<string, string> = {
  "google_ads": "#c8a350", // gold — matches CHART_GOLD elsewhere
  "meta_ads": "#0081FB",   // Meta's own blue
};

export const QUALITATIVE_PALETTE = [
  "#c8a350", "#3dbf9e", "#0081FB", "#e0757a", "#8b7fd6", "#5fb0d9", "#d99a4e", "#6fbf73",
];

export function seriesColor(id: string, index: number): string {
  const platformKey = id.toLowerCase().replace(/\s+/g, "_");
  if (CHANNEL_COLORS[platformKey]) return CHANNEL_COLORS[platformKey];
  if (id === "Google Ads") return CHANNEL_COLORS.google_ads;
  if (id === "Meta Ads") return CHANNEL_COLORS.meta_ads;
  return QUALITATIVE_PALETTE[index % QUALITATIVE_PALETTE.length];
}

/** Deterministic color for an arbitrary string label (e.g. a change category) — same label always gets the same hue. */
export function stableColor(label: string): string {
  let hash = 0;
  for (let i = 0; i < label.length; i++) hash = (hash * 31 + label.charCodeAt(i)) | 0;
  return QUALITATIVE_PALETTE[Math.abs(hash) % QUALITATIVE_PALETTE.length];
}

export function chartCardClass() {
  return "rounded-xl border border-border bg-background/40 p-3 w-full";
}
