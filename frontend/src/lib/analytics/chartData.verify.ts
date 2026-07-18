/**
 * Standalone verification for chartData.ts reshape helpers — NOT shipped.
 * Run: npx tsx src/lib/analytics/chartData.verify.ts   (from frontend/)
 *
 * Proves the reshape layer preserves the pivot engine's correctness
 * guarantees once flattened into chart-ready arrays/matrices — i.e. the
 * chart components built on top of this can never accidentally average a
 * ratio just by the shape of the data they're handed.
 */

import { buildCartesian, buildRanked, buildScorecard, buildPivotTable, buildScatter, buildFunnel, buildWaterfall } from "./chartData";
import { suggestChartType } from "./suggest";
import { previousPeriod } from "./periods";
import { pivot, type Filter } from "./pivot";
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

// ── buildCartesian with a color breakdown: real Aukera channel totals ────────
const channelRows: AnalyticsRow[] = [
  { channel: "Google Ads", date: "2026-05-01", impressions: 40458170, clicks: 3017214, cost: 1344125.84, conversions: 2519 },
  { channel: "Meta Ads",   date: "2026-05-01", impressions: 78366604, clicks: 940718,  cost: 2880028.10, conversions: 2362 },
  { channel: "Google Ads", date: "2026-05-02", impressions: 1000,     clicks: 100,     cost: 500,        conversions: 5 },
];

const line = buildCartesian(channelRows, { x: "date", y: ["ctr"], color: "channel" });
check("Two dates in the wide series", line.data.length, 2);
check("Series = the two channel names", line.series.map((s) => s.id).sort(), ["Google Ads", "Meta Ads"]);
const may1 = line.data.find((r) => r.date === "2026-05-01")!;
checkApprox("Wide row: Google CTR 05-01", may1["Google Ads"] as number, 7.46);
checkApprox("Wide row: Meta CTR 05-01",   may1["Meta Ads"] as number, 1.20);
const may2 = line.data.find((r) => r.date === "2026-05-02")!;
check("Meta has no row on 05-02 -> null, not 0 or missing", may2["Meta Ads"], null);

// ── buildRanked: top-N + Other on real-shaped campaign spend ────────────────
const campaignRows: AnalyticsRow[] = Array.from({ length: 5 }, (_, i) => ({
  channel: "Google Ads", campaign_name: `Camp${i}`, date: "2026-05-01",
  impressions: (i + 1) * 1000, clicks: (i + 1) * 50, cost: (i + 1) * 100, conversions: (i + 1) * 5,
}));
const ranked = buildRanked(campaignRows, { dim: "campaign", measure: "cost", topN: 2 });
check("Top-2 + Other = 3 bars", ranked.data.length, 3);
check("Ranked descending by cost", ranked.data.map((r) => r.campaign), ["Camp4", "Camp3", "Other"]);
checkApprox("Other bar cost = 600 (folded remainder)", ranked.data[2].cost as number, 600);

// ── buildScorecard: delta direction respects polarity (lower_better for cpl) ─
const curRows: AnalyticsRow[] = [{ channel: "Google Ads", date: "2026-06-01", impressions: 1000, clicks: 100, cost: 1000, conversions: 20 }];
const prevRows: AnalyticsRow[] = [{ channel: "Google Ads", date: "2026-05-01", impressions: 1000, clicks: 100, cost: 1000, conversions: 10 }];
const cplCard = buildScorecard(curRows, "cpl", { previousRows: prevRows });
// cur cpl = 1000/20 = 50; prev cpl = 1000/10 = 100 -> cpl went DOWN, which is GOOD for a lower_better measure
checkApprox("CPL scorecard value = 50", cplCard.value, 50);
check("CPL dropped from 100 to 50 -> direction 'up' (good, lower_better)", cplCard.delta?.direction, "up");
check("CPL formatted with currency + no decimals", cplCard.formatted, "₹50");

const costCard = buildScorecard(curRows, "cost", { previousRows: prevRows, sparklineDim: "date" });
check("Cost unchanged (1000 vs 1000) -> direction 'flat'", costCard.delta?.direction, "flat");
check("Sparkline has one point per date", costCard.sparkline?.length, 1);

