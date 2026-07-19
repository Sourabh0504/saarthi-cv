export const safeDiv = (n: number, d: number) => (!d || d === 0 ? 0 : n / d);

export interface Aggregated {
  impressions: number;
  clicks: number;
  cost: number;
  conversions: number;
}

export interface ComputedMetrics extends Aggregated {
  ctr: number; // %
  cpc: number; // ₹
  cpm: number; // ₹
  cr: number;  // %  Google: conversion rate (conversions / clicks)
  cpa: number; // ₹  Google: cost per acquisition (cost / conversions)
  // Meta Ads aliases — same formulas as cr/cpa, kept as separate keys because
  // Meta's own UI/copy calls them CVR/CPL. Both pairs are always populated so
  // either dashboard can read whichever key it expects off the same object.
  cvr: number; // %  Meta: conversion rate (leads / clicks)
  cpl: number; // ₹  Meta: cost per lead (cost / leads)
  // Extra Meta-only metrics — attached during aggregation, not derived here.
  // Always optional so the Google dashboard's usage of ComputedMetrics is unaffected.
  landing_page_views?:   number; // count
  thruplays?:            number; // count
  hook_rate?:            number; // percentage as-is from source (e.g. 25.0 = 25%)
  video_avg_watch_time?: number; // seconds
}

export function computeMetrics(a: Aggregated): ComputedMetrics {
  const rate = +(safeDiv(a.conversions, a.clicks) * 100).toFixed(2);
  const cost = +safeDiv(a.cost, a.conversions).toFixed(2);
  return {
    ...a,
    ctr: +(safeDiv(a.clicks, a.impressions) * 100).toFixed(2),
    cpc: +safeDiv(a.cost, a.clicks).toFixed(2),
    cpm: +(safeDiv(a.cost, a.impressions) * 1000).toFixed(2),
    cr:  rate,
    cpa: cost,
    cvr: rate,
    cpl: cost,
  };
}

const inrFormatter = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const inrFormatter0 = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const numFormatter = new Intl.NumberFormat("en-IN", {
  maximumFractionDigits: 0,
});

export const fmtINR = (v: number) => inrFormatter.format(v || 0);
export const fmtINR0 = (v: number) => inrFormatter0.format(v || 0);

export const fmtNum = (v: number) => numFormatter.format(v || 0);

export const fmtPct = (v: number) => v.toFixed(2) + "%";

// ─────────────────────────────────────────────────────────────────────────────
// KPI delta helper — used by the Signal Room (Overview/Media) dashboard to
// show a value alongside its period-over-period change, direction, and
// whether that direction is "good" (e.g. spend up = neutral, CPA up = bad).
// Kept here (not duplicated) so any future dashboard can reuse it.
// ─────────────────────────────────────────────────────────────────────────────

export type TrendDirection = "up" | "down" | "flat";

export interface KPIValue {
  value: number;
  pctChange: number | null;
  direction: TrendDirection;
  isBetter: boolean | null;
  formatted: string;
}

/** Build a KPIValue with correct polarity. higherIsBetter=false for CPA-like metrics. */
export function makeKPI(value: number, previous: number | null, formatted: string, higherIsBetter = true): KPIValue {
  const pctChange = previous === null || previous === 0 ? null : ((value - previous) / previous) * 100;
  let direction: TrendDirection = "flat";
  if (pctChange !== null && Math.abs(pctChange) > 0.05) direction = pctChange > 0 ? "up" : "down";
  let isBetter: boolean | null = null;
  if (pctChange !== null && direction !== "flat") isBetter = higherIsBetter ? pctChange > 0 : pctChange < 0;
  return { value, pctChange, direction, isBetter, formatted };
}

export function getYouTubeId(url: string): string | null {
  const patterns = [
    /youtu\.be\/([\w-]{11})/,
    /youtube\.com\/watch\?v=([\w-]{11})/,
    /youtube\.com\/embed\/([\w-]{11})/,
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m) return m[1];
  }
  return null;
}

/**
 * Returns a Meta/Facebook creative image URL unchanged.
 *
 * DO NOT rewrite Facebook CDN URLs to "upgrade" resolution.
 * scontent.xx.fbcdn.net URLs are cryptographically SIGNED — the size path
 * segment (e.g. /s320x320/), the filename suffix (_s/_n/_b), and the query
 * params (stp=, _nc_ohc=, oh=, oe=) are all bound to a signature. Editing any
 * of them invalidates the signature and the CDN responds with 403 Forbidden.
 *
 * Kept as a pass-through so Meta-specific components can call it uniformly
 * even though today it does nothing — the only safe way to get a higher-res
 * image is to request a larger field at the data layer, never by mutating
 * the URL client-side.
 */
export function upgradeMetaImageUrl(url: string | null | undefined): string {
  return url ?? "";
}
