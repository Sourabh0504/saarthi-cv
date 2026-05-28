import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState, useEffect, useCallback, useRef } from "react";
import {
  Gem, Sparkles, Moon, Sun, LayoutGrid, Trophy, Database,
  IndianRupee, MousePointerClick, Eye, Target, PanelLeftClose,
  PanelLeftOpen, Network, Maximize2, RefreshCw, AlertTriangle,
  Loader2,
} from "lucide-react";

// ── API ───────────────────────────────────────────────────────────────────────
import { fetchPerformance, fetchCurrentStructure, syncCache, type Creative, type FilterOptions } from "@/lib/api";

// ── Lib ───────────────────────────────────────────────────────────────────────
import { computeMetrics, fmtINR, fmtINR0, fmtNum, fmtPct, type ComputedMetrics } from "@/lib/metrics";
import { GroupingSidebar, type SidebarMode } from "@/components/GroupingSidebar";
import { type Dim, DEFAULT_HIERARCHY } from "@/lib/hierarchy";
import { DirectoryTree } from "@/components/DirectoryTree";
import { TopPerformers } from "@/components/TopPerformers";
import { FilterPanel, type Filters } from "@/components/FilterPanel";
import { ExportModal } from "@/components/ExportModal";
import { SavedViewsMenu } from "@/components/SavedViewsMenu";
import { CreativeDetailModal } from "@/components/CreativeDetailModal";
import { readSharedViewFromHash, clearShareHash } from "@/lib/savedViews";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { cn, copyText } from "@/lib/utils";

// ── Types (re-export so rest of app can import Creative from here) ─────────────
export type { Creative };

export const Route = createFileRoute("/")(({
  head: () => ({
    meta: [
      { title: "CreativeVisibility — Luxury Jewelry Campaign Portal" },
      { name: "description", content: "Real-time visual creative directory and performance reporting for high-budget jewelry Google Ads campaigns." },
    ],
    links: [
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "" },
      { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Montserrat:wght@500;600;700;800&display=swap" },
    ],
  }),
  component: Portal,
}));

const DEFAULT_COLS = {
  impressions: true, clicks: true, cost: true, conversions: false,
  ctr: true, cpc: true, cpm: false, cr: false, cpa: true,
};

