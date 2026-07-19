import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState, useMemo, useCallback } from "react";
import { AlertCircle, RefreshCw, LineChart, Layers } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import {
  fetchHomeData, fetchAccountSummary, fetchAccountTarget,
  type HomeAccount, type AccountSummaryResponse, type AccountTargetResponse,
} from "@/lib/api";
import { ChannelIcon } from "@/lib/channelIcons";
import { ChangeLogWidget } from "@/components/ChangeLogWidget";
import { CreativeVisibilityWidget } from "@/components/CreativeVisibilityWidget";
import { TrendsSection } from "@/components/analytics/TrendsSection";
import { makeKPI } from "@/lib/metrics";
import { accountTotalsToAggregated, computePacing, generateInsights, previousPeriod, presetRange, PRESETS, type Preset } from "@/lib/signalRoomData";
import { cn } from "@/lib/utils";
import { SignalRoomLayout } from "@/components/signal-room/SignalRoomLayout";
import { KPICard } from "@/components/signal-room/KPICard";
import { InsightFeed } from "@/components/signal-room/InsightFeed";
import { PacingWidget } from "@/components/signal-room/PacingWidget";
import { MediaModule } from "@/components/signal-room/MediaModule";
import { IframeModule } from "@/components/signal-room/IframeModule";
import { PageHeader } from "@/components/signal-room/PageHeader";

function fmtDateLong(iso: string): string {
  return new Date(iso + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

// "creative" is NOT here — that sidebar item is a real full-screen navigation
// to /creative (see components/signal-room/Sidebar.tsx), never an in-place module.
const KNOWN_MODULES = ["overview", "media", "analytics", "pinned", "reporting", "cv-google", "cv-meta", "changelog"] as const;
type ModuleId = (typeof KNOWN_MODULES)[number];

interface AccountSearch {
  account_id: string;
  // Genuinely optional (key can be absent, not just `| undefined`) — every
  // existing `<Link to="/account" search={{account_id}}>` elsewhere in the
  // app (Home, canvas, explore, reports) must keep working untouched without
  // knowing this field exists. The component below defaults it to "overview".
  module?: ModuleId;
}

export const Route = createFileRoute("/account")({
  validateSearch: (search: Record<string, unknown>): AccountSearch => {
    const account_id = typeof search.account_id === "string" ? search.account_id : "";
    const module = (KNOWN_MODULES as readonly string[]).includes(search.module as string) ? (search.module as ModuleId) : undefined;
    return module ? { account_id, module } : { account_id };
  },
  head: () => ({
    meta: [{ title: "CreativeVisibility — Account Overview" }],
  }),
  component: AccountWorkspace,
});

/**
 * The single persistent workspace screen. The sidebar switches `module` via
 * a search-param update (not a route change), so this component — and the
 * shell around it — never unmounts when navigating between Overview / Media /
 * Creative / etc. "No redirect to a new screen" is enforced structurally:
 * there is only one route here, not one per module.
 */
function AccountWorkspace() {
  const { isLoggedIn, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { account_id: accountId, module: rawModule } = Route.useSearch();
  const module: ModuleId = rawModule ?? "overview";

  useEffect(() => {
    if (!authLoading && !isLoggedIn) navigate({ to: "/login" });
  }, [isLoggedIn, authLoading, navigate]);

  const [account, setAccount] = useState<HomeAccount | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoggedIn || !accountId) return;
    fetchHomeData()
      .then((home) => {
        const found = home.accounts.find((a) => a.id === accountId) ?? null;
        if (!found) setLoadError("You don't have access to this account, or it doesn't exist.");
        setAccount(found);
      })
      .catch((err) => setLoadError(err instanceof Error ? err.message : "Failed to load account."));
  }, [isLoggedIn, accountId]);

  const selectModule = useCallback(
    (id: string) => navigate({ from: "/account", search: (prev) => ({ ...prev, module: id as ModuleId }), replace: true }),
    [navigate],
  );

  if (authLoading || !isLoggedIn) return null;

  const firstChannelId = account?.channels[0]?.id ?? "";

  return (
    <SignalRoomLayout
      accountId={accountId}
      accountName={account?.name ?? ""}
      firstChannelId={firstChannelId}
      activeModuleId={module}
      onSelectModule={selectModule}
    >
      {loadError && <ErrorState message={loadError} />}
      {!loadError && module === "overview" && <OverviewPanel accountId={accountId} account={account} />}
      {!loadError && module === "media" && <MediaModule accountId={accountId} />}
      {!loadError && module === "analytics" && (
        <IframeModule src={`/explore?account_id=${encodeURIComponent(accountId)}`} title="Analytics — Explore" />
      )}
      {!loadError && module === "pinned" && (
        <IframeModule src={`/canvas?account_id=${encodeURIComponent(accountId)}`} title="Pinned Charts" />
      )}
      {!loadError && module === "reporting" && (
        <IframeModule src={`/reports?account_id=${encodeURIComponent(accountId)}`} title="Reports" />
      )}
      {!loadError && module === "cv-google" && (
        <CreativeVisibilityPanel account={account} platform="google_ads" title="Creative Visibility — Google" />
      )}
      {!loadError && module === "cv-meta" && (
        <CreativeVisibilityPanel account={account} platform="meta_ads" title="Creative Visibility — Meta" />
      )}
      {!loadError && module === "changelog" && (
        <div>
          <PageHeader eyebrow="Account" title="Change Log" subtitle="Recently documented changes for this account." />
          <ChangeLogWidget accountId={accountId} />
        </div>
      )}
    </SignalRoomLayout>
  );
}

