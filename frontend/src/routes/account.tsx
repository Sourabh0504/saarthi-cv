import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState, useMemo, useCallback } from "react";
import { Gem, Palette, Sun, Moon, AlertCircle, RefreshCw, ArrowLeft, Target, FileText, ChartLine, LayoutDashboard } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import {
  fetchHomeData, fetchAccountSummary, fetchAccountTarget,
  type HomeAccount, type AccountSummaryResponse, type AccountTargetResponse,
} from "@/lib/api";
import { ChannelIcon } from "@/lib/channelIcons";
import { ChangeLogWidget } from "@/components/ChangeLogWidget";
import { CreativeVisibilityWidget } from "@/components/CreativeVisibilityWidget";
import { TrendsSection } from "@/components/analytics/TrendsSection";
import { ProfileContent } from "@/routes/profile";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/account")({
  validateSearch: (search: Record<string, unknown>) => ({
    account_id: typeof search.account_id === "string" ? search.account_id : "",
  }),
  head: () => ({
    meta: [{ title: "CreativeVisibility — Account Overview" }],
  }),
  component: AccountOverview,
});

type PaletteName = "gold" | "indigo" | "mint" | "rose";

const PALETTE_SWATCHES: Record<PaletteName, string> = {
  gold:   "oklch(0.77 0.12 85)",
  indigo: "oklch(0.70 0.18 270)",
  mint:   "oklch(0.72 0.14 175)",
  rose:   "oklch(0.70 0.16 10)",
};

