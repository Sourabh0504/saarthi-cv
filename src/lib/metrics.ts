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
  cr: number;  // %
  cpa: number; // ₹
}

export function computeMetrics(a: Aggregated): ComputedMetrics {
  return {
    ...a,
    ctr: +(safeDiv(a.clicks, a.impressions) * 100).toFixed(2),
    cpc: +safeDiv(a.cost, a.clicks).toFixed(2),
    cpm: +(safeDiv(a.cost, a.impressions) * 1000).toFixed(2),
    cr:  +(safeDiv(a.conversions, a.clicks) * 100).toFixed(2),
    cpa: +safeDiv(a.cost, a.conversions).toFixed(2),
  };
}

export const fmtINR = (v: number) =>
  "₹" + (v >= 100000 ? (v / 100000).toFixed(2) + "L" : v >= 1000 ? (v / 1000).toFixed(1) + "k" : v.toFixed(0));

export const fmtNum = (v: number) =>
  v >= 1_000_000 ? (v / 1_000_000).toFixed(2) + "M" :
  v >= 1_000 ? (v / 1_000).toFixed(1) + "k" : v.toFixed(0);

export const fmtPct = (v: number) => v.toFixed(2) + "%";

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
