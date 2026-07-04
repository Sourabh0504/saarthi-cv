import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState, useCallback } from "react";
import { Gem, AlertCircle, RefreshCw, Search, Palette, Sun, Moon } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { fetchHomeData, type HomeAccount } from "@/lib/api";
import { ChannelIcon } from "@/lib/channelIcons";
import { ProfileContent } from "@/routes/profile";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "CreativeVisibility — Accounts" },
      { name: "description", content: "Select an account and channel to view performance." },
    ],
  }),
  component: Home,
});

type PaletteName = "gold" | "indigo" | "mint" | "rose";

const PALETTE_SWATCHES: Record<PaletteName, string> = {
  gold:   "oklch(0.77 0.12 85)",
  indigo: "oklch(0.70 0.18 270)",
  mint:   "oklch(0.72 0.14 175)",
  rose:   "oklch(0.70 0.16 10)",
};

function Home() {
  const { user, isLoggedIn, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();

  const [accounts, setAccounts]   = useState<HomeAccount[] | null>(null);
  const [error, setError]         = useState<string | null>(null);
  const [loading, setLoading]     = useState(true);
  const [search, setSearch]       = useState("");
  const [profileOpen, setProfileOpen] = useState(false);

  // ── Theme + palette (shared app-wide via localStorage + <html> classes,
  //    same keys/classes the dashboard uses, so switching here or there stays in sync) ──
  const [theme, setTheme]     = useState<"dark" | "light">("dark");
  const [palette, setPalette] = useState<PaletteName>("gold");

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

  if (authLoading || !isLoggedIn) return null;

  return (
    <div className="relative min-h-screen overflow-hidden bg-background text-foreground font-sans">
      <div className="aurora-bg" aria-hidden />
      <div className="aurora-grid" aria-hidden />

      {/* ── Header ── */}
      <header className="relative z-10 flex items-center gap-3 px-6 py-5 border-b border-border/60 backdrop-blur-xl bg-background/70 sticky top-0">
        <div className="w-9 h-9 rounded-lg bg-gold-gradient flex items-center justify-center">
          <Gem className="w-5 h-5 text-primary-foreground" />
        </div>
        <div className="font-display font-bold tracking-tight">CreativeVisibility</div>

        <div className="ml-auto flex items-center gap-2">
          {/* Palette switcher */}
          <Popover>
            <PopoverTrigger asChild>
              <button
                aria-label="Switch colour palette"
                title="Switch colour palette"
                className="flex items-center justify-center w-8 h-8 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
              >
                <Palette className="w-4 h-4" />
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-auto p-3">
              <p className="text-[10px] text-muted-foreground mb-2.5 uppercase tracking-wider font-medium">Palette</p>
              <div className="flex items-center gap-3">
                {(Object.keys(PALETTE_SWATCHES) as PaletteName[]).map((p) => (
                  <button
                    key={p}
                    onClick={() => setPalette(p)}
                    className="flex flex-col items-center gap-1.5 group"
                    title={`${p.charAt(0).toUpperCase() + p.slice(1)} palette`}
                  >
                    <span
                      className={cn(
                        "w-6 h-6 rounded-full transition-transform group-hover:scale-110",
                        palette === p
                          ? "ring-2 ring-white/60 ring-offset-1 ring-offset-popover scale-110"
                          : "opacity-60 group-hover:opacity-100",
                      )}
                      style={{ background: PALETTE_SWATCHES[p] }}
                    />
                    <span className={cn(
                      "text-[10px] capitalize",
                      palette === p ? "text-foreground" : "text-muted-foreground",
                    )}>
                      {p}
                    </span>
                  </button>
                ))}
              </div>
            </PopoverContent>
          </Popover>

          {/* Theme toggle */}
          <button
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            aria-label="Toggle theme"
            title="Toggle light / dark"
            className="flex items-center justify-center w-8 h-8 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
          >
            {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>

          {/* Profile */}
          <button
            onClick={() => setProfileOpen(true)}
            title={user ? `Signed in as ${user.email}` : "Profile"}
            aria-label="Open profile"
            className="w-8 h-8 rounded-full p-0.5 cursor-pointer hover:scale-105 transition-transform bg-gold-gradient"
          >
            {user?.picture ? (
              <img
                src={user.picture}
                alt={user.name || user.email}
                className="w-full h-full rounded-full object-cover"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="w-full h-full rounded-full bg-background flex items-center justify-center">
                <span className="text-[10px] font-bold text-gold">
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
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Accounts</h1>
            <p className="mt-1 text-sm text-muted-foreground">Select an account and channel to view performance.</p>
          </div>

          {accounts && accounts.length > 0 && (
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search accounts…"
                className="w-full rounded-lg border border-border bg-input/20 py-2 pl-8 pr-3 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-gold/50 transition-colors"
              />
            </div>
          )}
        </div>

        <div className="mt-6">
          {loading && <LoadingState />}
          {!loading && error && <ErrorState message={error} onRetry={load} />}
          {!loading && !error && accounts && accounts.length === 0 && <EmptyState />}
          {!loading && !error && accounts && accounts.length > 0 && filtered.length === 0 && (
            <p className="text-sm text-muted-foreground py-8 text-center">No accounts match "{search}".</p>
          )}
          {!loading && !error && groups.length > 0 && (
            <div className="flex flex-col gap-8">
              {groups.map((cluster) => (
                <div key={cluster.clusterName}>
                  {groups.length > 1 && (
                    <div className="mb-3 text-[10px] uppercase tracking-widest text-muted-foreground">{cluster.clusterName}</div>
                  )}
                  <div className="flex flex-col gap-6">
                    {cluster.teams.map((team) => (
                      <div key={team.teamName}>
                        <div className="mb-3 text-xs font-medium text-muted-foreground">{team.teamName}</div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                          {team.accounts.map((account) => (
                            <AccountCard key={account.id} account={account} />
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

function AccountCard({ account }: { account: HomeAccount }) {
  return (
    <div className="rounded-2xl border border-border bg-card/60 backdrop-blur-2xl shadow-card p-5 transition-all hover:border-gold/40 hover:shadow-gold">
      <Link
        to="/account"
        search={{ account_id: account.id }}
        className="flex items-center gap-3 group"
        title={`Open ${account.name} overview`}
      >
        <AccountLogo account={account} />
        <div className="min-w-0">
          <div className="font-semibold text-foreground truncate group-hover:text-gold transition-colors">{account.name}</div>
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
            {account.channels.length} channel{account.channels.length === 1 ? "" : "s"}
          </div>
        </div>
      </Link>

      <div className="mt-4 flex flex-col gap-2">
        {account.channels.map((channel) => (
          <Link
            key={channel.id}
            to={channel.platform === "meta_ads" ? "/dashboard-meta" : "/dashboard"}
            search={{ channel_id: channel.id }}
            className="flex items-center gap-2.5 rounded-xl border border-border px-3 py-2.5 text-sm text-foreground/90 hover:border-gold/40 hover:bg-accent/50 transition-colors"
          >
            {channel.logo_url ? (
              <img src={channel.logo_url} alt="" className="w-5 h-5 rounded object-contain" />
            ) : (
              <ChannelIcon platform={channel.platform} className="w-5 h-5 shrink-0" />
            )}
            <span className="truncate">{channel.name}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}

function AccountLogo({ account }: { account: HomeAccount }) {
  if (account.logo_url) {
    return <img src={account.logo_url} alt="" className="w-10 h-10 rounded-lg object-contain shrink-0" />;
  }
  const initial = account.name.trim().charAt(0).toUpperCase() || "?";
  return (
    <div className="w-10 h-10 rounded-lg bg-accent/60 border border-border flex items-center justify-center text-sm font-semibold text-foreground/80 shrink-0">
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
        <div key={i} className="rounded-2xl border border-border p-5 animate-pulse">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-muted" />
            <div className="flex-1 flex flex-col gap-2">
              <div className="h-3.5 w-2/3 rounded bg-muted" />
              <div className="h-2.5 w-1/3 rounded bg-muted/60" />
            </div>
          </div>
          <div className="mt-4 flex flex-col gap-2">
            <div className="h-9 rounded-xl bg-muted/60" />
          </div>
        </div>
      ))}
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
        className={cn(
          "flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground/80",
          "hover:bg-accent/50 transition-colors",
        )}
      >
        <RefreshCw className="w-3.5 h-3.5" /> Try again
      </button>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-2xl border border-border px-6 py-12 text-center">
      <p className="text-sm text-muted-foreground">
        No accounts have been assigned to you yet.
      </p>
      <p className="mt-1 text-xs text-muted-foreground/70">Contact your administrator to request access.</p>
    </div>
  );
}