const noLeadsCard = buildScorecard([{ channel: "Google Ads", date: "2026-06-01", impressions: 100, clicks: 10, cost: 50, conversions: 0 }], "cpl");
check("CPL with 0 leads formats as em-dash, not ₹0", noLeadsCard.formatted, "—");

// ── buildPivotTable: campaign x channel, ratio reconciles at every total ────
const matrixRows: AnalyticsRow[] = [
  { channel: "Google Ads", campaign_name: "A", date: "2026-05-01", impressions: 40458170, clicks: 3017214, cost: 1344125.84, conversions: 2519 },
  { channel: "Meta Ads",   campaign_name: "B", date: "2026-05-01", impressions: 78366604, clicks: 940718,  cost: 2880028.10, conversions: 2362 },
];
const table = buildPivotTable(matrixRows, { rowDim: "campaign", colDim: "channel", measures: ["cost", "ctr"] });
check("2 row keys, 2 col keys", [table.rowKeys.length, table.colKeys.length], [2, 2]);
checkApprox("Cell A/Google cost", table.cell("A", "Google Ads", "cost") as number, 1344125.84);
checkApprox("Row total for A = its own cost (only 1 col)", table.rowTotal("A", "cost") as number, 1344125.84);
checkApprox("Col total for Google Ads = 1344125.84", table.colTotal("Google Ads", "cost") as number, 1344125.84);
checkApprox("Grand total cost = both campaigns summed", table.grandTotal("cost") as number, 4224153.94);
// THE reconciliation check: grand-total CTR must be the blended 3.33%, not an average of per-cell CTRs.
checkApprox("Grand total CTR recomputed = 3.33% (not averaged)", table.grandTotal("ctr") as number, 3.33);

// ── Regression: top-N on ROWS must not be ranked by row×col cells, and the
// folded remainder must carry a real column key, not a blank one (a bug
// caught live in the browser: pivot()'s Other-bucket only labels the FIRST
// groupBy dim, so a naive pass-through left the column key blank/unlabeled).
const wideRows: AnalyticsRow[] = [
  ...Array.from({ length: 3 }, (_, i) => ({
    channel: "Google Ads", campaign_name: `G${i}`, date: "2026-05-01",
    impressions: 1000, clicks: 100, cost: (i + 1) * 100, conversions: 5,
  })),
  { channel: "Meta Ads", campaign_name: "M0", date: "2026-05-01", impressions: 1000, clicks: 20, cost: 50, conversions: 1 },
];
const topTable = buildPivotTable(wideRows, { rowDim: "campaign", colDim: "channel", measures: ["cost"], topNRows: 2 });
check("Top-2 rows + Other = 3 row keys", topTable.rowKeys.length, 3);
check("Kept rows are the 2 highest-cost campaigns", topTable.rowKeys.filter((k) => k !== "Other").sort(), ["G1", "G2"]);
// The excluded G0 (Google) and M0 (Meta) both fold into "Other" — CORRECTLY split by column, not blanked.
checkApprox("Other/Google Ads cost = G0's 100 (not blank)", topTable.cell("Other", "Google Ads", "cost") as number, 100);
checkApprox("Other/Meta Ads cost = M0's 50 (not blank)", topTable.cell("Other", "Meta Ads", "cost") as number, 50);
check("No stray blank-keyed column leaked in", topTable.colKeys.sort(), ["Google Ads", "Meta Ads"]);

// ── Explore v1's chart-type suggestion (Analytics.md §8's decision table) ───
check("No dims, 1 measure -> scorecard", suggestChartType([], ["cost"]), "scorecard");
check("1 temporal dim -> line", suggestChartType(["date"], ["cost"]), "line");
check("1 categorical dim -> bar", suggestChartType(["campaign_type"], ["cost"]), "bar");
check("2 dims -> pivot", suggestChartType(["campaign", "channel"], ["cost"]), "pivot");

// ── Curated Account Health's MoM window (periods.ts) ─────────────────────────
check("Previous 7-day period for 07-01..07-07", previousPeriod("2026-07-01", "2026-07-07"), { start: "2026-06-24", end: "2026-06-30" });
check("Previous 1-day period for a single day", previousPeriod("2026-07-01", "2026-07-01"), { start: "2026-06-30", end: "2026-06-30" });

