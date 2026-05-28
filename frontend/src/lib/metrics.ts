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
