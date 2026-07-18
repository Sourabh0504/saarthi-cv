/**
 * Standalone verification for annotations.ts — NOT shipped.
 * Run: npx tsx src/lib/analytics/annotations.verify.ts   (from frontend/)
 */
import { changesOnDate, datesWithChanges, categoryColor } from "./annotations";
import type { ChangeRecord } from "@/lib/api";

let failures = 0;
function check(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failures++;
  console.log(`[${ok ? "PASS" : "FAIL"}] ${name}` + (ok ? "" : `\n   got=${JSON.stringify(got)} want=${JSON.stringify(want)}`));
}

const mk = (id: string, timestamp: string, change_category: string): ChangeRecord => ({
  change_id: id, timestamp, account_id: "acc_aukera", account_name: "Aukera",
  change_category, change_type: "Daily Budget Increased", reason: "test",
  performed_by: "test@example.com", priority: "Medium", approval_status: "Approved",
});

const changes: ChangeRecord[] = [
  mk("c1", "2026-07-02T10:15:00Z", "Budget"),
  mk("c2", "2026-07-02T18:00:00Z", "Bid Strategy"), // same date as c1, different category
  mk("c3", "2026-07-05T09:00:00Z", "Creative"),
  mk("c4", "2026-08-01T09:00:00Z", "Audience"), // outside the plotted range
];

check("changeDate extracts YYYY-MM-DD from a full ISO timestamp", changesOnDate(changes, "2026-07-02").map((c) => c.change_id), ["c1", "c2"]);
check("A date with no changes returns []", changesOnDate(changes, "2026-07-03"), []);

const plotted = ["2026-07-01", "2026-07-02", "2026-07-03", "2026-07-04", "2026-07-05"];
check("datesWithChanges only includes plotted dates with >=1 change", datesWithChanges(changes, plotted).sort(), ["2026-07-02", "2026-07-05"]);
check("A change outside the plotted range is excluded", datesWithChanges(changes, plotted).includes("2026-08-01"), false);

check("categoryColor is deterministic for the same category", categoryColor("Budget"), categoryColor("Budget"));
check("categoryColor always returns a defined hex color, even for an unlisted category", /^#[0-9a-fA-F]{6}$/.test(categoryColor("Some New Category Nobody Has Seen")), true);

console.log("");
console.log(failures === 0 ? "ALL PASSED ✅" : `${failures} FAILED ❌`);
if (failures > 0) process.exit(1);
