import { useEffect, useState } from "react";
import { Layers3 } from "lucide-react";
import { fetchRawPerformance, type HomeChannel, type RawPerformanceResponse } from "@/lib/api";
import { spendByFunnel } from "@/lib/signalRoomData";
import { fmtINR0 } from "@/lib/metrics";
import { EmptyState, ErrorState, Skeleton } from "@/components/signal-room/StateViews";

/**
 * Groups real creative-attached spend by the real `funnel` field (TOFU/MOFU,
 * or the account's own funnel labels) — not Lovable's random Prospecting/
 * Retargeting/Brand buckets, which have no real backing.
 */
function ChannelMapping({ channelId, channelName }: { channelId: string; channelName: string }) {
  const [raw, setRaw] = useState<RawPerformanceResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchRawPerformance(channelId)
      .then((data) => { if (!cancelled) setRaw(data); })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [channelId]);

  if (loading) return <Skeleton className="h-32 w-full rounded-xl" />;
  if (error) return <ErrorState message={error} />;
  if (!raw) return null;

  const buckets = spendByFunnel(raw.daily_rows, raw.dimensions, raw.available_date_range.min, raw.available_date_range.max);
  const max = Math.max(...buckets.map((b) => b.cost), 1);

  return (
    <div className="card-hover-sr rounded-xl border border-sr-border bg-sr-card/60 p-5 backdrop-blur-2xl shadow-[var(--sr-shadow-sm)]">
      <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-sr-foreground">
        <Layers3 className="h-4 w-4 text-sr-primary" aria-hidden="true" /> {channelName}
      </h3>
      {buckets.length === 0 ? (
        <EmptyState title="No funnel data available" />
      ) : (
        <div className="space-y-3">
          {buckets.map((b) => (
            <div key={b.funnel}>
              <div className="mb-1 flex items-center justify-between text-sm">
                <span className="text-sr-foreground">{b.funnel}</span>
                <span className="font-sr-num tabular-nums text-sr-muted-foreground">{fmtINR0(b.cost)}</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-sr-muted">
                <div className="h-full rounded-full bg-sr-primary/80" style={{ width: `${(b.cost / max) * 100}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function MappingTab({ channels }: { channels: HomeChannel[]; channelId: string; onChannelChange: (id: string) => void }) {
  if (channels.length === 0) return <EmptyState title="No channels to map" />;
  return (
    <div className="space-y-5">
      <p className="text-sm text-sr-muted-foreground">
        Real creative-attached spend grouped by funnel stage, per channel.
      </p>
      {channels.map((ch) => (
        <ChannelMapping key={ch.id} channelId={ch.id} channelName={ch.name} />
      ))}
    </div>
  );
}
