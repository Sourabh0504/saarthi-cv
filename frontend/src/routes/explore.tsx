import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { Gem, ArrowLeft, AlertCircle, RefreshCw, Loader2, LayoutDashboard } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { fetchHomeData, fetchAccountSummary, type HomeAccount, type AccountSummaryResponse } from "@/lib/api";
import { useAccountAnalyticsRows } from "@/lib/analytics/useAccountRows";
import { ExploreBuilder } from "@/components/analytics/ExploreBuilder";
import type { Filter } from "@/lib/analytics/pivot";

export const Route = createFileRoute("/explore")({
  validateSearch: (search: Record<string, unknown>) => ({
    account_id: typeof search.account_id === "string" ? search.account_id : "",
  }),
  head: () => ({
    meta: [{ title: "CreativeVisibility — Explore" }],
  }),
  component: Explore,
});

function Explore() {
  const { user, isLoggedIn, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { account_id: accountId } = Route.useSearch();

  const [account, setAccount] = useState<HomeAccount | null>(null);
  const [summary, setSummary] = useState<AccountSummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load account.");
    } finally {
      setLoading(false);
    }
  }, [accountId]);

  useEffect(() => { if (isLoggedIn) load(); }, [isLoggedIn, load]);

  const { rows, error: rowsError } = useAccountAnalyticsRows(account?.channels ?? []);

  const dateFilter: Filter[] | undefined = summary
    ? [{ dim: "date", op: "between", values: [summary.date_range.start, summary.date_range.end] }]
    : undefined;

  if (authLoading || !isLoggedIn) return null;

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
          <div className="font-display font-bold tracking-tight">Explore</div>
          {account && <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{account.name}</div>}
        </div>

        <div className="ml-auto">
          <Link
            to="/canvas"
            search={{ account_id: accountId }}
            className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm text-foreground/80 hover:border-gold/40 hover:bg-accent/50 transition-colors"
            title="View pinned charts"
          >
            <LayoutDashboard className="w-4 h-4" /> My Dashboard
          </Link>
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-6xl px-6 pb-16 pt-6">
        {loading && (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin text-gold" /> Loading account…
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
          ) : (
            <ExploreBuilder rows={rows} filters={dateFilter} accountId={accountId} ownerEmail={user?.email ?? ""} />
          )
        )}
      </main>
    </div>
  );
}