// ── Scorecard MoM via previousFilters (same rows, two date windows) ──────────
const twoMonthRows: AnalyticsRow[] = [
  { channel: "Google Ads", date: "2026-06-01", impressions: 1000, clicks: 100, cost: 1000, conversions: 10 }, // "previous" window
  { channel: "Google Ads", date: "2026-07-01", impressions: 1000, clicks: 100, cost: 2000, conversions: 10 }, // "current" window
];
const momCostCard = buildScorecard(twoMonthRows, "cost", {
  filters: [{ dim: "date", op: "between", values: ["2026-07-01", "2026-07-01"] }],
  previousFilters: [{ dim: "date", op: "between", values: ["2026-06-01", "2026-06-01"] }],
});
checkApprox("MoM scorecard: current-window cost = 2000", momCostCard.value, 2000);
check("MoM scorecard: cost is neutral polarity -> more spend shows 'up', not judged good/bad", momCostCard.delta?.direction, "up");
checkApprox("MoM scorecard: pct = 100%", momCostCard.delta?.pct as number, 100);

// cpl: same cost, same conversions (10) both windows -> cpl 100 -> 200, and cpl IS lower_better, so a rise must show "down" (bad)
const momCplCard = buildScorecard(twoMonthRows, "cpl", {
  filters: [{ dim: "date", op: "between", values: ["2026-07-01", "2026-07-01"] }],
  previousFilters: [{ dim: "date", op: "between", values: ["2026-06-01", "2026-06-01"] }],
});
checkApprox("MoM scorecard: CPL rose from 100 to 200", momCplCard.value, 200);
check("MoM scorecard: CPL is lower_better -> rise shows 'down' (bad)", momCplCard.delta?.direction, "down");

// ── Regression: the "creative" dimension's field must match AnalyticsRow's
// actual key ("creative", set by rows.ts), not "creative_id" — a real bug
// found while building the scatter chart: it silently collapsed every
// creative into one blank group since Phase 1.
const creativeRows: AnalyticsRow[] = [
  { creative: "cr_1", date: "2026-07-01", impressions: 1000, clicks: 50, cost: 100, conversions: 2 },
  { creative: "cr_2", date: "2026-07-01", impressions: 2000, clicks: 60, cost: 200, conversions: 3 },
];
const byCreative = pivot({ rows: creativeRows, groupBy: ["creative"], measures: ["cost"] });
check("Grouping by 'creative' yields 2 distinct groups (not 1 blank one)", byCreative.groups.length, 2);
check("Group keys are the real creative ids, not blank", byCreative.groups.map((g) => g.keys.creative).sort(), ["cr_1", "cr_2"]);

// ── buildScatter: real Aukera-shaped per-creative CTR x CPC ──────────────────
const scatterRows: AnalyticsRow[] = [
  { creative: "winner",  campaign_type: "Search", date: "2026-07-01", impressions: 10000, clicks: 1000, cost: 500,  conversions: 20 }, // CTR 10%, CPC 0.5 -> top-left winner
  { creative: "loser",   campaign_type: "Dgen",   date: "2026-07-01", impressions: 10000, clicks: 100,  cost: 1000, conversions: 2  }, // CTR 1%, CPC 10
  { creative: "no_clicks", campaign_type: "Dgen", date: "2026-07-01", impressions: 500,   clicks: 0,    cost: 0,    conversions: 0  }, // CTR 0%, CPC null (0 clicks)
];
const scatter = buildScatter(scatterRows, { pointDim: "creative", x: "ctr", y: "cpc", color: "campaign_type" });
check("Points with a null measure (no clicks -> CPC null) are dropped, not plotted at 0", scatter.points.length, 2);
const winner = scatter.points.find((p) => p.id === "winner")!;
checkApprox("Winner CTR = 10%", winner.x as number, 10);
checkApprox("Winner CPC = 0.5", winner.y as number, 0.5);
check("Winner is colored by its campaign_type", winner.color, "Search");
checkApprox("Median X sits between the two CTRs (10 and 1)", scatter.medianX as number, 5.5);

