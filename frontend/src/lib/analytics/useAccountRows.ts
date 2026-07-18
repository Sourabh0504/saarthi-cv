/**
 * frontend/src/lib/analytics/useAccountRows.ts
 * =================================================
 * Shared data-loading hook for every analytics surface on the Account
 * Overview screen (Trends panel, Explore). Fetches each channel's raw daily
 * rows once (fetchRawPerformance — already IndexedDB-cached) and flattens
 * them into AnalyticsRow[] via rows.ts. One channel failing degrades
 * gracefully rather than blanking the whole surface.
 */

import { useEffect, useState } from "react";
import { fetchRawPerformance } from "@/lib/api";
import { toAnalyticsRows } from "./rows";
import type { AnalyticsRow } from "./semanticModel";

interface ChannelRef {
  id: string;
  name: string;
  platform: string;
}

export function useAccountAnalyticsRows(channels: ChannelRef[]): {
  rows: AnalyticsRow[] | null;
  error: string | null;
} {
  const [rows, setRows] = useState<AnalyticsRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Callers commonly pass `account?.channels ?? []` — a fresh array literal
  // on every render while `account` is still loading. Depending on that
  // reference directly means the effect never stabilizes (new deps every
  // render -> setRows([]) -> re-render -> new deps...), which trips React's
  // "Maximum update depth exceeded" guard. Depend on a derived content key
  // instead, so the effect only re-runs when the actual channel set changes.
  const channelsKey = channels.map((c) => c.id).join(",");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setError(null);
      try {
        const perChannel = await Promise.all(
          channels.map(async (channel) => {
            try {
              const data = await fetchRawPerformance(channel.id);
              return toAnalyticsRows(data.dimensions, data.daily_rows, channel.name);
            } catch {
              return []; // one channel failing shouldn't blank the whole surface
            }
          }),
        );
        if (!cancelled) setRows(perChannel.flat());
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load trend data.");
      }
    }

    if (channels.length > 0) load();
    else setRows([]);

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally keyed on channelsKey (stable content signature), not the `channels` array reference
  }, [channelsKey]);

  return { rows, error };
}
