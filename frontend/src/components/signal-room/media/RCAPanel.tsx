import { SearchCode } from "lucide-react";
import type { RCAResult } from "@/lib/signalRoomData";
import { cn } from "@/lib/utils";
import { EmptyState, Skeleton } from "@/components/signal-room/StateViews";

/**
 * Two-driver decomposition (CPC + conversion rate contribution to the CPA
 * change) — a real, honest simplification of the full multi-axis engine
 * documented in RCA_ENGINE_PLAN.md, not that engine itself.
 */
export function RCAPanel({ rca, loading }: { rca: RCAResult | null; loading?: boolean }) {
  return (
    <div className="card-hover-sr rounded-xl border border-sr-border bg-sr-card/60 p-4 backdrop-blur-2xl shadow-[var(--sr-shadow-sm)] xl:col-span-2">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-sr-foreground">
          <SearchCode className="h-4 w-4 text-sr-primary" aria-hidden="true" /> Root cause — CPA (CPC + conversion rate)
        </h3>
        {rca?.cpaChangePct !== null && rca && (
          <span className={cn("rounded-md px-2 py-1 text-xs font-bold shadow-sm", rca.cpaChangePct >= 0 ? "bg-sr-destructive text-sr-destructive-foreground" : "bg-sr-success text-sr-success-foreground")}>
            {rca.cpaChangePct >= 0 ? "+" : ""}{rca.cpaChangePct}% vs. last period
          </span>
        )}
      </div>
      {loading ? (
        <div className="space-y-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </div>
      ) : !rca || rca.cpaChangePct === null ? (
        <EmptyState title="No prior period to compare" />
      ) : (
        <div className="space-y-2">
          {rca.drivers.map((d) => (
            <div key={d.label} className="rounded-lg border border-sr-border/60 p-2.5">
              <div className="flex items-center justify-between text-sm">
                <span className="text-sr-muted-foreground">{d.label}</span>
                <span className={cn("rounded px-1.5 py-0.5 text-xs font-bold tabular-nums", d.contributionPct >= 0 ? "bg-sr-destructive/15 text-sr-destructive" : "bg-sr-success/15 text-sr-success")}>
                  {d.contributionPct >= 0 ? "+" : ""}{d.contributionPct}%
                </span>
              </div>
              <p className="mt-0.5 text-xs text-sr-muted-foreground">{d.detail}</p>
            </div>
          ))}
          <p className="pt-1 text-[11px] text-sr-muted-foreground">
            Simplified two-driver view (CPC × conversion rate = CPA). Full multi-axis breakdown is a documented follow-up (RCA_ENGINE_PLAN.md).
          </p>
        </div>
      )}
    </div>
  );
}