function currentMonthLabel(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

function AccountOverview() {
  const { user, isLoggedIn, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { account_id: accountId } = Route.useSearch();

  // ── Theme + palette (same localStorage keys as Home/dashboard) ──────────────
  const [theme, setTheme]     = useState<"dark" | "light">("dark");
  const [palette, setPalette] = useState<PaletteName>("gold");
  const [profileOpen, setProfileOpen] = useState(false);

  useEffect(() => {
    const storedTheme   = localStorage.getItem("cv-theme") as "dark" | "light" | null;
    const storedPalette = localStorage.getItem("cv-palette") as PaletteName | null;
    if (storedTheme) setTheme(storedTheme);
    if (storedPalette) setPalette(storedPalette);
  }, []);
  useEffect(() => {
    document.documentElement.classList.toggle("light", theme === "light");
    localStorage.setItem("cv-theme", theme);
  }, [theme]);
  useEffect(() => {
    document.documentElement.classList.remove("palette-indigo", "palette-mint", "palette-rose");
    if (palette !== "gold") document.documentElement.classList.add(`palette-${palette}`);
    localStorage.setItem("cv-palette", palette);
  }, [palette]);

  // ── Auth guard ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!authLoading && !isLoggedIn) navigate({ to: "/login" });
  }, [isLoggedIn, authLoading, navigate]);

  // ── Data ──────────────────────────────────────────────────────────────────
  const [account, setAccount]   = useState<HomeAccount | null>(null);
  const [summary, setSummary]   = useState<AccountSummaryResponse | null>(null);
  const [target, setTarget]     = useState<AccountTargetResponse | null>(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!accountId) {
      setError("No account selected. Go back to Home and pick an account.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [home, accSummary] = await Promise.all([
        fetchHomeData(),
        fetchAccountSummary(accountId),
      ]);
      const foundAccount = home.accounts.find((a) => a.id === accountId) ?? null;
      if (!foundAccount) {
        setError("You don't have access to this account, or it doesn't exist.");
        setLoading(false);
        return;
      }
      setAccount(foundAccount);
      setSummary(accSummary);

      const month = accSummary.date_range.start.slice(0, 7); // "YYYY-MM"
      fetchAccountTarget(accountId, month).then(setTarget).catch(() => setTarget(null));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load account overview.");
    } finally {
      setLoading(false);
    }
  }, [accountId]);

  useEffect(() => { if (isLoggedIn) load(); }, [isLoggedIn, load]);

  const leadsProgress = useMemo(() => {
    if (!target?.found || !target.target_leads || !summary) return null;
    const pct = Math.min(100, Math.round((summary.totals.conversions / target.target_leads) * 100));
    return pct;
  }, [target, summary]);

  const spendProgress = useMemo(() => {
    if (!target?.found || !target.target_spend || !summary) return null;
    const pct = Math.min(100, Math.round((summary.totals.cost / target.target_spend) * 100));
    return pct;
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

  if (authLoading || !isLoggedIn) return null;

  return (
    <div className="relative min-h-screen overflow-hidden bg-background text-foreground font-sans">
      <div className="aurora-bg" aria-hidden />
      <div className="aurora-grid" aria-hidden />

      {/* ── Header ── */}
      <header className="relative z-10 flex items-center gap-3 px-6 py-5 border-b border-border/60 backdrop-blur-xl bg-background/70 sticky top-0">
        <Link to="/" className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors" title="Back to Home">
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div className="w-9 h-9 rounded-lg bg-gold-gradient flex items-center justify-center">
          <Gem className="w-5 h-5 text-primary-foreground" />
        </div>
        <div>
          <div className="font-display font-bold tracking-tight">{account?.name ?? "Account Overview"}</div>
          {summary && (
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
              {currentMonthLabel(summary.date_range.start)}
            </div>
          )}
        </div>

        <div className="ml-auto flex items-center gap-2">
          {account && (
            <Link
              to="/canvas"
              search={{ account_id: account.id }}
              className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm text-foreground/80 hover:border-gold/40 hover:bg-accent/50 transition-colors"
              title="View pinned charts"
            >
              <LayoutDashboard className="w-4 h-4" /> My Dashboard
            </Link>
          )}
          {account && (
            <Link
              to="/explore"
              search={{ account_id: account.id }}
              className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm text-foreground/80 hover:border-gold/40 hover:bg-accent/50 transition-colors"
              title="Build your own chart"
            >
              <ChartLine className="w-4 h-4" /> Explore
            </Link>
          )}
          {account && (
            <Link
              to="/reports"
              search={{ account_id: account.id }}
              className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm text-foreground/80 hover:border-gold/40 hover:bg-accent/50 transition-colors"
              title="Generate Business Review deck"
            >
              <FileText className="w-4 h-4" /> Business Review
            </Link>
          )}
          <Popover>
            <PopoverTrigger asChild>
              <button
                aria-label="Switch colour palette"
                className="flex items-center justify-center w-8 h-8 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
              >
                <Palette className="w-4 h-4" />
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-auto p-3">
              <div className="flex items-center gap-3">
                {(Object.keys(PALETTE_SWATCHES) as PaletteName[]).map((p) => (
                  <button
                    key={p}
                    onClick={() => setPalette(p)}
                    className="flex flex-col items-center gap-1.5 group"
                  >
                    <span
                      className={cn(
                        "w-6 h-6 rounded-full transition-transform group-hover:scale-110",
                        palette === p ? "ring-2 ring-white/60 ring-offset-1 ring-offset-popover scale-110" : "opacity-60 group-hover:opacity-100",
                      )}
                      style={{ background: PALETTE_SWATCHES[p] }}
                    />
                    <span className="text-[10px] capitalize text-muted-foreground">{p}</span>
                  </button>
                ))}
              </div>
            </PopoverContent>
          </Popover>

          <button
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            aria-label="Toggle theme"
            className="flex items-center justify-center w-8 h-8 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
          >
            {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>

          <button
            onClick={() => setProfileOpen(true)}
            title={user ? `Signed in as ${user.email}` : "Profile"}
            className="w-8 h-8 rounded-full p-0.5 cursor-pointer hover:scale-105 transition-transform bg-gold-gradient"
          >
            {user?.picture ? (
              <img src={user.picture} alt={user.name || user.email} className="w-full h-full rounded-full object-cover" referrerPolicy="no-referrer" />
            ) : (
              <div className="w-full h-full rounded-full bg-background flex items-center justify-center">
                <span className="text-[10px] font-bold text-gold">{(user?.name || user?.email || "U").charAt(0).toUpperCase()}</span>
              </div>
            )}
          </button>
        </div>
      </header>

      <Dialog open={profileOpen} onOpenChange={setProfileOpen}>
        <DialogContent className="max-w-xl bg-transparent border-0 shadow-none p-0">
          <DialogTitle className="sr-only">Profile</DialogTitle>
          <div className="max-h-[85vh] overflow-y-auto pr-1">
            <ProfileContent />
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Body ── */}
      <main className="relative z-10 mx-auto max-w-6xl px-6 pb-16 pt-6">
        {loading && <LoadingState />}
        {!loading && error && <ErrorState message={error} onRetry={load} />}

        {!loading && !error && account && summary && (
          <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">
            {/* ── Left sidebar ── */}
            <div className="flex flex-col gap-5 order-2 lg:order-1">
              <CreativeVisibilityWidget
                channels={account.channels}
                start={summary.date_range.start}
                end={summary.date_range.end}
              />
              <ChangeLogWidget accountId={accountId} />
            </div>

            {/* ── Main KPI area ── */}
            <div className="flex flex-col gap-5 order-1 lg:order-2">
              {/* Hero: Leads vs Target */}
              <div className="rounded-2xl border border-border bg-card/60 backdrop-blur-2xl shadow-card p-6">
                <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground">
                  <Target className="w-3.5 h-3.5 text-gold" /> Leads this period
                </div>
                <div className="mt-2 flex items-baseline gap-3 flex-wrap">
                  <span className="text-4xl font-bold text-foreground">{Math.round(summary.totals.conversions).toLocaleString()}</span>
                  {target?.found ? (
                    <span className="text-sm text-muted-foreground">Target: {target.target_leads?.toLocaleString()}</span>
                  ) : (
                    <span className="text-sm text-muted-foreground">No target set for this month</span>
                  )}
                </div>
                {leadsProgress !== null && (
                  <div className="mt-3">
                    <div className="h-2 rounded-full bg-muted overflow-hidden">
                      <div className="h-full bg-gold-gradient transition-all" style={{ width: `${leadsProgress}%` }} />
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">{leadsProgress}% of target</div>
                  </div>
                )}
              </div>

              {/* Secondary KPIs */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <KpiCard
                  label="Spend"
                  value={`₹${summary.totals.cost.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
                  sub={target?.found && target.target_spend ? `of ₹${target.target_spend.toLocaleString()} (${spendProgress}%)` : undefined}
                />
                <KpiCard label="Impressions" value={summary.totals.impressions.toLocaleString()} />
                <KpiCard label="Clicks" value={summary.totals.clicks.toLocaleString()} />
                <KpiCard label="CTR" value={`${summary.totals.ctr}%`} />
                <KpiCard label="CPC" value={`₹${summary.totals.cpc}`} />
                <KpiCard label="CPM" value={`₹${summary.totals.cpm}`} />
                <KpiCard label="Cost / Lead" value={`₹${summary.totals.cost_per_conversion}`} />
              </div>

              {/* Trends */}
              <div className="rounded-2xl border border-border bg-card/60 backdrop-blur-2xl shadow-card p-5">
                <h3 className="font-semibold text-foreground mb-3">Trends</h3>
                <TrendsSection
                  accountId={accountId}
                  channels={account.channels}
                  start={summary.date_range.start}
                  end={summary.date_range.end}
                  dailyTargetPace={dailyTargetPace}
                />
              </div>

              {/* Channel split + entry points */}
              <div className="rounded-2xl border border-border bg-card/60 backdrop-blur-2xl shadow-card p-5">
                <h3 className="font-semibold text-foreground">Channels</h3>
                {summary.partial && (
                  <p className="mt-1 text-xs text-amber-400">Some channel data couldn't be loaded — totals above may be incomplete.</p>
                )}
                <div className="mt-3 flex flex-col gap-2">
                  {summary.channels.map((ch) => (
                    <Link
                      key={ch.channel_id}
                      to={ch.platform === "meta_ads" ? "/dashboard-meta" : "/dashboard"}
                      search={{ channel_id: ch.channel_id }}
                      className="flex items-center gap-3 rounded-xl border border-border px-3 py-2.5 hover:border-gold/40 hover:bg-accent/50 transition-colors"
                    >
                      <ChannelIcon platform={ch.platform} className="w-5 h-5 shrink-0" />
                      <span className="text-sm text-foreground flex-1">{ch.channel_name}</span>
                      {ch.error ? (
                        <span className="text-xs text-destructive">Failed to load</span>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          ₹{(ch.cost ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 })} · {Math.round(ch.conversions ?? 0).toLocaleString()} leads
                        </span>
                      )}
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function KpiCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card/60 backdrop-blur-2xl shadow-card p-4">
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className="mt-1 text-xl font-bold text-foreground">{value}</div>
      {sub && <div className="mt-0.5 text-[11px] text-muted-foreground">{sub}</div>}
    </div>
  );
}

function LoadingState() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">
      <div className="h-64 rounded-2xl bg-muted/40 animate-pulse" />
      <div className="flex flex-col gap-5">
        <div className="h-32 rounded-2xl bg-muted/40 animate-pulse" />
        <div className="grid grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-20 rounded-2xl bg-muted/40 animate-pulse" />)}
        </div>
      </div>
    </div>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-destructive/20 bg-destructive/10 px-6 py-10 text-center">
      <AlertCircle className="w-6 h-6 text-destructive" />
      <p className="text-sm text-destructive max-w-sm">{message}</p>
      <button
        onClick={onRetry}
        className="flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground/80 hover:bg-accent/50 transition-colors"
      >
        <RefreshCw className="w-3.5 h-3.5" /> Try again
      </button>
    </div>
  );
}
