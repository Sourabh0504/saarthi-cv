/**
 * Standalone verification for the pivot engine — NOT a shipped module.
 * Run: npx tsx src/lib/analytics/pivot.verify.ts   (from frontend/)
 *
 * Proves the two things that matter most:
 *   1. The ratio rule: a blended CTR is recomputed from summed bases, NOT
 *      averaged — reproduces Analytics.md §5.3's real Aukera reconciliation
 *      (Google 7.46% + Meta 1.20% blend to 3.33%, not (7.46+1.20)/2 = 4.33%).
 *   2. Weighted-average (Meta hook_rate) re-groups correctly.
 */

import { pivot } from "./pivot";
import type { AnalyticsRow } from "./semanticModel";

let failures = 0;
function check(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failures++;
  console.log(`[${ok ? "PASS" : "FAIL"}] ${name}` + (ok ? "" : `\n   got=${JSON.stringify(got)} want=${JSON.stringify(want)}`));
}
const approx = (a: number, b: number, eps = 0.01) => Math.abs(a - b) <= eps;
function checkApprox(name: string, got: number | null, want: number) {
  const ok = got != null && approx(got, want);
  if (!ok) failures++;
  console.log(`[${ok ? "PASS" : "FAIL"}] ${name}` + (ok ? ` (${got})` : `\n   got=${got} want≈${want}`));
}

// ── Real Aukera May 1–Jun 24 channel totals (verified this session) ──────────
// One synthetic row per channel carrying the exact summed bases, to prove the
// blend math. (The engine sums many rows in reality; one row per channel here
// carries the already-summed totals — the recomputation logic is identical.)
const rows: AnalyticsRow[] = [
  { channel: "Google Ads", date: "2026-05-01", impressions: 40458170, clicks: 3017214, cost: 1344125.84, conversions: 2519 },
  { channel: "Meta Ads",   date: "2026-05-01", impressions: 78366604, clicks: 940718,  cost: 2880028.10, conversions: 2362 },
];

const byChannel = pivot({ rows, groupBy: ["channel"], measures: ["cost", "ctr", "cpl"] });

const g = Object.fromEntries(byChannel.groups.map((x) => [x.keys.channel, x.measures]));
checkApprox("Google CTR = 3017214/40458170", g["Google Ads"].ctr as number, 7.46);
checkApprox("Meta CTR = 940718/78366604",     g["Meta Ads"].ctr as number, 1.20);

// THE KEY ASSERTION: total CTR recomputed from summed bases, NOT averaged.
checkApprox("Total CTR blends to 3.33% (NOT 4.33% average)", byChannel.total.measures.ctr as number, 3.33);
checkApprox("Total spend sums to 4,224,153.94", byChannel.total.measures.cost as number, 4224153.94);
checkApprox("Total CPL = cost/conversions",     byChannel.total.measures.cpl as number, Math.round(4224153.94 / 4881));

// ── Weighted-average (Meta hook_rate) re-groups correctly ────────────────────
// Two creatives, different hook rates and impression volumes. Blended hook rate
// must be impression-weighted, not a simple average.
const metaRows: AnalyticsRow[] = [
  { channel: "Meta Ads", campaign_name: "C1", date: "2026-05-01", impressions: 100000, clicks: 1000, cost: 5000, conversions: 10, hook_rate: 30, thruplays: 200, video_avg_watch_time: 3 },
  { channel: "Meta Ads", campaign_name: "C2", date: "2026-05-01", impressions: 900000, clicks: 3000, cost: 20000, conversions: 40, hook_rate: 10, thruplays: 1800, video_avg_watch_time: 5 },
];
const metaAgg = pivot({ rows: metaRows, groupBy: ["channel"], measures: ["hook_rate", "video_avg_watch_time"] });
// impression-weighted hook rate = (30*100000 + 10*900000)/1000000 = 12.0, NOT (30+10)/2 = 20
checkApprox("Meta hook_rate impression-weighted = 12.0 (NOT 20)", metaAgg.total.measures.hook_rate as number, 12.0);
// thruplay-weighted watch time = (3*200 + 5*1800)/2000 = 4.8
checkApprox("Meta watch_time thruplay-weighted = 4.8", metaAgg.total.measures.video_avg_watch_time as number, 4.8);

// ── Zero-denominator → null, not misleading 0 (Analytics.md §5.5) ────────────
const noLeads: AnalyticsRow[] = [{ channel: "Google Ads", date: "2026-05-01", impressions: 1000, clicks: 50, cost: 500, conversions: 0 }];
const nl = pivot({ rows: noLeads, groupBy: ["channel"], measures: ["cpl"] });
check("CPL with 0 leads = null (shows '—', not ₹0)", nl.groups[0].measures.cpl, null);

// ── Top-N + Other folds the remainder correctly ──────────────────────────────
const many: AnalyticsRow[] = Array.from({ length: 5 }, (_, i) => ({
  channel: "Google Ads", campaign_name: `Camp${i}`, date: "2026-05-01",
  impressions: (i + 1) * 1000, clicks: (i + 1) * 50, cost: (i + 1) * 100, conversions: (i + 1) * 5,
}));
const top2 = pivot({ rows: many, groupBy: ["campaign"], measures: ["cost", "ctr"], topN: { by: "cost", n: 2, otherBucket: true } });
check("Top-2 + Other = 3 groups", top2.groups.length, 3);
check("Last group is 'Other'", top2.groups[top2.groups.length - 1].keys.campaign, "Other");
// Other = Camp0+Camp1+Camp2 costs = 100+200+300 = 600; total = 1500; kept top2 = 500+400 = 900; 900+600=1500 ✓
checkApprox("Other spend = 600 (folded remainder)", top2.groups.find((x) => x.keys.campaign === "Other")!.measures.cost as number, 600);

console.log("");
console.log(failures === 0 ? "ALL PASSED ✅" : `${failures} FAILED ❌`);
if (failures > 0) process.exit(1);
