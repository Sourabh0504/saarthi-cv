import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState, useCallback } from "react";
import { AlertCircle, RefreshCw, Search, Sun, Moon, ArrowUpRight } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import {
  fetchHomeData, fetchRawPerformance, fetchAccountTarget,
  type HomeAccount, type RawDailyRow, type AccountTargetResponse,
} from "@/lib/api";
import { ChannelIcon } from "@/lib/channelIcons";
import { ProfileContent } from "@/routes/profile";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { computeMetrics, makeKPI, fmtINR0, fmtNum, type KPIValue } from "@/lib/metrics";
import { isoDate, sumRawRows, bucketTrend, previousPeriod, computePacing, presetRange, PRESETS, type Preset } from "@/lib/signalRoomData";
import { SaarthiMark } from "@/components/brand/SaarthiMark";
import { SaarthiSplash, useMinSplashDuration } from "@/components/brand/SaarthiSplash";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Saarthi — Accounts" },
      { name: "description", content: "Select an account and channel to view performance." },
    ],
  }),
  component: Home,
});

function fmtShortDate(iso: string): string {
  return new Date(iso + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

function Home() {
  const { user, isLoggedIn, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();

  const [accounts, setAccounts]   = useState<HomeAccount[] | null>(null);
  const [error, setError]         = useState<string | null>(null);
  const [loading, setLoading]     = useState(true);
  const [search, setSearch]       = useState("");
  const [profileOpen, setProfileOpen] = useState(false);
  const [preset, setPreset]       = useState<Preset>("MTY");
  const [refreshTick, setRefreshTick] = useState(0);

  // ── Theme (shared app-wide via localStorage + <html> class — same key the
  //    Signal Room account/media dashboard and login page use) ──
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  useEffect(() => {
    const storedTheme = localStorage.getItem("cv-theme") as "dark" | "light" | null;
    if (storedTheme) setTheme(storedTheme);
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("light", theme === "light");
    localStorage.setItem("cv-theme", theme);
  }, [theme]);

  // ── Auth guard ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!authLoading && !isLoggedIn) {
      navigate({ to: "/login" });
    }
  }, [isLoggedIn, authLoading, navigate]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchHomeData();
      setAccounts(data.accounts);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load accounts.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isLoggedIn) load();
  }, [isLoggedIn, load]);

  const filtered = useMemo(() => {
    if (!accounts) return [];
    const q = search.trim().toLowerCase();
    if (!q) return accounts;
    return accounts.filter(a => a.name.toLowerCase().includes(q));
  }, [accounts, search]);

  // Group by cluster -> team, preserving first-seen order.
  const groups = useMemo(() => {
    const clusterOrder: string[] = [];
    const byCluster = new Map<string, Map<string, HomeAccount[]>>();

    for (const acc of filtered) {
      const clusterKey = acc.cluster_name || "Ungrouped";
      const teamKey     = acc.team_name || "Ungrouped";
      if (!byCluster.has(clusterKey)) {
        byCluster.set(clusterKey, new Map());
        clusterOrder.push(clusterKey);
      }
      const teams = byCluster.get(clusterKey)!;
      if (!teams.has(teamKey)) teams.set(teamKey, []);
      teams.get(teamKey)!.push(acc);
    }

    return clusterOrder.map(clusterName => ({
      clusterName,
      teams: Array.from(byCluster.get(clusterName)!.entries()).map(([teamName, accs]) => ({
        teamName,
        accounts: accs,
      })),
    }));
  }, [filtered]);

  // Full-screen Saarthi splash on first load — the platform-level equivalent
  // of CreativeVisibility's own splash (dashboard.tsx), kept visible for a
  // minimum of 5 real seconds regardless of how fast fetchHomeData resolves.
  const { visible: splashVisible, secs: splashSecs } = useMinSplashDuration(loading);

  if (authLoading || !isLoggedIn) return null;

  return (
    <div className="sr-theme relative min-h-screen overflow-hidden bg-sr-grid bg-sr-background text-sr-foreground">
      <SaarthiSplash visible={splashVisible} secs={splashSecs} />
      <div className="bg-sr-gradient-surface pointer-events-none absolute inset-x-0 top-0 h-64" aria-hidden="true" />

      {/* ── Header ── */}
      <header className="glass-sr relative z-10 flex items-center gap-3 px-6 py-4 border-b border-sr-border sticky top-0">
        <SaarthiMark theme={theme} size={26} />
        <div className="font-bold tracking-tight text-sr-foreground">Saarthi</div>

        <div className="ml-auto flex items-center gap-2">
          {/* Theme toggle */}
          <button
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            aria-label="Toggle theme"
            title="Toggle light / dark"
            className="flex items-center justify-center w-8 h-8 rounded-lg border border-sr-border text-sr-muted-foreground hover:text-sr-foreground hover:bg-sr-accent/50 transition-all active:scale-90"
          >
            {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>

          {/* Profile */}
          <button
            onClick={() => setProfileOpen(true)}
            title={user ? `Signed in as ${user.email}` : "Profile"}
            aria-label="Open profile"
            className="w-8 h-8 rounded-full p-0.5 cursor-pointer hover:scale-105 transition-transform bg-sr-gradient-brand"
          >
            {user?.picture ? (
              <img
                src={user.picture}
                alt={user.name || user.email}
                className="w-full h-full rounded-full object-cover"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="w-full h-full rounded-full bg-sr-background flex items-center justify-center">
                <span className="text-[10px] font-bold text-sr-primary">
                  {(user?.name || user?.email || "U").charAt(0).toUpperCase()}
                </span>
              </div>
            )}
          </button>
        </div>
      </header>

      {/* ── Profile modal ── */}
      <Dialog open={profileOpen} onOpenChange={setProfileOpen}>
        <DialogContent className="max-w-xl bg-transparent border-0 shadow-none p-0">
          <DialogTitle className="sr-only">Profile</DialogTitle>
          <div className="max-h-[85vh] overflow-y-auto pr-1">
            <ProfileContent />
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Body ── */}
      <main className="relative z-10 mx-auto max-w-5xl px-6 pb-16 pt-8">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-sr-primary">Home feed</p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-sr-foreground">Accounts</h1>
            <p className="mt-1 text-sm text-sr-muted-foreground">Planned vs achieved performance across every account you manage.</p>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex gap-0.5 rounded-lg border border-sr-border bg-sr-muted/40 p-0.5">
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
            <button
              onClick={() => setRefreshTick((t) => t + 1)}
              aria-label="Refresh"
              title="Refresh"
              className="flex items-center justify-center w-8 h-8 rounded-lg border border-sr-border text-sr-muted-foreground hover:text-sr-foreground hover:bg-sr-accent/50 transition-all active:scale-90"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {accounts && accounts.length > 0 && (
          <div className="relative mt-4 w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-sr-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search accounts…"
              className="w-full rounded-lg border border-sr-border bg-sr-card/60 py-2 pl-8 pr-3 text-sm text-sr-foreground placeholder:text-sr-muted-foreground outline-none focus:border-sr-primary/50 transition-colors"
            />
          </div>
        )}

        <div className="mt-6">
          {loading && <LoadingState />}
          {!loading && error && <ErrorState message={error} onRetry={load} />}
          {!loading && !error && accounts && accounts.length === 0 && <EmptyState />}
          {!loading && !error && accounts && accounts.length > 0 && filtered.length === 0 && (
            <p className="text-sm text-sr-muted-foreground py-8 text-center">No accounts match "{search}".</p>
          )}
          {!loading && !error && groups.length > 0 && (
            <div className="flex flex-col gap-8">
              {groups.map((cluster) => (
                <div key={cluster.clusterName}>
                  {groups.length > 1 && (
                    <div className="mb-3 text-[10px] uppercase tracking-widest text-sr-muted-foreground">{cluster.clusterName}</div>
                  )}
                  <div className="flex flex-col gap-6">
                    {cluster.teams.map((team) => (
                      <div key={team.teamName}>
                        <div className="mb-3 text-xs font-medium text-sr-muted-foreground">{team.teamName}</div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                          {team.accounts.map((account) => (
                            <AccountCard key={account.id} account={account} preset={preset} refreshTick={refreshTick} />
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Account card
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Each card fetches its own channels' raw performance (parallel, once on
 * mount — cached via IndexedDB/ETag in fetchRawPerformance) plus this
 * month's target, then derives every KPI/sparkline/pacing figure client-side
 * for whichever preset is selected. No per-preset network round-trip, no
 * fabricated revenue/ROAS figure (the real pipeline has no revenue field —
 * CPA is shown instead, consistent with the rest of the app).
 */
function AccountCard({ account, preset, refreshTick }: { account: HomeAccount; preset: Preset; refreshTick: number }) {
  const [rows, setRows] = useState<RawDailyRow[] | null>(null);
  const [target, setTarget] = useState<AccountTargetResponse | null>(null);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoadError(false);
    Promise.all(account.channels.map((ch) => fetchRawPerformance(ch.id)))
      .then((results) => {
        if (cancelled) return;
        const merged: RawDailyRow[] = [];
        for (const r of results) merged.push(...r.daily_rows);
        setRows(merged);
      })
      .catch(() => { if (!cancelled) setLoadError(true); });

    const month = isoDate(new Date()).slice(0, 7);
    fetchAccountTarget(account.id, month)
      .then((t) => { if (!cancelled) setTarget(t); })
      .catch(() => { if (!cancelled) setTarget(null); });

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account.id, refreshTick]);

  const derived = useMemo(() => {
    if (!rows) return null;
    const { start, end } = presetRange(preset);
    const prev = previousPeriod(start, end);
    const current = sumRawRows(rows, start, end);
    const previous = sumRawRows(rows, prev.start, prev.end);
    const curM = computeMetrics(current);
    const prevM = computeMetrics(previous);

    const kpis = {
      spend: makeKPI(current.cost, previous.cost, fmtINR0(current.cost), false),
      cpa: makeKPI(curM.cpa, prevM.cpa, fmtINR0(curM.cpa), false),
      conversions: makeKPI(current.conversions, previous.conversions, fmtNum(current.conversions), true),
      clicks: makeKPI(current.clicks, previous.clicks, fmtNum(current.clicks), true),
    };

    const trend = bucketTrend(rows, start, end).map((p) => p.cost);

    let pacing = null;
    if (target?.found && target.target_spend && target.month) {
      const monthStart = `${target.month}-01`;
      const mtd = sumRawRows(rows, monthStart, isoDate(new Date()));
      pacing = computePacing(mtd.cost, target.target_spend, target.month);
    }

    return { kpis, trend, pacing, periodLabel: `${fmtShortDate(start)} – ${fmtShortDate(end)}` };
  }, [rows, preset, target]);

  const loading = !rows && !loadError;

  return (
    <div className="group animate-sr-in card-hover-sr rounded-2xl border border-sr-border bg-sr-card/60 backdrop-blur-2xl shadow-[var(--sr-shadow-sm)] p-5 hover:border-sr-primary/30">
      <div className="flex items-start justify-between gap-3">
        <Link to="/account" search={{ account_id: account.id }} className="flex min-w-0 items-center gap-3" title={`Open ${account.name} overview`}>
          <AccountLogo account={account} />
          <div className="min-w-0">
            <div className="font-semibold text-sr-foreground truncate group-hover:text-sr-primary transition-colors">{account.name}</div>
            <div className="text-xs text-sr-muted-foreground">
              {loading ? "Loading…" : loadError ? "Failed to load" : derived?.periodLabel}
            </div>
          </div>
        </Link>
        <Link
          to="/account"
          search={{ account_id: account.id }}
          aria-label={`Open ${account.name} overview`}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-sr-border text-sr-muted-foreground transition-all group-hover:border-sr-primary group-hover:bg-sr-primary group-hover:text-sr-primary-foreground"
        >
          <ArrowUpRight className="h-4 w-4" />
        </Link>
      </div>

      {loadError && (
        <p className="mt-4 text-xs text-sr-destructive">Couldn't load performance for this account.</p>
      )}

      {!loadError && (
        <>
          {loading ? (
            <div className="mt-4 h-9 animate-pulse rounded-lg bg-sr-muted/60" />
          ) : (
            <div className="mt-4 flex items-end justify-between gap-3">
              <div className="min-w-0 flex-1">
                <Sparkline data={derived!.trend} gradientId={`spark-${account.id}`} />
              </div>
              {derived!.pacing && (
                <span
                  className={cn(
                    "shrink-0 rounded-md px-2 py-0.5 text-xs font-semibold",
                    derived!.pacing.status === "ahead" && "bg-sr-warning/15 text-sr-warning",
                    derived!.pacing.status === "on_pace" && "bg-sr-success/15 text-sr-success",
                    derived!.pacing.status === "behind" && "bg-sr-destructive/15 text-sr-destructive",
                  )}
                >
                  {PACING_LABEL[derived!.pacing.status]} {derived!.pacing.pct >= 0 ? "+" : ""}
                  {derived!.pacing.pct}%
                </span>
              )}
            </div>
          )}

          <div className="mt-4 grid grid-cols-2 gap-x-3 gap-y-3 border-t border-sr-border pt-4">
            {loading ? (
              Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-9 animate-pulse rounded bg-sr-muted/60" />)
            ) : (
              <>
                <KpiChip label="Spend" kpi={derived!.kpis.spend} />
                <KpiChip label="CPA" kpi={derived!.kpis.cpa} />
                <KpiChip label="Conv." kpi={derived!.kpis.conversions} />
                <KpiChip label="Clicks" kpi={derived!.kpis.clicks} />
              </>
            )}
          </div>
        </>
      )}

      <div className="mt-4 flex flex-col gap-2">
        {account.channels.map((channel) => (
          <Link
            key={channel.id}
            to={channel.platform === "meta_ads" ? "/dashboard-meta" : "/dashboard"}
            search={{ channel_id: channel.id }}
            className="flex items-center gap-2.5 rounded-xl border border-sr-border px-3 py-2 text-sm text-sr-foreground/90 hover:border-sr-primary/40 hover:bg-sr-accent/50 transition-colors"
          >
            {channel.logo_url ? (
              <img src={channel.logo_url} alt="" className="w-4 h-4 rounded object-contain" />
            ) : (
              <ChannelIcon platform={channel.platform} className="w-4 h-4 shrink-0" />
            )}
            <span className="truncate">{channel.name}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}

const PACING_LABEL: Record<string, string> = { ahead: "Ahead", on_pace: "On pace", behind: "Behind" };

function KpiChip({ label, kpi }: { label: string; kpi: KPIValue }) {
  const good = kpi.isBetter === true;
  const bad = kpi.isBetter === false;
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-sr-muted-foreground">{label}</p>
      <p className="font-sr-num mt-0.5 truncate text-[0.95rem] font-semibold tabular-nums text-sr-foreground">{kpi.formatted}</p>
      {kpi.pctChange !== null && (
        <p
          className={cn(
            "font-sr-num text-[11px] font-medium tabular-nums",
            good && "text-sr-success",
            bad && "text-sr-destructive",
            !good && !bad && "text-sr-muted-foreground",
          )}
        >
          {kpi.pctChange >= 0 ? "+" : ""}
          {kpi.pctChange.toFixed(1)}%
        </p>
      )}
    </div>
  );
}

/** Real per-day spend trend for the account's own selected window — never fabricated. */
function Sparkline({ data, gradientId }: { data: number[]; gradientId: string }) {
  if (data.length < 2) return <div className="h-9" aria-hidden="true" />;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const w = 100;
  const h = 36;
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - ((v - min) / range) * h}`);
  const line = pts.join(" ");
  const area = `0,${h} ${line} ${w},${h}`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-9 w-full" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="hsl(var(--sr-primary))" stopOpacity={0.28} />
          <stop offset="100%" stopColor="hsl(var(--sr-primary))" stopOpacity={0} />
        </linearGradient>
      </defs>
      <polygon points={area} fill={`url(#${gradientId})`} />
      <polyline points={line} fill="none" stroke="hsl(var(--sr-primary))" strokeWidth={2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

function AccountLogo({ account }: { account: HomeAccount }) {
  if (account.logo_url) {
    return <img src={account.logo_url} alt="" className="w-10 h-10 rounded-lg object-contain shrink-0" />;
  }
  const initial = account.name.trim().charAt(0).toUpperCase() || "?";
  return (
    <div className="w-10 h-10 rounded-lg bg-sr-muted border border-sr-border flex items-center justify-center text-sm font-semibold text-sr-foreground/80 shrink-0">
      {initial}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Loading / error / empty states
// ─────────────────────────────────────────────────────────────────────────────

function LoadingState() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="rounded-2xl border border-sr-border p-5 animate-pulse">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-sr-muted" />
            <div className="flex-1 flex flex-col gap-2">
              <div className="h-3.5 w-2/3 rounded bg-sr-muted" />
              <div className="h-2.5 w-1/3 rounded bg-sr-muted/60" />
            </div>
          </div>
          <div className="mt-4 flex flex-col gap-2">
            <div className="h-9 rounded-xl bg-sr-muted/60" />
          </div>
        </div>
      ))}
    </div>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-sr-destructive/20 bg-sr-destructive/10 px-6 py-10 text-center">
      <AlertCircle className="w-6 h-6 text-sr-destructive" />
      <p className="text-sm text-sr-destructive max-w-sm">{message}</p>
      <button
        onClick={onRetry}
        className={cn(
          "flex items-center gap-2 rounded-lg border border-sr-border px-4 py-2 text-sm font-medium text-sr-foreground/80",
          "hover:bg-sr-accent/50 transition-colors",
        )}
      >
        <RefreshCw className="w-3.5 h-3.5" /> Try again
      </button>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-2xl border border-sr-border px-6 py-12 text-center">
      <p className="text-sm text-sr-muted-foreground">
        No accounts have been assigned to you yet.
      </p>
      <p className="mt-1 text-xs text-sr-muted-foreground/70">Contact your administrator to request access.</p>
    </div>
  );
}