// ─────────────────────────────────────────────────────────────────────────────
// Portal Component
// ─────────────────────────────────────────────────────────────────────────────
function Portal() {
  // Date range defaults to auto (sheet min/max). Inputs are set after first load.
  const startDef = "";
  const endDef   = "";

  // ── UI State ─────────────────────────────────────────────────────────────
  const [filters, setFilters] = useState<Filters>({
    startDate: startDef, endDate: endDef,
    status: "Enabled", city: "All", funnel: "All", search: "",
  });
  const [hierarchy, setHierarchy] = useState<Dim[]>(DEFAULT_HIERARCHY);
  const [sidebarOpen, setSidebarOpen]   = useState(true);
  const [columns, setColumns]           = useState<Record<string, boolean>>(DEFAULT_COLS);
  const [theme, setTheme]               = useState<"dark" | "light">("dark");
  const [exportOpen, setExportOpen]     = useState(false);
  const [rankMetric, setRankMetric]     = useState<"ctr" | "conversions" | "cpc" | "cpa">("ctr");
  const [mode, setMode]                 = useState<SidebarMode>("report");
  const [rowHeight, setRowHeight]       = useState<number>(96);
  const [activeKey, setActiveKey]       = useState<string>("ALL");

  // ── API State ─────────────────────────────────────────────────────────────
  const [creatives, setCreatives]           = useState<Creative[]>([]);
  const [filterOptions, setFilterOptions]   = useState<FilterOptions>({
    cities: [], campaign_types: [], categories: [], age_groups: [], funnels: [], statuses: [],
  });
  const [availableRange, setAvailableRange] = useState<{ min: string; max: string } | null>(null);
  const [loading, setLoading]   = useState(true);
  const [syncing, setSyncing]   = useState(false);
  const [error, setError]       = useState<string | null>(null);

  // ── Current Structure State ─────────────────────────────────────
  const [structureCreatives, setStructureCreatives] = useState<Creative[]>([]);
  const [structureLoading, setStructureLoading]     = useState(false);
  const [structureError, setStructureError]         = useState<string | null>(null);
  const structureFetched = useRef(false); // fetch once per session

  // Auto-sets date pickers to sheet's actual date range on first load (once only)
  const datesInitialized = useRef(false);
  const skipNextFetch = useRef(false);

  // ── Selected creatives ────────────────────────────────────────────────────
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // ── Detail modal ──────────────────────────────────────────────────────────
  const [detailHistory, setDetailHistory] = useState<string[]>([]);
  const [detailCursor, setDetailCursor]   = useState<number>(-1);
  const detailId       = detailCursor >= 0 ? detailHistory[detailCursor] : null;
  const creativeById   = useMemo(() => new Map(creatives.map(c => [c.creative_id, c])), [creatives]);
  const detailCreative = detailId ? creativeById.get(detailId) ?? null : null;

  const openDetail = (c: Creative) => {
    setDetailHistory(prev => {
      const trimmed = prev.slice(0, detailCursor + 1);
      if (trimmed[trimmed.length - 1] === c.creative_id) return trimmed;
      const next = [...trimmed, c.creative_id].slice(-50);
      setDetailCursor(next.length - 1);
      return next;
    });
  };
  const closeDetail    = () => { setDetailCursor(-1); setDetailHistory([]); };
  const navigateDetail = (c: Creative) => openDetail(c);

  const clampToAvailable = useCallback((next: Filters) => {
    if (!availableRange?.min || !availableRange?.max) return next;
    const min = availableRange.min;
    const max = availableRange.max;
    let start = next.startDate;
    let end = next.endDate;
    if (start && start < min) start = min;
    if (start && start > max) start = max;
    if (end && end < min) end = min;
    if (end && end > max) end = max;
    if (start && end && start > end) end = start;
    return { ...next, startDate: start, endDate: end };
  }, [availableRange]);

  const setFiltersSafe = useCallback((next: Filters) => {
    setFilters(clampToAvailable(next));
  }, [clampToAvailable]);

  // ── Theme persistence ─────────────────────────────────────────────────────
  useEffect(() => {
    const stored = localStorage.getItem("cv-theme") as "dark" | "light" | null;
    if (stored) setTheme(stored);
  }, []);
  useEffect(() => {
    document.documentElement.classList.toggle("light", theme === "light");
    localStorage.setItem("cv-theme", theme);
  }, [theme]);

  // ── Shared view from URL hash ─────────────────────────────────────────────
  useEffect(() => {
    const shared = readSharedViewFromHash();
    if (shared) {
      setFilters(shared.filters);
      setHierarchy(shared.hierarchy);
      setColumns(shared.columns);
      setActiveKey(shared.activeKey);
      setSelected(new Set(shared.selectedIds));
      clearShareHash();
      toast.success("Shared view loaded", { description: shared.name ? `"${shared.name}"` : undefined });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Main data fetch ───────────────────────────────────────────────────────
  const loadData = useCallback(async (start?: string, end?: string, status?: Filters["status"], quiet = false) => {
    if (!quiet) setLoading(true);
    setError(null);
    try {
      const useRange = !!start && !!end;
      const useStatus = status && status !== "All" ? status : undefined;
      const data = await fetchPerformance(useRange ? start : undefined, useRange ? end : undefined, useStatus);
      setCreatives(data.creatives);
      setFilterOptions(data.filter_options);
      if (data.available_date_range?.min && data.available_date_range?.max) {
        setAvailableRange({ min: data.available_date_range.min, max: data.available_date_range.max });
      }
      // Select all on first load
      setSelected(prev => prev.size === 0
        ? new Set(data.creatives.map(c => c.creative_id))
        : prev
      );
      // Auto-set date pickers to the sheet's actual date range (first load only)
      if (!datesInitialized.current && data.available_date_range?.min && data.available_date_range?.max) {
        datesInitialized.current = true;
        skipNextFetch.current = true;
        setFilters(prev => ({
          ...prev,
          startDate: data.available_date_range!.min,
          endDate:   data.available_date_range!.max,
        }));
      }
      if (!quiet && data.served_from_cache) {
        toast.info("Served from cache", { description: "Data is up to 15 min old. Hit sync to refresh." });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      setError(msg);
      if (!quiet) toast.error("Failed to load data", { description: msg });
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch on mount
  useEffect(() => { loadData(filters.startDate, filters.endDate, filters.status); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Re-fetch when date range changes
  useEffect(() => {
    if (skipNextFetch.current) {
      skipNextFetch.current = false;
      return;
    }
    if (!loading) loadData(filters.startDate, filters.endDate, filters.status, true);
  }, [filters.startDate, filters.endDate, filters.status]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Force sync ────────────────────────────────────────────────────────────
  const handleSync = async () => {
    setSyncing(true);
    // Also clear structure cache so next switch re-fetches
    structureFetched.current = false;
    setStructureCreatives([]);
    try {
      await syncCache();
      await loadData(filters.startDate, filters.endDate, filters.status);
      toast.success("Synced", { description: "Cache cleared and refreshed." });
    } catch (err) {
      toast.error("Sync failed", { description: err instanceof Error ? err.message : "Unknown error" });
    } finally {
      setSyncing(false);
    }
  };

  // ── Fetch Current Structure when mode switches ──────────────────────
  useEffect(() => {
    if (mode !== "structure") return;
    if (structureFetched.current) return; // already have data
    structureFetched.current = true;
    setStructureLoading(true);
    setStructureError(null);
    fetchCurrentStructure()
      .then(data => {
        setStructureCreatives(data.creatives);
        if (data.served_from_cache) {
          toast.info("Structure served from cache", { description: "Up to 15 min old. Hit sync to refresh." });
        }
      })
      .catch(err => {
        const msg = err instanceof Error ? err.message : "Unknown error";
        setStructureError(msg);
        toast.error("Failed to load current structure", { description: msg });
        structureFetched.current = false; // allow retry
      })
      .finally(() => setStructureLoading(false));
  }, [mode]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Filtered creatives (dimension-level) ──────────────────────────────────
  const filteredCreatives = useMemo(() => {
    return creatives.filter(c => {
      if (filters.status !== "All" && c.status !== filters.status) return false;
      if (filters.city   !== "All" && c.city   !== filters.city)   return false;
      if (filters.funnel !== "All" && c.funnel  !== filters.funnel) return false;
      if (filters.search) {
        const q = filters.search.toLowerCase();
        const hay = [c.campaign_name, c.city, c.category, c.headline, c.description]
          .join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [creatives, filters]);

  // ── Aggregate metrics per creative ────────────────────────────────────────
  // Backend already returns pre-aggregated data for the date range.
  // We build ComputedMetrics from the API fields directly.
  const aggregated = useMemo(() => {
    const result = new Map<string, ComputedMetrics>();
    for (const c of creatives) {
      result.set(c.creative_id, computeMetrics({
        impressions: c.impressions  ?? 0,
        clicks:      c.clicks       ?? 0,
        cost:        c.cost         ?? 0,
        conversions: c.conversions  ?? 0,
      }));
    }
    return result;
  }, [creatives]);

  const visibleRows = useMemo(() => {
    return filteredCreatives
      .filter(c => selected.has(c.creative_id))
      .map(c => ({
        creative: c,
        metrics: aggregated.get(c.creative_id)
          ?? computeMetrics({ impressions: 0, clicks: 0, cost: 0, conversions: 0 }),
      }));
  }, [filteredCreatives, selected, aggregated]);

  // ── Totals ────────────────────────────────────────────────────────────────
  const totals = useMemo(() => {
    const t = { impressions: 0, clicks: 0, cost: 0, conversions: 0 };
    for (const r of visibleRows) {
      t.impressions += r.metrics.impressions;
      t.clicks      += r.metrics.clicks;
      t.cost        += r.metrics.cost;
      t.conversions += r.metrics.conversions;
    }
    return computeMetrics(t);
  }, [visibleRows]);

  // ── Export CSV ────────────────────────────────────────────────────────────
  const handleExportCSV = () => {
    const headers = [
      "Creative ID","Headline","Campaign","Funnel","Type","City","Category","Age","Status",
      "Impressions","Clicks","Cost","Conversions","CTR (%)","CPC (₹)","CPM (₹)","CR (%)","CPA (₹)",
    ];
    const rows = visibleRows.map(r => [
      r.creative.creative_id, r.creative.headline ?? "", r.creative.campaign_name,
      r.creative.funnel, r.creative.creative_type, r.creative.city, r.creative.category,
      r.creative.age_group, r.creative.status,
      r.metrics.impressions, r.metrics.clicks, r.metrics.cost.toFixed(2),
      r.metrics.conversions.toFixed(2), r.metrics.ctr, r.metrics.cpc,
      r.metrics.cpm, r.metrics.cr, r.metrics.cpa,
    ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(","));
    const csv  = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url; a.download = `creativevisibility_${filters.startDate}_${filters.endDate}.csv`;
    a.click(); URL.revokeObjectURL(url);
    toast.success(`Exported ${visibleRows.length} creatives to CSV`);
  };

  const handleExportPDF = (printTheme: "light" | "dark") => {
    setExportOpen(false);
    const el = document.getElementById("print-root");
    if (el) el.setAttribute("data-print-theme", printTheme);
    setTimeout(() => window.print(), 100);
  };

  const handleActiveChange = (key: string, ids: string[]) => {
    setActiveKey(key);
    setSelected(new Set(ids));
  };

  // ── Cities from API (dynamic — never hardcoded) ───────────────────────────
  const cities = filterOptions.cities;

  // ── Daily rows shim for CreativeDetailModal ───────────────────────────────
  // The modal expects DailyRow[] for its charts. We synthesise a single-row
  // "aggregate" entry per creative from the already-aggregated API data so
  // the modal renders correctly. When real daily granularity is needed in
  // a future phase, swap this with a /api/daily-detail endpoint.
  const dailyPerformanceShim = useMemo(() => {
    return creatives.map(c => ({
      date:        filters.endDate,   // single aggregate row dated at end of range
      creative_id: c.creative_id,
      impressions: c.impressions  ?? 0,
      clicks:      c.clicks       ?? 0,
      cost:        c.cost         ?? 0,
      conversions: c.conversions  ?? 0,
    }));
  }, [creatives, filters.endDate]);

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div id="print-root" className="min-h-screen flex flex-col relative" data-print-theme="light">
      <div className="aurora-bg no-print"  aria-hidden />
      <div className="aurora-grid no-print" aria-hidden />

      {/* ── Header ── */}
      <header className="app-header glass-strong border-b border-white/5 sticky top-0 z-30 no-print">
        <div className="flex items-center gap-4 px-6 py-3">
          <Button
            variant="ghost" size="icon"
            onClick={() => setSidebarOpen(o => !o)}
            aria-label={sidebarOpen ? "Close sidebar" : "Open sidebar"}
            className="hover:bg-white/5"
          >
            {sidebarOpen ? <PanelLeftClose className="w-4 h-4" /> : <PanelLeftOpen className="w-4 h-4" />}
          </Button>

          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-gold-gradient flex items-center justify-center shadow-gold">
              <Gem className="w-5 h-5 text-primary-foreground" />
            </div>
            <div>
              <div className="font-display font-bold tracking-tight leading-none">CreativeVisibility</div>
              <div className="text-[10px] text-muted-foreground uppercase tracking-widest">Luxury Jewelry · Performance Portal</div>
            </div>
          </div>

          <div className="ml-auto flex items-center gap-2">
            {/* Live / loading indicator */}
            {loading ? (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground px-3 py-1.5 rounded-full bg-white/[0.04] border border-white/10">
                <Loader2 className="w-3 h-3 animate-spin text-gold" />
                Loading…
              </div>
            ) : (
              <div className="hidden md:flex items-center gap-1.5 text-xs text-muted-foreground px-3 py-1.5 rounded-full bg-white/[0.04] border border-white/10 backdrop-blur">
                <Sparkles className="w-3 h-3 text-gold" />
                {selected.size} of {creatives.length} creatives
                {activeKey !== "ALL" ? ` · ${activeKey.split("::").pop()}` : ""}
              </div>
            )}

            {/* Sync button */}
            <Button
              variant="ghost" size="icon"
              onClick={handleSync}
              disabled={syncing || loading}
              title="Force refresh from Google Sheet"
              aria-label="Sync data"
              className="hover:bg-white/5"
            >
              <RefreshCw className={cn("w-4 h-4", syncing && "animate-spin")} />
            </Button>

            <Button
              variant="outline" size="icon"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              aria-label="Toggle theme"
            >
              {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </Button>
          </div>
        </div>
      </header>

      <div className="flex-1 flex">
        {/* ── Sidebar ── */}
        <aside className={cn(
          "shrink-0 no-print sticky top-[60px] transition-all duration-300 ease-out overflow-hidden",
          "max-h-[calc(100vh-60px)]",
          sidebarOpen ? "w-72" : "w-0",
        )}>
          <div className={cn("w-72 h-[calc(100vh-60px)] glass border-r border-white/5", !sidebarOpen && "opacity-0 pointer-events-none")}>
            <GroupingSidebar
              creatives={creatives}
              hierarchy={hierarchy}
              setHierarchy={setHierarchy}
              activeKey={activeKey}
              setActive={handleActiveChange}
              mode={mode}
              setMode={setMode}
            />
          </div>
        </aside>

        {/* ── Main ── */}
        <main className="flex-1 min-w-0 p-6 space-y-5">

          {/* Mode banner */}
          <div className="flex items-center gap-3 glass rounded-xl px-4 py-2.5 no-print">
            <div className="w-8 h-8 rounded-lg bg-gold-gradient flex items-center justify-center shadow-gold shrink-0">
              {mode === "report" ? <LayoutGrid className="w-4 h-4 text-primary-foreground" /> : <Network className="w-4 h-4 text-primary-foreground" />}
            </div>
            <div className="min-w-0">
              <div className="font-display font-bold text-sm tracking-tight leading-tight">
                {mode === "report" ? "Creative Report" : "Creative Structure"}
              </div>
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
                {mode === "report" ? "Performance · spend · conversions" : "Visibility · where & how each creative is used"}
              </div>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <RowHeightControl value={rowHeight} onChange={setRowHeight} />
            </div>
          </div>

          {/* ── Error banner ── */}
          {error && !loading && (
            <div className="flex items-center gap-3 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm">
              <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
              <span className="text-red-300 flex-1">{error}</span>
              <Button
                size="sm" variant="outline"
                className="border-red-500/30 text-red-300 hover:bg-red-500/10"
                onClick={() => loadData(filters.startDate, filters.endDate)}
              >
                Retry
              </Button>
            </div>
          )}

          {/* ── Sticky filter + KPI strip ── */}
          <div className="sticky top-[60px] z-20 -mx-6 px-6 pt-1 pb-3 backdrop-blur-xl bg-background/70 border-b border-white/5 space-y-3 no-print">
            <FilterPanel
              filters={filters}
              setFilters={setFiltersSafe}
              minDate={availableRange?.min}
              maxDate={availableRange?.max}
              cities={cities}
              columns={columns}
              setColumns={setColumns}
              onExportPDF={() => setExportOpen(true)}
              onExportCSV={handleExportCSV}
              rightSlot={
                <SavedViewsMenu
                  current={{ filters, hierarchy, columns, activeKey, selectedIds: Array.from(selected) }}
                  onLoad={(v) => {
                    setFiltersSafe(v.filters);
                    setHierarchy(v.hierarchy);
                    setColumns(v.columns);
                    setActiveKey(v.activeKey);
                    setSelected(new Set(v.selectedIds));
                  }}
                />
              }
            />
            {mode === "report" && (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
                <KPI icon={Eye}               label="Impressions"  value={fmtNum(totals.impressions)} />
                <KPI icon={MousePointerClick} label="Clicks"       value={fmtNum(totals.clicks)} />
                <KPI icon={IndianRupee}       label="Spend"        value={fmtINR0(totals.cost)} accent />
                <KPI icon={Target}            label="Conversions"  value={totals.conversions.toFixed(0)} />
                <KPI icon={Sparkles}          label="CTR"          value={fmtPct(totals.ctr)} />
                <KPI icon={Database}          label="CPA"          value={fmtINR(totals.cpa)} />
              </div>
            )}
          </div>

          {/* ── Loading skeleton ── */}
          {loading && (
            <div className="space-y-3 animate-pulse">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="glass rounded-xl h-28 opacity-50" />
              ))}
            </div>
          )}

          {/* ── Content ── */}
          {!loading && mode === "report" && (
            <Tabs defaultValue="directory" className="w-full">
              <TabsList className="bg-accent/40 no-print">
                <TabsTrigger value="directory" className="gap-2 data-[state=active]:bg-gold-gradient data-[state=active]:text-primary-foreground">
                  <LayoutGrid className="w-4 h-4" /> Creative Directory
                </TabsTrigger>
                <TabsTrigger value="top" className="gap-2 data-[state=active]:bg-gold-gradient data-[state=active]:text-primary-foreground">
                  <Trophy className="w-4 h-4" /> Top Performers
                </TabsTrigger>
              </TabsList>

              <TabsContent value="directory" className="mt-5 print-area">
                {visibleRows.length === 0 ? <EmptyState /> : (
                  <DirectoryTree
                    rows={visibleRows} visibleCols={columns}
                    hierarchy={hierarchy} creativeRowHeight={rowHeight}
                    onCreativeClick={openDetail}
                  />
                )}
              </TabsContent>

              <TabsContent value="top" className="mt-5">
                <div className="flex items-center gap-2 mb-4 no-print">
                  <span className="text-sm text-muted-foreground">Rank by:</span>
                  {(["ctr", "conversions", "cpc", "cpa"] as const).map(m => (
                    <button key={m} onClick={() => setRankMetric(m)}
                      className={`text-xs px-3 py-1.5 rounded-full border transition uppercase tracking-wider font-medium ${
                        rankMetric === m
                          ? "bg-gold-gradient text-primary-foreground border-transparent"
                          : "border-border hover:border-gold/50"
                      }`}
                    >{m}</button>
                  ))}
                </div>
                <TopPerformers rows={visibleRows} metric={rankMetric} />
              </TabsContent>
            </Tabs>
          )}

          {!loading && mode === "structure" && (
            <div className="print-area">
              {/* Structure loading skeleton */}
              {structureLoading && (
                <div className="space-y-3 animate-pulse">
                  {[...Array(4)].map((_, i) => (
                    <div key={i} className="glass rounded-xl h-28 opacity-50" />
                  ))}
                </div>
              )}
              {/* Structure error banner */}
              {structureError && !structureLoading && (
                <div className="flex items-center gap-3 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm">
                  <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                  <span className="text-red-300 flex-1">{structureError}</span>
                  <Button
                    size="sm" variant="outline"
                    className="border-red-500/30 text-red-300 hover:bg-red-500/10"
                    onClick={() => {
                      structureFetched.current = false;
                      setStructureError(null);
                      // re-trigger the useEffect by momentarily flipping mode
                      setMode("report");
                      setTimeout(() => setMode("structure"), 50);
                    }}
                  >
                    Retry
                  </Button>
                </div>
              )}
              {!structureLoading && !structureError && structureCreatives.length === 0 && <EmptyState />}
              {!structureLoading && !structureError && structureCreatives.length > 0 && (
                <DirectoryTree
                  rows={structureCreatives.map(c => ({
                    creative: c,
                    metrics: computeMetrics({ impressions: 0, clicks: 0, cost: 0, conversions: 0 }),
                  }))}
                  visibleCols={columns}
                  hierarchy={hierarchy}
                  structureOnly
                  creativeRowHeight={rowHeight}
                  onCreativeClick={openDetail}
                />
              )}
            </div>
          )}
        </main>
      </div>

      <ExportModal open={exportOpen} onClose={() => setExportOpen(false)} onPick={handleExportPDF} />

      <CreativeDetailModal
        creative={detailCreative}
        onClose={closeDetail}
        daily={dailyPerformanceShim}
        startDate={filters.startDate}
        endDate={filters.endDate}
        comparisonIds={visibleRows.map(r => r.creative.creative_id)}
        creativeById={creativeById}
        hierarchy={hierarchy}
        onNavigate={navigateDetail}
        canBack={detailCursor > 0}
        canForward={detailCursor >= 0 && detailCursor < detailHistory.length - 1}
        onBack={() => setDetailCursor(c => Math.max(0, c - 1))}
        onForward={() => setDetailCursor(c => Math.min(detailHistory.length - 1, c + 1))}
      />

      <Toaster />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components (unchanged from original)
// ─────────────────────────────────────────────────────────────────────────────

function KPI({ icon: Icon, label, value, accent }: {
  icon: React.ComponentType<{ className?: string }>;
  label: string; value: string; accent?: boolean;
}) {
  return (
    <div className={`glass rounded-xl p-4 flex items-center gap-3 ${accent ? "border-gold/30" : ""}`}>
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${accent ? "bg-gold-gradient text-primary-foreground" : "bg-accent text-gold"}`}>
        <Icon className="w-4 h-4" />
      </div>
      <div className="min-w-0">
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
        <button
          type="button"
          onClick={() => { void copyText(value); }}
          className="font-display font-bold text-lg leading-tight tabular-nums truncate cursor-copy text-left"
          title="Click to copy"
        >
          {value}
        </button>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="glass rounded-2xl py-20 px-6 text-center">
      <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-gold/10 flex items-center justify-center">
        <Sparkles className="w-6 h-6 text-gold" />
      </div>
      <h3 className="font-display font-semibold text-lg">No creatives found</h3>
      <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
        Try widening your date range, clearing filters, or selecting more campaigns in the sidebar.
      </p>
    </div>
  );
}

function RowHeightControl({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const presets = [64, 96, 160, 240, 400];
  return (
    <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-white/10 bg-white/[0.03]">
      <Maximize2 className="w-3.5 h-3.5 text-gold" />
      <span className="text-[10px] uppercase tracking-widest text-muted-foreground hidden sm:inline">Row</span>
      <input
        type="range" min={40} max={1500} step={8} value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="w-28 accent-[var(--gold)] cursor-pointer"
        aria-label="Creative row height"
      />
      <span className="text-[11px] tabular-nums text-foreground w-12 text-right">{value}px</span>
      <div className="hidden md:flex items-center gap-1 ml-1 border-l border-white/10 pl-2">
        {presets.map(p => (
          <button key={p} onClick={() => onChange(p)}
            className={cn(
              "text-[10px] px-1.5 py-0.5 rounded border transition",
              value === p
                ? "border-gold/40 bg-gold/15 text-gold"
                : "border-white/10 text-muted-foreground hover:text-foreground hover:bg-white/[0.06]",
            )}
          >{p}</button>
        ))}
      </div>
    </div>
  );
}
