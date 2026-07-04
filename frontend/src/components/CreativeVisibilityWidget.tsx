/**
 * frontend/src/components/CreativeVisibilityWidget.tsx
 * =======================================================
 * Left-sidebar panel on the Account Overview screen: the top-performing
 * creatives across every channel under this account, blended into one
 * ranked list. Reuses the existing per-channel fetchPerformance() call
 * (already cached, already auth'd) — no new backend endpoint needed,
 * this just merges and sorts client-side.
 */

import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Image as ImageIcon } from "lucide-react";
import { fetchPerformance, type Creative } from "@/lib/api";
import { ChannelIcon } from "@/lib/channelIcons";

interface ChannelRef {
  id:       string;
  name:     string;
  platform: string;
}

export function CreativeVisibilityWidget({
  channels,
  start,
  end,
}: {
  channels: ChannelRef[];
  start: string;
  end: string;
}) {
  const [topCreatives, setTopCreatives] = useState<(Creative & { _channel: ChannelRef })[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setError(null);
      try {
        const perChannel = await Promise.all(
          channels.map(async (channel) => {
            try {
              const data = await fetchPerformance(channel.id, start, end);
              return data.creatives.map((c) => ({ ...c, _channel: channel }));
            } catch {
              return []; // one channel failing shouldn't blank the whole widget
            }
          }),
        );
        const merged = perChannel.flat();
        merged.sort((a, b) => (b.impressions ?? 0) - (a.impressions ?? 0));
        if (!cancelled) setTopCreatives(merged.slice(0, 4));
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load creatives.");
      }
    }

    if (channels.length > 0) load();
    else setTopCreatives([]);

    return () => { cancelled = true; };
  }, [channels, start, end]);

  return (
    <div className="rounded-2xl border border-border bg-card/60 backdrop-blur-2xl shadow-card p-5">
      <h3 className="font-semibold text-foreground">Creative Visibility</h3>
      <p className="mt-0.5 text-xs text-muted-foreground">Top performers this period</p>

      <div className="mt-4 grid grid-cols-2 gap-2.5">
        {topCreatives === null && !error && Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="aspect-square rounded-lg bg-muted/40 animate-pulse" />
        ))}

        {error && (
          <p className="col-span-2 text-xs text-destructive">{error}</p>
        )}

        {topCreatives?.length === 0 && (
          <p className="col-span-2 text-xs text-muted-foreground">No creative data for this period yet.</p>
        )}

        {topCreatives?.map((c) => (
          <div key={`${c._channel.id}:${c.creative_id}`} className="group relative aspect-square rounded-lg overflow-hidden border border-border bg-muted/30">
            {c.creative_type === "Image" && c.creative_url ? (
              <img src={c.creative_url} alt="" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <ImageIcon className="w-5 h-5 text-muted-foreground" />
              </div>
            )}
            <div className="absolute bottom-0 left-0 right-0 flex items-center gap-1 bg-black/60 px-1.5 py-1">
              <ChannelIcon platform={c._channel.platform} className="w-3 h-3 shrink-0" />
              <span className="truncate text-[9px] text-white/90">
                {(c.impressions ?? 0).toLocaleString()} impr.
              </span>
            </div>
          </div>
        ))}
      </div>

      {channels.length > 0 && (
        <div className="mt-3 flex flex-col gap-1">
          {channels.map((channel) => (
            <Link
              key={channel.id}
              to={channel.platform === "meta_ads" ? "/dashboard-meta" : "/dashboard"}
              search={{ channel_id: channel.id }}
              className="text-xs text-gold hover:opacity-80 transition-opacity"
            >
              View all {channel.name} creatives →
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
