/**
 * Standalone verification for drill.ts — NOT shipped.
 * Run: npx tsx src/lib/analytics/drill.verify.ts   (from frontend/)
 */
import { canDrill, drillInto, drillUpTo, effectiveGroupBy, pathToFilters, type DrillStep } from "./drill";

let failures = 0;
function check(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failures++;
  console.log(`[${ok ? "PASS" : "FAIL"}] ${name}` + (ok ? "" : `\n   got=${JSON.stringify(got)} want=${JSON.stringify(want)}`));
}

check("channel can drill (has a drillTo child)", canDrill("channel"), true);
check("creative cannot drill (leaf dimension)", canDrill("creative"), false);
check("an unknown dim id cannot drill", canDrill("not_a_real_dim"), false);

let path: DrillStep[] = [];
path = drillInto(path, "channel", "Google Ads");
check("Drill 1: path after clicking a channel bar", path, [{ dim: "channel", value: "Google Ads" }]);
check("Drill 1: effective groupBy becomes campaign_type", effectiveGroupBy("channel", path), "campaign_type");
check("Drill 1: filters scope to that channel", pathToFilters(path), [{ dim: "channel", op: "in", values: ["Google Ads"] }]);

path = drillInto(path, "campaign_type", "Search");
check("Drill 2: path after clicking a campaign_type bar", path, [
  { dim: "channel", value: "Google Ads" },
  { dim: "campaign_type", value: "Search" },
]);
check("Drill 2: effective groupBy becomes campaign", effectiveGroupBy("channel", path), "campaign");
check("Drill 2: filters scope to both levels", pathToFilters(path), [
  { dim: "channel", op: "in", values: ["Google Ads"] },
  { dim: "campaign_type", op: "in", values: ["Search"] },
]);

check("Clicking 'Other' does not drill (not a real entity)", drillInto(path, "campaign", "Other"), path);
check("Drilling on a leaf dim (creative) is a no-op", drillInto([], "creative", "some-id"), []);

check("Breadcrumb: 'All' (index -1) clears the whole path", drillUpTo(path, -1), []);
check("Breadcrumb: clicking the first crumb keeps just that step", drillUpTo(path, 0), [{ dim: "channel", value: "Google Ads" }]);
check("Breadcrumb: clicking the last crumb is a no-op", drillUpTo(path, 1), path);

console.log("");
console.log(failures === 0 ? "ALL PASSED ✅" : `${failures} FAILED ❌`);
if (failures > 0) process.exit(1);