// ── buildFunnel: Impressions -> Clicks -> Conversions, real step math ────────
const funnelRows: AnalyticsRow[] = [
  { channel: "Google Ads", date: "2026-07-01", impressions: 10000, clicks: 500, conversions: 25 },
  { channel: "Meta Ads",   date: "2026-07-01", impressions: 5000,  clicks: 100, conversions: 5  },
];
const funnel = buildFunnel(funnelRows, { stages: ["impressions", "clicks", "conversions"] });
check("3 stages returned in order", funnel.stages.map((s) => s.measure), ["impressions", "clicks", "conversions"]);
checkApprox("Impressions stage totals both channels", funnel.stages[0].value, 15000);
check("First stage has no pctOfPrevious (nothing before it)", funnel.stages[0].pctOfPrevious, null);
checkApprox("Clicks step conversion = 600/15000 = 4%", funnel.stages[1].pctOfPrevious as number, 4);
checkApprox("Conversions step conversion = 30/600 = 5%", funnel.stages[2].pctOfPrevious as number, 5);
checkApprox("Conversions pct of first stage = 30/15000 = 0.2%", funnel.stages[2].pctOfFirst as number, 0.2);

const emptyFunnel = buildFunnel([{ channel: "Google Ads", date: "2026-07-01", impressions: 0, clicks: 0, conversions: 0 }], { stages: ["impressions", "clicks"] });
check("Zero-valued first stage -> null pct, not divide-by-zero", emptyFunnel.stages[1].pctOfPrevious, null);

// ── buildWaterfall: start -> per-campaign deltas -> end, additive measure ────
const waterfallRows: AnalyticsRow[] = [
  // Previous period
  { campaign_type: "Search", date: "2026-06-01", impressions: 1000, clicks: 50, cost: 1000, conversions: 5 },
  { campaign_type: "Dgen",   date: "2026-06-01", impressions: 1000, clicks: 50, cost: 500,  conversions: 5 },
  { campaign_type: "Pmax",   date: "2026-06-01", impressions: 1000, clicks: 50, cost: 300,  conversions: 5 },
  // Current period — Search grew a lot, Dgen shrank, Pmax unchanged, a brand-new type appeared
  { campaign_type: "Search", date: "2026-07-01", impressions: 1000, clicks: 50, cost: 2500, conversions: 5 },
  { campaign_type: "Dgen",   date: "2026-07-01", impressions: 1000, clicks: 50, cost: 100,  conversions: 5 },
  { campaign_type: "Pmax",   date: "2026-07-01", impressions: 1000, clicks: 50, cost: 300,  conversions: 5 },
  { campaign_type: "Video",  date: "2026-07-01", impressions: 1000, clicks: 50, cost: 400,  conversions: 5 },
];
const prevF: Filter[] = [{ dim: "date", op: "between", values: ["2026-06-01", "2026-06-01"] }];
const curF: Filter[] = [{ dim: "date", op: "between", values: ["2026-07-01", "2026-07-01"] }];
const waterfall = buildWaterfall(waterfallRows, { dim: "campaign_type", measure: "cost", currentFilters: curF, previousFilters: prevF, topN: 6 });
checkApprox("Start = previous period total (1000+500+300)", waterfall.start, 1800);
checkApprox("End = current period total (2500+100+300+400)", waterfall.end, 3300);
check("3 non-zero delta steps (Search/Dgen/Video — Pmax excluded) + start + end = 5 steps", waterfall.steps.length, 5);
checkApprox("Search's delta = +1500 (biggest mover, sorted first)", waterfall.steps[1].delta as number, 1500);
check("Search is the label of the biggest delta step", waterfall.steps[1].label, "Search");
checkApprox("A new campaign type (Video) with no prior period shows delta = +400", waterfall.steps.find((s) => s.label === "Video")!.delta as number, 400);
check("Pmax is unchanged (delta 0) -> excluded from the bridge entirely", waterfall.steps.some((s) => s.label === "Pmax"), false);
check("Final step's cumulativeEnd is the REAL end total, not a summed running value", waterfall.steps[waterfall.steps.length - 1].cumulativeEnd, waterfall.end);

console.log("");
console.log(failures === 0 ? "ALL PASSED ✅" : `${failures} FAILED ❌`);
if (failures > 0) process.exit(1);