function CreativeVisibilityPanel({ account, platform, title }: { account: HomeAccount | null; platform: string; title: string }) {
  const channels = (account?.channels ?? []).filter((c) => c.platform === platform);
  return (
    <div>
      <PageHeader eyebrow="Creative" title={title} subtitle="Top-performing creatives on this channel this period." />
      {channels.length === 0 ? (
        <ErrorState message={`No ${platform === "meta_ads" ? "Meta" : "Google"} channel is connected for this account.`} />
      ) : (
        // start/end left empty on purpose — matches the widget's existing
        // "auto" fallback (current calendar month), same as the backend default.
        <CreativeVisibilityWidget channels={channels} start="" end="" />
      )}
    </div>
  );
}

function OverviewPanel({ accountId, account }: { accountId: string; account: HomeAccount | null }) {
  const [summary, setSummary]   = useState<AccountSummaryResponse | null>(null);
  const [prevSummary, setPrevSummary] = useState<AccountSummaryResponse | null>(null);
  const [target, setTarget]     = useState<AccountTargetResponse | null>(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [preset, setPreset]     = useState<Preset>("MTY");

  const load = useCallback(async () => {
    if (!accountId) {
      setError("No account selected. Go back to Home and pick an account.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { start, end } = presetRange(preset);
      const accSummary = await fetchAccountSummary(accountId, start, end);
      setSummary(accSummary);

      const month = accSummary.date_range.start.slice(0, 7); // "YYYY-MM"
      fetchAccountTarget(accountId, month).then(setTarget).catch(() => setTarget(null));

      // Real period-over-period comparison: fetch the equal-length prior window
      // and diff client-side (no backend "compare" endpoint exists).
      const prev = previousPeriod(accSummary.date_range.start, accSummary.date_range.end);
      fetchAccountSummary(accountId, prev.start, prev.end).then(setPrevSummary).catch(() => setPrevSummary(null));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load account overview.");
    } finally {
      setLoading(false);
    }
  }, [accountId, preset]);

  useEffect(() => { load(); }, [load]);

  const leadsProgress = useMemo(() => {
    if (!target?.found || !target.target_leads || !summary) return null;
    return Math.min(100, Math.round((summary.totals.conversions / target.target_leads) * 100));
  }, [target, summary]);

  const spendProgress = useMemo(() => {
    if (!target?.found || !target.target_spend || !summary) return null;
    return Math.min(100, Math.round((summary.totals.cost / target.target_spend) * 100));
  }, [target, summary]);

  // Analytics.md §14.3: the Trends line plots daily (not cumulative) spend,
  // so the reference line has to be a daily *pace* (monthly target ÷ days in
  // that month) — a flat line at the full monthly figure would make every
  // single day look drastically under target.
  const dailyTargetPace = useMemo(() => {
    if (!target?.found || !target.target_spend || !target.month) return undefined;
    const [year, month] = target.month.split("-").map(Number);
    const daysInMonth = new Date(year, month, 0).getDate();
    return { value: Math.round(target.target_spend / daysInMonth), label: "Daily pace to hit target" };
  }, [target]);

  const kpis = useMemo(() => {
    if (!summary) return null;
    const cur = summary.totals;
    const prev = prevSummary?.totals ?? null;
    return {
      spend: makeKPI(cur.cost, prev?.cost ?? null, `₹${cur.cost.toLocaleString(undefined, { maximumFractionDigits: 0 })}`, false),
      conversions: makeKPI(cur.conversions, prev?.conversions ?? null, Math.round(cur.conversions).toLocaleString(), true),
      cpa: makeKPI(cur.cost_per_conversion, prev?.cost_per_conversion ?? null, `₹${cur.cost_per_conversion}`, false),
      clicks: makeKPI(cur.clicks, prev?.clicks ?? null, cur.clicks.toLocaleString(), true),
      ctr: makeKPI(cur.ctr, prev?.ctr ?? null, `${cur.ctr}%`, true),
    };
  }, [summary, prevSummary]);

  const pacing = useMemo(() => {
    if (!summary || !target?.found || !target.target_spend || !target.month) return null;
    return computePacing(summary.totals.cost, target.target_spend, target.month);
  }, [summary, target]);

  const insights = useMemo(() => {
    if (!summary || !prevSummary) return null;
    return generateInsights(accountTotalsToAggregated(summary.totals), accountTotalsToAggregated(prevSummary.totals), pacing);
  }, [summary, prevSummary, pacing]);

  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!account || !summary) return null;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        eyebrow="Overview"
        title={account.name}
        subtitle={`Performance from ${fmtDateLong(summary.date_range.start)} to ${fmtDateLong(summary.date_range.end)}`}
        actions={
          <div className="flex gap-0.5 rounded-lg border border-sr-border bg-sr-muted/40 p-0.5" role="group" aria-label="Date range">
            {PRESETS.map((p) => (
              <button
                key={p}
                onClick={() => setPreset(p)}
                aria-pressed={preset === p}
                className={cn(
                  "rounded-md px-3 py-1 text-xs font-medium transition-all active:scale-95",
                  preset === p ? "bg-sr-card text-sr-foreground shadow-[var(--sr-shadow-xs)]" : "text-sr-muted-foreground hover:text-sr-foreground",
                )}
              >
                {p}
              </button>
            ))}
          </div>
        }
      />

      {/* KPI grid — real values with real period-over-period deltas */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <KPICard label="Spend" kpi={kpis?.spend} loading={!kpis} style={{ animationDelay: "0ms" }} />
        <KPICard label="Conversions" kpi={kpis?.conversions} loading={!kpis} style={{ animationDelay: "40ms" }} />
        <KPICard label="Cost / Lead" kpi={kpis?.cpa} loading={!kpis} style={{ animationDelay: "80ms" }} />
        <KPICard label="Clicks" kpi={kpis?.clicks} loading={!kpis} style={{ animationDelay: "120ms" }} />
        <KPICard label="CTR" kpi={kpis?.ctr} loading={!kpis} style={{ animationDelay: "160ms" }} />
      </div>
      {target?.found && target.target_leads !== undefined && leadsProgress !== null && (
        <p className="-mt-2 text-xs text-sr-muted-foreground">
          {Math.round(summary.totals.conversions).toLocaleString()} of {target.target_leads.toLocaleString()} target leads ({leadsProgress}%)
          {target.target_spend && spendProgress !== null ? ` · ₹${summary.totals.cost.toLocaleString(undefined, { maximumFractionDigits: 0 })} of ₹${target.target_spend.toLocaleString()} target spend (${spendProgress}%)` : ""}
        </p>
      )}

      {/* Insights + Pacing */}
      <div className="grid gap-4 lg:grid-cols-2">
        <InsightFeed insights={insights} loading={!insights} />
        <PacingWidget pacing={pacing} loading={!summary || !target} />
      </div>

      {/* Trends — real, pre-existing Analytics.md chart kept as-is */}
      <div className="card-hover-sr rounded-2xl border border-sr-border bg-sr-card/60 p-5 backdrop-blur-2xl shadow-[var(--sr-shadow-sm)]">
        <h3 className="mb-3 flex items-center gap-2 font-semibold text-sr-foreground">
          <LineChart className="h-4 w-4 text-sr-primary" aria-hidden="true" /> Trends
        </h3>
        <TrendsSection
          accountId={accountId}
          channels={account.channels}
          start={summary.date_range.start}
          end={summary.date_range.end}
          dailyTargetPace={dailyTargetPace}
        />
      </div>

      {/* Channel split — links to the untouched per-channel dashboards */}
      <div className="card-hover-sr rounded-2xl border border-sr-border bg-sr-card/60 p-5 backdrop-blur-2xl shadow-[var(--sr-shadow-sm)]">
        <h3 className="flex items-center gap-2 font-semibold text-sr-foreground">
          <Layers className="h-4 w-4 text-sr-primary" aria-hidden="true" /> Channels
        </h3>
        {summary.partial && (
          <p className="mt-1 text-xs text-sr-warning">Some channel data couldn't be loaded — totals above may be incomplete.</p>
        )}
        <div className="mt-3 flex flex-col gap-2">
          {summary.channels.map((ch) => (
            <Link
              key={ch.channel_id}
              to={ch.platform === "meta_ads" ? "/dashboard-meta" : "/dashboard"}
              search={{ channel_id: ch.channel_id }}
              className="group flex items-center gap-3 rounded-xl border border-sr-border px-3 py-2.5 transition-all duration-200 hover:translate-x-0.5 hover:border-sr-primary/40 hover:bg-sr-accent/50"
            >
              <ChannelIcon platform={ch.platform} className="w-5 h-5 shrink-0 transition-transform duration-200 group-hover:scale-110" />
              <span className="text-sm text-sr-foreground flex-1">{ch.channel_name}</span>
              {ch.error ? (
                <span className="text-xs text-sr-destructive">Failed to load</span>
              ) : (
                <span className="text-xs text-sr-muted-foreground">
                  ₹{(ch.cost ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 })} · {Math.round(ch.conversions ?? 0).toLocaleString()} leads
                </span>
              )}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-24 rounded-xl bg-sr-muted/40 animate-pulse" />)}
      </div>
      <div className="h-32 rounded-2xl bg-sr-muted/40 animate-pulse" />
    </div>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-sr-destructive/20 bg-sr-destructive/10 px-6 py-10 text-center">
      <AlertCircle className="w-6 h-6 text-sr-destructive" />
      <p className="text-sm text-sr-destructive max-w-sm">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="flex items-center gap-2 rounded-lg border border-sr-border px-4 py-2 text-sm font-medium text-sr-foreground/80 hover:bg-sr-accent/50 transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" /> Try again
        </button>
      )}
    </div>
  );
}
