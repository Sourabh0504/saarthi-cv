import { useEffect, useState } from "react";
import { PieChart, Wallet } from "lucide-react";
import { fetchAccountSummary, type AccountSummaryResponse } from "@/lib/api";
import { fmtINR0 } from "@/lib/metrics";
import { ErrorState, Skeleton } from "@/components/signal-room/StateViews";

/**
 * Shows real spend-by-channel for the current period. No per-channel budget
 * target exists anywhere in the backend (targets.py is account-level total
 * only), so this intentionally does NOT show a "planned" figure per channel —
 * that would have to be invented.
 */
export function PlanningTab({ accountId }: { accountId: string }) {
  const [summary, setSummary] = useState<AccountSummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accountId) return;
    let cancelled = false;
    setLoading(true);
    fetchAccountSummary(accountId)
      .then((data) => { if (!cancelled) setSummary(data); })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load spend data."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [accountId]);

  if (loading) return <Skeleton className="h-64 w-full rounded-xl" />;
  if (error) return <ErrorState message={error} />;
  if (!summary) return null;

  const totalSpend = summary.totals.cost;
  const max = Math.max(...summary.channels.map((c) => c.cost ?? 0), 1);

  return (
    <div className="space-y-5">
      <div className="card-hover-sr rounded-xl border border-sr-border bg-sr-card/60 backdrop-blur-2xl p-4 shadow-[var(--sr-shadow-sm)]">
        <p className="flex items-center gap-2 text-xs uppercase tracking-wide text-sr-muted-foreground">
          <Wallet className="h-3.5 w-3.5 text-sr-primary" aria-hidden="true" /> Total spend this period
        </p>
        <p className="font-sr-num mt-1 text-2xl font-bold tabular-nums text-sr-foreground">{fmtINR0(totalSpend)}</p>
      </div>

      <div className="card-hover-sr rounded-xl border border-sr-border bg-sr-card/60 backdrop-blur-2xl p-5 shadow-[var(--sr-shadow-sm)]">
        <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold text-sr-foreground">
          <PieChart className="h-4 w-4 text-sr-primary" aria-hidden="true" /> Spend by channel
        </h3>
        <p className="mb-4 text-[11px] text-sr-muted-foreground">
          Per-channel budget targets aren't tracked yet — this shows real spend only, not a planned/allocated comparison.
        </p>
        <div className="space-y-4">
          {summary.channels.map((ch) => (
            <div key={ch.channel_id}>
              <div className="mb-1.5 flex items-center justify-between text-sm">
                <span className="font-medium text-sr-foreground">{ch.channel_name}</span>
                <span className="font-sr-num tabular-nums text-sr-muted-foreground">{fmtINR0(ch.cost ?? 0)}</span>
              </div>
              <div className="h-2.5 w-full overflow-hidden rounded-full bg-sr-muted">
                <div className="h-full rounded-full bg-sr-primary" style={{ width: `${((ch.cost ?? 0) / max) * 100}%` }} />
              </div>
              {ch.error && <p className="mt-1 text-xs text-sr-destructive">Failed to load: {ch.error}</p>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
