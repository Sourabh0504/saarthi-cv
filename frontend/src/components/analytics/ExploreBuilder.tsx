/**
 * frontend/src/components/analytics/ExploreBuilder.tsx
 * =========================================================
 * Explore UI v1 (Analytics.md §8, phase 3 of the Analytics build plan):
 * pick a dimension + measure(s) + one of chart-set-v1's four chart types →
 * live client-side re-render. Phase 4 adds "Pin to dashboard" — the same
 * encoding gets frozen into a DashboardTile and saved (dashboardStore.ts).
 *
 * Deliberately click-to-select rather than drag-and-drop for v1 — the same
 * "which field, which shelf" decision, without the added surface area of a
 * DnD library for a first slice.
 */

import { useMemo, useState } from "react";
import { Pin, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { DIMENSIONS, MEASURES, type AnalyticsRow } from "@/lib/analytics/semanticModel";
import type { Filter } from "@/lib/analytics/pivot";
import { suggestChartType, type ExploreChartType } from "@/lib/analytics/suggest";
import { canDrill, drillInto, drillUpTo, effectiveGroupBy, pathToFilters, type DrillStep } from "@/lib/analytics/drill";
import { EncodingChart } from "./EncodingChart";
import { loadDashboard, saveDashboard, createEmptyDashboard, addTile } from "@/lib/analytics/dashboardStore";
import { cn } from "@/lib/utils";

const DIM_CHOICES = ["date", "month", "dow", "channel", "campaign_type", "campaign", "ad_group", "creative_type", "city", "funnel", "status"];
const MEASURE_CHOICES = ["cost", "impressions", "clicks", "conversions", "ctr", "cpc", "cpm", "cvr", "cpl", "hook_rate", "video_avg_watch_time"];
const CHART_TYPES: { id: "auto" | ExploreChartType; label: string }[] = [
  { id: "auto", label: "Auto" },
  { id: "line", label: "Line" },
  { id: "bar", label: "Bar" },
  { id: "scorecard", label: "Scorecard" },
  { id: "pivot", label: "Pivot Table" },
];

export function ExploreBuilder({
  rows,
  filters,
  accountId,
  ownerEmail,
}: {
  rows: AnalyticsRow[];
  filters?: Filter[];
  accountId: string;
  ownerEmail: string;
}) {
  const [groupBy, setGroupBy] = useState<string>("date");
  const [breakdownBy, setBreakdownBy] = useState<string>("");
  const [measures, setMeasures] = useState<string[]>(["cost"]);
  const [chartTypeChoice, setChartTypeChoice] = useState<"auto" | ExploreChartType>("auto");
  // Analytics.md §9 drill-down: which segment(s) the user has clicked into,
  // deepest last. Reset whenever the root "Group by" dim changes by hand.
  const [drillPath, setDrillPath] = useState<DrillStep[]>([]);

  // The dimension actually plotted is either the hand-picked root, or —
  // once drilled — the child of the last drilled step (semanticModel.ts's
  // drillTo chain: channel -> campaign_type -> campaign -> ad_group -> creative).
  const effectiveDim = effectiveGroupBy(groupBy, drillPath);
  const drillFilters = pathToFilters(drillPath);
  const combinedFilters = [...(filters ?? []), ...drillFilters];

  const activeDims = breakdownBy ? [effectiveDim, breakdownBy] : [effectiveDim];
  const suggested = useMemo(() => suggestChartType(activeDims, measures), [effectiveDim, breakdownBy, measures]);
  const chartType: ExploreChartType = chartTypeChoice === "auto" ? suggested : chartTypeChoice;

  function selectGroupBy(id: string) {
    setGroupBy(id);
    setDrillPath([]); // picking a new root dimension starts a fresh drill context
  }

  function toggleMeasure(id: string) {
    setMeasures((prev) => {
      if (prev.includes(id)) return prev.length === 1 ? prev : prev.filter((m) => m !== id);
      return prev.length >= 4 ? prev : [...prev, id];
    });
  }

  function handleBarClick(value: string) {
    setDrillPath((prev) => drillInto(prev, effectiveDim, value));
  }

  function pinToDashboard() {
    const existing = loadDashboard(accountId) ?? createEmptyDashboard(accountId, ownerEmail);
    const updated = addTile(existing, {
      groupBy,
      breakdownBy: breakdownBy || undefined,
      measures,
      chartType, // frozen at pin time — "auto" is resolved to whatever it currently suggests
    });
    saveDashboard(updated);
    toast.success("Pinned to dashboard", { description: "View it on the My Dashboard canvas." });
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[240px_1fr] gap-5">
      {/* ── Fields + shelves ── */}
      <div className="flex flex-col gap-4">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1.5">Group by</div>
          <div className="flex flex-col gap-1">
            {DIM_CHOICES.map((id) => (
              <ShelfButton key={id} active={groupBy === id} onClick={() => selectGroupBy(id)}>
                {DIMENSIONS[id]?.label ?? id}
              </ShelfButton>
            ))}
          </div>
        </div>

        <div>
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1.5">Break down by (optional)</div>
          <div className="flex flex-col gap-1">
            <ShelfButton active={breakdownBy === ""} onClick={() => setBreakdownBy("")}>None</ShelfButton>
            {DIM_CHOICES.filter((id) => id !== effectiveDim).map((id) => (
              <ShelfButton key={id} active={breakdownBy === id} onClick={() => setBreakdownBy(id)}>
                {DIMENSIONS[id]?.label ?? id}
              </ShelfButton>
            ))}
          </div>
        </div>

        <div>
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1.5">Measures (up to 4)</div>
          <div className="flex flex-col gap-1">
            {MEASURE_CHOICES.map((id) => (
              <ShelfButton key={id} active={measures.includes(id)} onClick={() => toggleMeasure(id)}>
                {MEASURES[id]?.label ?? id}
              </ShelfButton>
            ))}
          </div>
        </div>
      </div>

      {/* ── Canvas ── */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] uppercase tracking-widest text-muted-foreground">Chart type</span>
          {CHART_TYPES.map((c) => (
            <button
              key={c.id}
              onClick={() => setChartTypeChoice(c.id)}
              className={cn(
                "rounded-lg border px-2.5 py-1 text-xs transition-colors",
                chartTypeChoice === c.id ? "border-gold/50 bg-gold/10 text-foreground" : "border-border text-muted-foreground hover:bg-accent/50",
              )}
            >
              {c.label}
              {c.id === "auto" && chartTypeChoice === "auto" && <span className="ml-1 text-gold">→ {suggested}</span>}
            </button>
          ))}
          <button
            onClick={pinToDashboard}
            disabled={measures.length === 0 || drillPath.length > 0}
            title={drillPath.length > 0 ? "Pinning isn't drill-aware yet — pin from the top level, or clear the drill first" : undefined}
            className="ml-auto flex items-center gap-1.5 rounded-lg bg-gold-gradient px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-40"
          >
            <Pin className="w-3.5 h-3.5" /> Pin to dashboard
          </button>
        </div>

        {drillPath.length > 0 && (
          <div className="flex items-center gap-1 text-xs">
            <button onClick={() => setDrillPath(drillUpTo(drillPath, -1))} className="text-gold hover:underline">
              {DIMENSIONS[groupBy]?.label ?? groupBy}
            </button>
            {drillPath.map((step, i) => (
              <span key={i} className="flex items-center gap-1">
                <ChevronRight className="w-3 h-3 text-muted-foreground" />
                <button
                  onClick={() => setDrillPath(drillUpTo(drillPath, i))}
                  className={cn(i === drillPath.length - 1 ? "text-foreground font-medium" : "text-gold hover:underline")}
                >
                  {step.value}
                </button>
              </span>
            ))}
          </div>
        )}

        <EncodingChart
          rows={rows}
          filters={combinedFilters}
          encoding={{ groupBy: effectiveDim, breakdownBy: breakdownBy || undefined, measures, chartType }}
          onBarClick={chartType === "bar" && canDrill(effectiveDim) ? handleBarClick : undefined}
        />
      </div>
    </div>
  );
}

function ShelfButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "text-left rounded-lg border px-2.5 py-1.5 text-xs transition-colors",
        active ? "border-gold/50 bg-gold/10 text-foreground" : "border-border text-muted-foreground hover:bg-accent/50",
      )}
    >
      {children}
    </button>
  );
}
