import { TrendingUp } from "lucide-react";
import type { ForecastResult } from "@/lib/signalRoomData";
import { fmtINR0 } from "@/lib/metrics";
import { cn } from "@/lib/utils";
import { EmptyState, Skeleton } from "@/components/signal-room/StateViews";

export function ForecastPanel({ forecast, loading }: { forecast: ForecastResult | null; loading?: boolean }) {
  return (
    <div className="card-hover-sr rounded-xl border border-sr-border bg-sr-card/60 p-4 backdrop-blur-2xl shadow-[var(--sr-shadow-sm)]">
      <div className="mb-1 flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-sr-foreground">
          <TrendingUp className="h-4 w-4 text-sr-primary" aria-hidden="true" /> End-of-month forecast
        </h3>
        <span className="text-[11px] text-sr-muted-foreground">run-rate</span>
      </div>
      <p className="mb-3 text-xs text-sr-muted-foreground">Simple projection with an approximate range — never presented as certainty.</p>
      {loading ? (
        <Skeleton className="h-16 w-full" />
      ) : !forecast ? (
        <EmptyState icon={TrendingUp} title="No target set for this month" />
      ) : (
        (() => {
          const span = forecast.confidenceHigh - forecast.confidenceLow || 1;
          const projPos = ((forecast.projectionEop - forecast.confidenceLow) / span) * 100;
          const targetPos = forecast.planTarget !== null ? ((forecast.planTarget - forecast.confidenceLow) / span) * 100 : null;
          return (
            <div>
              <div className="mb-1.5 flex items-center justify-between text-sm">
                <span className="font-medium text-sr-foreground">{forecast.label}</span>
                <span className={cn("tabular-nums font-semibold", forecast.breachesTarget ? "text-sr-destructive" : forecast.planTarget !== null ? "text-sr-success" : "text-sr-foreground")}>
                  {fmtINR0(forecast.projectionEop)}
                  {forecast.breachesTarget && (
                    <span className="ml-1.5 rounded bg-sr-destructive px-1.5 py-0.5 text-[10px] font-bold uppercase text-sr-destructive-foreground">breach</span>
                  )}
                </span>
              </div>
              <div className="relative h-2 w-full rounded-full bg-sr-muted">
                <div className="absolute inset-y-0 rounded-full bg-sr-primary/25" style={{ left: 0, right: 0 }} />
                <div
                  className={cn("absolute top-1/2 h-3 w-1 -translate-y-1/2 rounded-full", forecast.breachesTarget ? "bg-sr-destructive" : "bg-sr-primary")}
                  style={{ left: `calc(${Math.max(0, Math.min(100, projPos))}% - 2px)` }}
                />
                {targetPos !== null && (
                  <div className="absolute top-1/2 h-4 w-0.5 -translate-y-1/2 bg-sr-foreground/60" style={{ left: `${Math.max(0, Math.min(100, targetPos))}%` }} aria-label="Plan target" />
                )}
              </div>
              <div className="mt-1 flex justify-between text-[11px] text-sr-muted-foreground">
                <span>{fmtINR0(forecast.confidenceLow)}</span>
                <span>{forecast.planTarget !== null ? `target ${fmtINR0(forecast.planTarget)}` : " "}</span>
                <span>{fmtINR0(forecast.confidenceHigh)}</span>
              </div>
            </div>
          );
        })()
      )}
    </div>
  );
}
