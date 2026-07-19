import { useCallback, useEffect, useState } from "react";
import { fetchHomeData, fetchAccountTarget, type HomeAccount, type AccountTargetResponse } from "@/lib/api";
import { PageHeader } from "@/components/signal-room/PageHeader";
import { ErrorState, Skeleton } from "@/components/signal-room/StateViews";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PerformanceTab } from "@/components/signal-room/media/PerformanceTab";
import { ComparisonTab } from "@/components/signal-room/media/ComparisonTab";
import { PlanningTab } from "@/components/signal-room/media/PlanningTab";
import { MappingTab } from "@/components/signal-room/media/MappingTab";

/**
 * Self-contained Media module — fetches its own data from `accountId` alone.
 * Rendered in-place by the workspace shell (account.tsx) when "Media" is
 * selected, and also by the standalone /media route for anyone with an old
 * bookmark.
 */
export function MediaModule({ accountId }: { accountId: string }) {
  const [account, setAccount] = useState<HomeAccount | null>(null);
  const [target, setTarget] = useState<AccountTargetResponse | null>(null);
  const [channelId, setChannelId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!accountId) {
      setError("No account selected. Go back to Home and pick an account.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const home = await fetchHomeData();
      const found = home.accounts.find((a) => a.id === accountId) ?? null;
      if (!found) {
        setError("You don't have access to this account, or it doesn't exist.");
        setLoading(false);
        return;
      }
      setAccount(found);
      setChannelId((prev) => prev || found.channels[0]?.id || "");

      const now = new Date();
      const month = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
      fetchAccountTarget(accountId, month).then(setTarget).catch(() => setTarget(null));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load Media dashboard.");
    } finally {
      setLoading(false);
    }
  }, [accountId]);

  useEffect(() => { load(); }, [load]);

  return (
    <>
      <PageHeader title="Media" subtitle="Channel performance, comparison, planning and campaign mapping" />

      {loading && <Skeleton className="h-96 w-full rounded-xl" />}
      {!loading && error && <ErrorState message={error} />}

      {!loading && !error && account && channelId && (
        <Tabs defaultValue="performance">
          <TabsList className="mb-5">
            <TabsTrigger value="performance">Performance</TabsTrigger>
            <TabsTrigger value="comparison">Comparison</TabsTrigger>
            <TabsTrigger value="planning">Planning</TabsTrigger>
            <TabsTrigger value="mapping">Mapping</TabsTrigger>
          </TabsList>
          <TabsContent value="performance">
            <PerformanceTab channels={account.channels} channelId={channelId} onChannelChange={setChannelId} target={target} />
          </TabsContent>
          <TabsContent value="comparison">
            <ComparisonTab channels={account.channels} channelId={channelId} onChannelChange={setChannelId} />
          </TabsContent>
          <TabsContent value="planning">
            <PlanningTab accountId={accountId} />
          </TabsContent>
          <TabsContent value="mapping">
            <MappingTab channels={account.channels} channelId={channelId} onChannelChange={setChannelId} />
          </TabsContent>
        </Tabs>
      )}
    </>
  );
}
