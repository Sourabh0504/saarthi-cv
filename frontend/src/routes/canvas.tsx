import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { Gem, ArrowLeft, AlertCircle, RefreshCw, Loader2, X, LayoutDashboard, HeartPulse, Copy } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { fetchHomeData, fetchAccountSummary, type HomeAccount, type AccountSummaryResponse } from "@/lib/api";
import { useAccountAnalyticsRows } from "@/lib/analytics/useAccountRows";
import { useAccountChanges } from "@/lib/analytics/useAccountChanges";
import { EncodingChart, defaultTitle } from "@/components/analytics/EncodingChart";
import { loadDashboard, saveDashboard, createEmptyDashboard, removeTile, addTile } from "@/lib/analytics/dashboardStore";
import type { DashboardLayout } from "@/lib/analytics/dashboardTypes";
import { previousPeriod } from "@/lib/analytics/periods";
import { ACCOUNT_HEALTH_TILES } from "@/lib/analytics/curatedDashboards";
import type { Filter } from "@/lib/analytics/pivot";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/canvas")({
  validateSearch: (search: Record<string, unknown>) => ({
    account_id: typeof search.account_id === "string" ? search.account_id : "",
  }),
  head: () => ({
    meta: [{ title: "CreativeVisibility — My Dashboard" }],
  }),
  component: Canvas,
});

