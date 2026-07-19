import { AlertOctagon, AlertTriangle, Info, Lightbulb } from "lucide-react";
import type { InsightCard } from "@/lib/signalRoomData";
import { cn } from "@/lib/utils";
import { EmptyState, Skeleton } from "./StateViews";

const CFG: Record<InsightCard["severity"], { icon: typeof Info; cls: string; border: string; dot: string; live: boolean }> = {
  info: { icon: Info, cls: "text-sr-primary", border: "border-l-sr-primary", dot: "bg-sr-primary", live: false },
  warning: { icon: AlertTriangle, cls: "text-sr-warning", border: "border-l-sr-warning", dot: "bg-sr-warning", live: true },
  critical: { icon: AlertOctagon, cls: "text-sr-destructive", border: "border-l-sr-destructive", dot: "bg-sr-destructive", live: true },
};

export function InsightFeed({ insights, loading }: { insights: InsightCard[] | null; loading?: boolean }) {
  return (
    <div className="card-hover-sr rounded-xl border border-sr-border bg-sr-card/60 p-4 backdrop-blur-2xl shadow-[var(--sr-shadow-sm)]">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-sr-foreground">
        <Lightbulb className="h-4 w-4 text-sr-primary" aria-hidden="true" /> Insights
      </h3>
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
        </div>
      ) : !insights || insights.length === 0 ? (
        <EmptyState title="No notable changes this period" />
      ) : (
        <div className="space-y-2">
          {insights.map((ins) => {
            const { icon: Icon, cls, border, dot, live } = CFG[ins.severity];
            return (
              <div key={ins.id} className={cn("flex gap-3 rounded-lg border border-l-2 border-sr-border/60 bg-sr-background/30 p-3 transition-colors hover:bg-sr-background/60", border)}>
                <span className="relative mt-0.5 shrink-0">
                  <Icon className={cn("h-4 w-4", cls)} />
                  {live && (
                    <span className="absolute -right-0.5 -top-0.5 flex h-1.5 w-1.5" aria-hidden="true">
                      <span className={cn("absolute inline-flex h-full w-full animate-ping rounded-full opacity-75", dot)} />
                      <span className={cn("relative inline-flex h-1.5 w-1.5 rounded-full", dot)} />
                    </span>
                  )}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-sr-foreground">{ins.title}</p>
                  <p className="text-xs text-sr-muted-foreground">{ins.body}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
