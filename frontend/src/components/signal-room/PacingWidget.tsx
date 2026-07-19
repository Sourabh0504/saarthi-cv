import { Target, Wallet } from "lucide-react";
import type { PacingResult } from "@/lib/signalRoomData";
import { fmtINR0 } from "@/lib/metrics";
import { cn } from "@/lib/utils";
import { EmptyState, Skeleton } from "./StateViews";

const STATUS: Record<PacingResult["status"], { label: string; cls: string; bar: string; text: string }> = {
  ahead: { label: "Ahead of plan", cls: "bg-sr-warning text-sr-warning-foreground", bar: "bg-sr-warning", text: "text-sr-warning" },
  on_pace: { label: "On pace", cls: "bg-sr-success text-sr-success-foreground", bar: "bg-sr-primary", text: "text-sr-success" },
  behind: { label: "Behind plan", cls: "bg-sr-destructive text-sr-destructive-foreground", bar: "bg-sr-destructive", text: "text-sr-destructive" },
};

export function PacingWidget({ pacing, loading }: { pacing: PacingResult | null; loading?: boolean }) {
  return (
    <div className="card-hover-sr rounded-xl border border-sr-border bg-sr-card/60 p-4 backdrop-blur-2xl shadow-[var(--sr-shadow-sm)]">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-sr-foreground">
        <Wallet className="h-4 w-4 text-sr-primary" aria-hidden="true" /> Budget pacing
      </h3>
      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-2 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : !pacing ? (
        <EmptyState icon={Target} title="No target set for this month" hint="Set a monthly spend target to see pacing." />
      ) : (
        <>
          <div className="mb-2 flex items-center justify-between text-sm">
            <span className="text-sr-muted-foreground">Achieved vs expected</span>
            <span className={cn("rounded-md px-2 py-1 text-xs font-bold shadow-sm", STATUS[pacing.status].cls)}>{STATUS[pacing.status].label}</span>
          </div>
          <div className="mb-3 h-2 w-full overflow-hidden rounded-full bg-sr-muted">
            <div
              className={cn("h-full rounded-full transition-all duration-500", STATUS[pacing.status].bar)}
              style={{ width: `${Math.min(100, (pacing.achieved / pacing.allocated) * 100)}%` }}
            />
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <Stat label="Achieved" value={fmtINR0(pacing.achieved)} tone={STATUS[pacing.status].text} />
            <Stat label="Expected to date" value={fmtINR0(pacing.expected)} />
            <Stat label="Monthly target" value={fmtINR0(pacing.allocated)} />
          </div>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div>
      <p className="text-xs text-sr-muted-foreground">{label}</p>
      <p className={cn("font-semibold", tone ?? "text-sr-foreground")}>{value}</p>
    </div>
  );
}
