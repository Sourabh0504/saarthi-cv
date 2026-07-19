import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { fetchHomeData, type HomeAccount } from "@/lib/api";
import { SignalRoomLayout } from "@/components/signal-room/SignalRoomLayout";
import { CreativeModule } from "@/components/signal-room/CreativeModule";
import { ErrorState, Skeleton } from "@/components/signal-room/StateViews";

/**
 * A real, standalone screen — reached via a full navigation from the
 * sidebar's "Creative" item (the one deliberate exception to the rest of
 * the workspace's in-place module switching). Visual design mimics the
 * Lovable Creative Workspace module exactly; see CreativeModule.tsx for the
 * real-data wiring and the honest reductions vs. that mock (no ROAS, real
 * fatigue signal, real thumbnails).
 */
export const Route = createFileRoute("/creative")({
  validateSearch: (search: Record<string, unknown>) => ({
    account_id: typeof search.account_id === "string" ? search.account_id : "",
    channel_id: typeof search.channel_id === "string" ? search.channel_id : "",
  }),
  head: () => ({ meta: [{ title: "Saarthi — Creative Workspace" }] }),
  component: CreativePage,
});

function CreativePage() {
  const { isLoggedIn, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { account_id: accountId } = Route.useSearch();

  useEffect(() => {
    if (!authLoading && !isLoggedIn) navigate({ to: "/login" });
  }, [isLoggedIn, authLoading, navigate]);

  const [account, setAccount] = useState<HomeAccount | null>(null);
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
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load Creative Workspace.");
    } finally {
      setLoading(false);
    }
  }, [accountId]);

  useEffect(() => { load(); }, [load]);

  const selectModule = useCallback(
    (id: string) => navigate({ to: "/account", search: { account_id: accountId, module: id as never } }),
    [navigate, accountId],
  );

  if (authLoading || !isLoggedIn) return null;

  return (
    <SignalRoomLayout
      accountId={accountId}
      accountName={account?.name ?? ""}
      firstChannelId={account?.channels[0]?.id ?? ""}
      activeModuleId="creative"
      onSelectModule={selectModule}
    >
      {loading && <Skeleton className="h-96 w-full rounded-xl" />}
      {!loading && error && <ErrorState message={error} />}
      {!loading && !error && account && <CreativeModule channels={account.channels} />}
    </SignalRoomLayout>
  );
}
