/**
 * frontend/src/lib/analytics/useAccountChanges.ts
 * ====================================================
 * Fetches the account's Change Log once, for chart annotations (Analytics.md
 * §14.1). Degrades gracefully to an empty list when Change History isn't
 * deployed yet (fetchRecentChanges's `configured: false` case) — a chart
 * with no changes prop just renders without the "Changes" toggle at all.
 */

import { useEffect, useState } from "react";
import { fetchRecentChanges, type ChangeRecord } from "@/lib/api";

export function useAccountChanges(accountId: string, limit = 50): ChangeRecord[] {
  const [changes, setChanges] = useState<ChangeRecord[]>([]);

  useEffect(() => {
    let cancelled = false;
    if (!accountId) return;
    fetchRecentChanges(accountId, limit)
      .then((res) => { if (!cancelled) setChanges(res.configured ? res.changes : []); })
      .catch(() => { if (!cancelled) setChanges([]); });
    return () => { cancelled = true; };
  }, [accountId, limit]);

  return changes;
}
