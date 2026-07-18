/**
 * Standalone verification for heatmap.ts — NOT shipped.
 * Run: npx tsx src/lib/analytics/heatmap.verify.ts   (from frontend/)
 */
import { heatmapRange, cellIntensity } from "./heatmap";

let failures = 0;
function check(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failures++;
  console.log(`[${ok ? "PASS" : "FAIL"}] ${name}` + (ok ? "" : `\n   got=${JSON.stringify(got)} want=${JSON.stringify(want)}`));
}

check("Range ignores nulls", heatmapRange([10, null, 30, null, 20]), { min: 10, max: 30 });
check("All-null values -> no range", heatmapRange([null, null]), null);
check("Empty array -> no range", heatmapRange([]), null);

const range = { min: 10, max: 30 };
check("Min value -> intensity 0", cellIntensity(10, range), 0);
check("Max value -> intensity 1", cellIntensity(30, range), 1);
check("Midpoint value -> intensity 0.5", cellIntensity(20, range), 0.5);
check("Null value -> intensity 0 (rendered as empty, not a fake low value)", cellIntensity(null, range), 0);
check("Null range (no data at all) -> intensity 0", cellIntensity(15, null), 0);
check("Degenerate range (min===max) with a positive value -> full intensity", cellIntensity(10, { min: 10, max: 10 }), 1);

console.log("");
console.log(failures === 0 ? "ALL PASSED ✅" : `${failures} FAILED ❌`);
if (failures > 0) process.exit(1);
