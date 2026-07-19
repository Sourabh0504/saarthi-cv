import { Trophy } from "lucide-react";
import type { CampaignAgg } from "@/lib/signalRoomData";
import { fmtINR0 } from "@/lib/metrics";
import { Skeleton } from "@/components/signal-room/StateViews";

export function TopPerformers({ campaigns, loading }: { campaigns: CampaignAgg[]; loading?: boolean }) {
  const max = Math.max(...campaigns.map((c) => c.cost), 1);
  return (
    <div className="card-hover-sr rounded-xl border border-sr-border bg-sr-card/60 p-4 backdrop-blur-2xl shadow-[var(--sr-shadow-sm)]">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-sr-foreground">
        <Trophy className="h-4 w-4 text-sr-primary" aria-hidden="true" /> Top campaigns by spend
      </h3>
      <p className="mb-2 text-[11px] text-sr-muted-foreground">Creative-attached spend only — not full campaign totals (Pipeline B not yet connected).</p>
      {loading ? (
        <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}</div>
      ) : (
        <div className="space-y-3">
          {campaigns.map((c) => (
            <div key={c.name}>
              <div className="mb-1 flex items-center justify-between text-sm">
                <span className="truncate pr-2 text-sr-foreground">{c.name}</span>
                <span className="shrink-0 tabular-nums text-sr-muted-foreground">{fmtINR0(c.cost)}</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-sr-muted">
                <div className="h-full rounded-full bg-sr-primary/80" style={{ width: `${(c.cost / max) * 100}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
