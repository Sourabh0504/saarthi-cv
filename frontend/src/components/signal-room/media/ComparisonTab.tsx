import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Minus, Scale } from "lucide-react";
import { fetchRawPerformance, type HomeChannel, type RawPerformanceResponse } from "@/lib/api";
import { computeComparison, type ComparisonWindow } from "@/lib/signalRoomData";
import { fmtINR0, fmtNum, fmtPct } from "@/lib/metrics";
import { ChannelSelector } from "@/components/signal-room/ChannelSelector";
import { ErrorState, Skeleton } from "@/components/signal-room/StateViews";
import { cn } from "@/lib/utils";

const WINDOWS: ComparisonWindow[] = ["DoD", "WoW", "MoM", "QoQ", "YoY"];

const METRIC_FORMAT: Record<string, (v: number) => string> = {
  Spend: fmtINR0,
  Conversions: fmtNum,
  CPA: fmtINR0,
  CTR: fmtPct,
  Clicks: fmtNum,
};
const HIGHER_IS_BETTER: Record<string, boolean> = { Spend: false, Conversions: true, CPA: false, CTR: true, Clicks: true };

function Delta({ pct, better }: { pct: number; better: boolean }) {
  const flat = Math.abs(pct) < 0.05;
  const Icon = flat ? Minus : pct > 0 ? ArrowUp : ArrowDown;
  return (
    <span
      className={cn(
        "mt-1 inline-flex items-center justify-end gap-0.5 text-[11px] font-bold font-sr-num tabular-nums",
        flat ? "text-sr-muted-foreground" : better ? "text-sr-success" : "text-sr-destructive",
      )}
    >
      <Icon className="h-3 w-3" strokeWidth={3} aria-hidden="true" />
      {Math.abs(pct).toFixed(1)}%
    </span>
  );
}

export function ComparisonTab({
  channels,
  channelId,
  onChannelChange,
}: {
  channels: HomeChannel[];
  channelId: string;
  onChannelChange: (id: string) => void;
}) {
  const [window, setWindow] = useState<ComparisonWindow>("WoW");
  const [raw, setRaw] = useState<RawPerformanceResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!channelId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchRawPerformance(channelId)
      .then((data) => { if (!cancelled) setRaw(data); })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load data."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [channelId]);

  const rows = useMemo(() => {
    if (!raw) return null;
    return computeComparison(raw.daily_rows, raw.available_date_range.min, raw.available_date_range.max, window);
  }, [raw, window]);

  const channelOptions = channels.map((c) => ({ id: c.id, name: c.name }));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <ChannelSelector channels={channelOptions} value={channelId} onChange={onChannelChange} />
        <div className="flex rounded-lg border border-sr-border bg-sr-card p-0.5" role="group" aria-label="Comparison window">
          {WINDOWS.map((w) => (
            <button
              key={w}
              onClick={() => setWindow(w)}
              aria-pressed={window === w}
              className={cn(
                "rounded-md px-3 py-1 text-xs font-medium transition-all active:scale-95",
                window === w ? "bg-sr-primary text-sr-primary-foreground" : "text-sr-muted-foreground hover:text-sr-foreground",
              )}
            >
              {w}
            </button>
          ))}
        </div>
      </div>

      {error && <ErrorState message={error} />}

      <div className="rounded-2xl border border-sr-border bg-sr-card/60 backdrop-blur-2xl shadow-[var(--sr-shadow-sm)]">
        <h3 className="flex items-center gap-2 px-5 pt-4 text-sm font-semibold text-sr-foreground">
          <Scale className="h-4 w-4 text-sr-primary" aria-hidden="true" /> Period comparison
        </h3>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[520px] text-sm">
            <thead>
              <tr className="border-b border-sr-border text-xs font-semibold text-sr-muted-foreground">
                <th scope="col" className="px-4 py-3 text-left">Metric</th>
                <th scope="col" className="px-4 py-3 text-right">Current ({window})</th>
                <th scope="col" className="px-4 py-3 text-right">Previous period</th>
              </tr>
            </thead>
            <tbody>
              {loading || !rows
                ? Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i} className="border-b border-sr-border/60"><td colSpan={3} className="px-4 py-3"><Skeleton className="h-5 w-full" /></td></tr>
                  ))
                : rows.map((row) => {
                    const fmt = METRIC_FORMAT[row.metric] ?? fmtNum;
                    return (
                      <tr key={row.metric} className="border-b border-sr-border/60 transition-colors last:border-0 hover:bg-sr-muted/30">
                        <th scope="row" className="px-4 py-3 text-left font-medium text-sr-foreground">{row.metric}</th>
                        <td className="px-4 py-3 text-right font-sr-num font-semibold tabular-nums text-sr-foreground">{fmt(row.current)}</td>
                        <td className="px-4 py-3 text-right">
                          {row.insufficientHistory || row.previous === null ? (
                            <span className="text-xs text-sr-muted-foreground">Insufficient historical data</span>
                          ) : (
                            <>
                              <div className="font-sr-num text-sr-muted-foreground tabular-nums">{fmt(row.previous)}</div>
                              {row.deltaPct !== null && <Delta pct={row.deltaPct} better={HIGHER_IS_BETTER[row.metric] ? row.deltaPct >= 0 : row.deltaPct <= 0} />}
                            </>
                          )}
                        </td>
                      </tr>
                    );
                  })}
            </tbody>
          </table>
        </div>
      </div>
      <p className="text-xs text-sr-muted-foreground">
        Compares the most recent {window} window against the equal-length period immediately before it, computed from real daily data. Windows that need more
        history than the connected sheet actually has show "Insufficient historical data" rather than a fabricated number.
      </p>
    </div>
  );
}