function Canvas() {
  const { user, isLoggedIn, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { account_id: accountId } = Route.useSearch();

  const [tab, setTab] = useState<"mine" | "account_health">("mine");
  const [account, setAccount] = useState<HomeAccount | null>(null);
  const [summary, setSummary] = useState<AccountSummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dashboard, setDashboard] = useState<DashboardLayout | null>(null);

  useEffect(() => {
    if (!authLoading && !isLoggedIn) navigate({ to: "/login" });
  }, [isLoggedIn, authLoading, navigate]);

  const load = useCallback(async () => {
    if (!accountId) {
      setError("No account selected. Go back to Home and pick an account.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [home, accSummary] = await Promise.all([fetchHomeData(), fetchAccountSummary(accountId)]);
      const found = home.accounts.find((a) => a.id === accountId) ?? null;
      if (!found) {
        setError("You don't have access to this account, or it doesn't exist.");
        setLoading(false);
        return;
      }
      setAccount(found);
      setSummary(accSummary);
      setDashboard(loadDashboard(accountId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load account.");
    } finally {
      setLoading(false);
    }
  }, [accountId]);

  useEffect(() => { if (isLoggedIn) load(); }, [isLoggedIn, load]);

  const { rows, error: rowsError } = useAccountAnalyticsRows(account?.channels ?? []);
  const changes = useAccountChanges(accountId);

  const dateFilter: Filter[] | undefined = summary
    ? [{ dim: "date", op: "between", values: [summary.date_range.start, summary.date_range.end] }]
    : undefined;
  const previousFilter: Filter[] | undefined = summary
    ? (() => {
        const prev = previousPeriod(summary.date_range.start, summary.date_range.end);
        return [{ dim: "date", op: "between", values: [prev.start, prev.end] }];
      })()
    : undefined;

  function handleRemove(tileId: string) {
    if (!dashboard) return;
    const updated = removeTile(dashboard, tileId);
    saveDashboard(updated);
    setDashboard(updated);
  }

  function handleDuplicateAccountHealth() {
    if (!accountId) return;
    let updated = dashboard ?? createEmptyDashboard(accountId, user?.email ?? "");
    for (const tile of ACCOUNT_HEALTH_TILES) {
      updated = addTile(updated, tile.encoding, tile.title);
    }
    saveDashboard(updated);
    setDashboard(updated);
    toast.success("Added to My Dashboard", { description: "All 3 Account Health tiles are now pinned." });
    setTab("mine");
  }

  if (authLoading || !isLoggedIn) return null;

  const tiles = dashboard?.pages[0]?.tiles ?? [];

  return (
    <div className="relative min-h-screen overflow-hidden bg-background text-foreground font-sans">
      <div className="aurora-bg" aria-hidden />
      <div className="aurora-grid" aria-hidden />

      <header className="relative z-10 flex items-center gap-3 px-6 py-5 border-b border-border/60 backdrop-blur-xl bg-background/70 sticky top-0">
        <Link
          to="/account"
          search={{ account_id: accountId }}
          className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
          title="Back to account"
        >
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div className="w-9 h-9 rounded-lg bg-gold-gradient flex items-center justify-center">
          <Gem className="w-5 h-5 text-primary-foreground" />
        </div>
        <div>
          <div className="font-display font-bold tracking-tight">My Dashboard</div>
          {account && <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{account.name}</div>}
        </div>

        <div className="ml-6 flex items-center gap-1 rounded-lg border border-border p-0.5">
          <button
            onClick={() => setTab("mine")}
            className={cn("rounded-md px-3 py-1.5 text-xs transition-colors", tab === "mine" ? "bg-gold-gradient text-primary-foreground" : "text-muted-foreground hover:text-foreground")}
          >
            My Dashboard
          </button>
          <button
            onClick={() => setTab("account_health")}
            className={cn("flex items-center gap-1 rounded-md px-3 py-1.5 text-xs transition-colors", tab === "account_health" ? "bg-gold-gradient text-primary-foreground" : "text-muted-foreground hover:text-foreground")}
          >
            <HeartPulse className="w-3 h-3" /> Account Health
          </button>
        </div>

        <div className="ml-auto">
          <Link
            to="/explore"
            search={{ account_id: accountId }}
            className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm text-foreground/80 hover:border-gold/40 hover:bg-accent/50 transition-colors"
          >
            + Add chart
          </Link>
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-6xl px-6 pb-16 pt-6">
        {loading && (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin text-gold" /> Loading dashboard…
          </div>
        )}

        {!loading && error && (
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-destructive/20 bg-destructive/10 px-6 py-10 text-center">
            <AlertCircle className="w-6 h-6 text-destructive" />
            <p className="text-sm text-destructive max-w-sm">{error}</p>
            <button
              onClick={load}
              className="flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground/80 hover:bg-accent/50 transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Try again
            </button>
          </div>
        )}

        {!loading && !error && account && (
          rowsError ? (
            <p className="text-sm text-destructive">{rowsError}</p>
          ) : rows === null ? (
            <div className="h-80 rounded-2xl bg-muted/40 animate-pulse" />
          ) : tab === "mine" ? (
            tiles.length === 0 ? (
              <div className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-card/40 px-6 py-16 text-center">
                <LayoutDashboard className="w-8 h-8 text-muted-foreground" />
                <p className="text-sm text-muted-foreground max-w-sm">
                  Nothing pinned yet. Build a chart in Explore and pin it here, or add the curated Account Health tiles.
                </p>
                <div className="flex items-center gap-2">
                  <Link
                    to="/explore"
                    search={{ account_id: accountId }}
                    className="flex items-center gap-2 rounded-lg bg-gold-gradient px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity"
                  >
                    Go to Explore
                  </Link>
                  <button
                    onClick={() => setTab("account_health")}
                    className="flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground/80 hover:bg-accent/50 transition-colors"
                  >
                    View Account Health
                  </button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-12 gap-4">
                {tiles.map((tile) => (
                  <div key={tile.id} className="rounded-2xl border border-border bg-card/60 backdrop-blur-2xl shadow-card p-4" style={{ gridColumn: `span ${tile.w}` }}>
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-sm font-semibold text-foreground">{tile.titleOverride ?? defaultTitle(tile.explore)}</h3>
                      <button
                        onClick={() => handleRemove(tile.id)}
                        aria-label="Remove tile"
                        className="text-muted-foreground hover:text-destructive transition-colors"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                    <EncodingChart
                      rows={rows}
                      filters={dateFilter}
                      previousFilters={previousFilter}
                      changes={tile.explore.chartType === "line" ? changes : undefined}
                      encoding={tile.explore}
                      title=""
                    />
                  </div>
                ))}
              </div>
            )
          ) : (
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between rounded-xl border border-border bg-card/40 px-4 py-3">
                <p className="text-xs text-muted-foreground">
                  A pre-built, admin-curated view — always current, not saved. Duplicate it to customize.
                </p>
                <button
                  onClick={handleDuplicateAccountHealth}
                  className="flex items-center gap-1.5 rounded-lg bg-gold-gradient px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90 transition-opacity shrink-0"
                >
                  <Copy className="w-3.5 h-3.5" /> Add to My Dashboard
                </button>
              </div>
              <div className="grid grid-cols-12 gap-4">
                {ACCOUNT_HEALTH_TILES.map((tile, i) => (
                  <div key={i} className="rounded-2xl border border-border bg-card/60 backdrop-blur-2xl shadow-card p-4 col-span-12">
                    <h3 className="text-sm font-semibold text-foreground mb-2">{tile.title}</h3>
                    <EncodingChart
                      rows={rows}
                      filters={dateFilter}
                      previousFilters={previousFilter}
                      changes={tile.encoding.chartType === "line" ? changes : undefined}
                      encoding={tile.encoding}
                      title=""
                    />
                  </div>
                ))}
              </div>
            </div>
          )
        )}
      </main>
    </div>
  );
}
