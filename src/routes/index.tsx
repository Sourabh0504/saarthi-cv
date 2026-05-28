import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState, useEffect } from "react";
import { Gem, Sparkles, Moon, Sun, LayoutGrid, Trophy, Database, IndianRupee, MousePointerClick, Eye, Target, PanelLeftClose, PanelLeftOpen, Network, Maximize2 } from "lucide-react";
import { creatives, dailyPerformance, cities, type Creative } from "@/data/mockData";
import { computeMetrics, fmtINR, fmtNum, fmtPct, type ComputedMetrics } from "@/lib/metrics";
import { GroupingSidebar, type SidebarMode } from "@/components/GroupingSidebar";
import { type Dim, DEFAULT_HIERARCHY } from "@/lib/hierarchy";
import { DirectoryTree } from "@/components/DirectoryTree";

import { TopPerformers } from "@/components/TopPerformers";
import { FilterPanel, type Filters } from "@/components/FilterPanel";
import { ExportModal } from "@/components/ExportModal";
import { SavedViewsMenu } from "@/components/SavedViewsMenu";
import { CreativeDetailModal } from "@/components/CreativeDetailModal";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
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
});

const DEFAULT_COLS = { impressions: true, clicks: true, cost: true, conversions: false, ctr: true, cpc: true, cpm: false, cr: false, cpa: true };

function Portal() {
  const today = new Date().toISOString().slice(0, 10);
  const start = new Date(); start.setDate(start.getDate() - 29);
  const [filters, setFilters] = useState<Filters>({
    startDate: start.toISOString().slice(0, 10),
    endDate: today,
    status: "All", city: "All", funnel: "All", search: "",
  });
  const [selected, setSelected] = useState<Set<string>>(() => new Set(creatives.map(c => c.creative_id)));
  const [activeKey, setActiveKey] = useState<string>("ALL");
  const [hierarchy, setHierarchy] = useState<Dim[]>(DEFAULT_HIERARCHY);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [columns, setColumns] = useState<Record<string, boolean>>(DEFAULT_COLS);
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [exportOpen, setExportOpen] = useState(false);
  const [rankMetric, setRankMetric] = useState<"ctr" | "conversions" | "cpc" | "cpa">("ctr");
  const [mode, setMode] = useState<SidebarMode>("report");
  const [mode, setMode] = useState<SidebarMode>("report");
  const [rowHeight, setRowHeight] = useState<number>(96);
  const [detailCreative, setDetailCreative] = useState<Creative | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem("cv-theme") as "dark" | "light" | null;
    if (stored) setTheme(stored);
  }, []);
  useEffect(() => {
    document.documentElement.classList.toggle("light", theme === "light");
    localStorage.setItem("cv-theme", theme);
  }, [theme]);

  // Filtered creatives (dimension-level filters)
  const filteredCreatives = useMemo(() => {
    return creatives.filter(c => {
      if (filters.status !== "All" && c.status !== filters.status) return false;
      if (filters.city !== "All" && c.city !== filters.city) return false;
      if (filters.funnel !== "All" && c.funnel !== filters.funnel) return false;
      if (filters.search) {
        const q = filters.search.toLowerCase();
        const hay = [c.campaign_name, c.city, c.category, c.headline, c.description].join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [filters]);

  // Aggregate per creative within date range
  const aggregated = useMemo(() => {
    const map = new Map<string, { impressions: number; clicks: number; cost: number; conversions: number }>();
    for (const row of dailyPerformance) {
      if (row.date < filters.startDate || row.date > filters.endDate) continue;
      const a = map.get(row.creative_id) ?? { impressions: 0, clicks: 0, cost: 0, conversions: 0 };
      a.impressions += row.impressions; a.clicks += row.clicks; a.cost += row.cost; a.conversions += row.conversions;
      map.set(row.creative_id, a);
    }
    const result = new Map<string, ComputedMetrics>();
    for (const [id, a] of map) result.set(id, computeMetrics(a));
    return result;
  }, [filters.startDate, filters.endDate]);

  const visibleRows = useMemo(() => {
    return filteredCreatives
      .filter(c => selected.has(c.creative_id))
      .map(c => ({
        creative: c,
        metrics: aggregated.get(c.creative_id) ?? computeMetrics({ impressions: 0, clicks: 0, cost: 0, conversions: 0 }),
      }));
  }, [filteredCreatives, selected, aggregated]);

  // Totals
  const totals = useMemo(() => {
    const t = { impressions: 0, clicks: 0, cost: 0, conversions: 0 };
    for (const r of visibleRows) { t.impressions += r.metrics.impressions; t.clicks += r.metrics.clicks; t.cost += r.metrics.cost; t.conversions += r.metrics.conversions; }
    return computeMetrics(t);
  }, [visibleRows]);

  const handleExportPDF = (printTheme: "light" | "dark") => {
    setExportOpen(false);
    const el = document.getElementById("print-root");
    if (el) el.setAttribute("data-print-theme", printTheme);
    setTimeout(() => window.print(), 100);
  };

  const handleExportCSV = () => {
    const headers = ["Creative ID","Headline","Campaign","Funnel","Type","City","Category","Age","Status","Impressions","Clicks","Cost","Conversions","CTR (%)","CPC (₹)","CPM (₹)","CR (%)","CPA (₹)"];
    const rows = visibleRows.map(r => [
      r.creative.creative_id, r.creative.headline ?? "", r.creative.campaign_name, r.creative.funnel, r.creative.creative_type,
      r.creative.city, r.creative.category, r.creative.age_group, r.creative.status,
      r.metrics.impressions, r.metrics.clicks, r.metrics.cost.toFixed(2), r.metrics.conversions.toFixed(2),
      r.metrics.ctr, r.metrics.cpc, r.metrics.cpm, r.metrics.cr, r.metrics.cpa,
    ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(","));
    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `creativevisibility_${filters.startDate}_${filters.endDate}.csv`;
    a.click(); URL.revokeObjectURL(url);
    toast.success(`Exported ${visibleRows.length} creatives to CSV`);
  };

  const handleActiveChange = (key: string, ids: string[]) => {
    setActiveKey(key);
    setSelected(new Set(ids));
  };

  return (
    <div id="print-root" className="min-h-screen flex flex-col relative" data-print-theme="light">
      {/* Rich background layers */}
      <div className="aurora-bg no-print" aria-hidden />
      <div className="aurora-grid no-print" aria-hidden />

      {/* Header */}
      <header className="app-header glass-strong border-b border-white/5 sticky top-0 z-30 no-print">
        <div className="flex items-center gap-4 px-6 py-3">
          <Button
            variant="ghost"
            size="icon"
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
            <div className="hidden md:flex items-center gap-1.5 text-xs text-muted-foreground px-3 py-1.5 rounded-full bg-white/[0.04] border border-white/10 backdrop-blur">
              <Sparkles className="w-3 h-3 text-gold" />
              {selected.size} of {creatives.length} creatives · {activeKey === "ALL" ? "All groups" : activeKey.split("::").pop()}
            </div>
            <Button variant="outline" size="icon" onClick={() => setTheme(theme === "dark" ? "light" : "dark")} aria-label="Toggle theme">
              {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </Button>
          </div>
        </div>
      </header>

      <div className="flex-1 flex">
        {/* Sidebar */}
        <aside
          className={cn(
            "shrink-0 no-print sticky top-[60px] transition-all duration-300 ease-out overflow-hidden",
            "max-h-[calc(100vh-60px)]",
            sidebarOpen ? "w-72" : "w-0"
          )}
        >
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

        {/* Main */}
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

          <FilterPanel filters={filters} setFilters={setFilters} cities={cities}
            columns={columns} setColumns={setColumns}
            onExportPDF={() => setExportOpen(true)} onExportCSV={handleExportCSV} />

          {mode === "report" && (
            <>
              {/* KPI summary */}
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                <KPI icon={Eye} label="Impressions" value={fmtNum(totals.impressions)} />
                <KPI icon={MousePointerClick} label="Clicks" value={fmtNum(totals.clicks)} />
                <KPI icon={IndianRupee} label="Spend" value={fmtINR(totals.cost)} accent />
                <KPI icon={Target} label="Conversions" value={totals.conversions.toFixed(0)} />
                <KPI icon={Sparkles} label="CTR" value={fmtPct(totals.ctr)} />
                <KPI icon={Database} label="CPA" value={fmtINR(totals.cpa)} />
              </div>

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
                  {visibleRows.length === 0 ? (
                    <EmptyState />
                  ) : (
                    <DirectoryTree rows={visibleRows} visibleCols={columns} hierarchy={hierarchy} creativeRowHeight={rowHeight} />
                  )}
                </TabsContent>

                <TabsContent value="top" className="mt-5">
                  <div className="flex items-center gap-2 mb-4 no-print">
                    <span className="text-sm text-muted-foreground">Rank by:</span>
                    {(["ctr", "conversions", "cpc", "cpa"] as const).map(m => (
                      <button key={m} onClick={() => setRankMetric(m)}
                        className={`text-xs px-3 py-1.5 rounded-full border transition uppercase tracking-wider font-medium ${
                          rankMetric === m ? "bg-gold-gradient text-primary-foreground border-transparent" : "border-border hover:border-gold/50"
                        }`}>{m}</button>
                    ))}
                  </div>
                  <TopPerformers rows={visibleRows} metric={rankMetric} />
                </TabsContent>
              </Tabs>
            </>
          )}

          {mode === "structure" && (
            <div className="print-area">
              {visibleRows.length === 0 ? (
                <EmptyState />
              ) : (
                <DirectoryTree rows={visibleRows} visibleCols={columns} hierarchy={hierarchy} structureOnly creativeRowHeight={rowHeight} />
              )}
            </div>
          )}
        </main>
      </div>

      <ExportModal open={exportOpen} onClose={() => setExportOpen(false)} onPick={handleExportPDF} />
      <Toaster />
    </div>
  );
}

function KPI({ icon: Icon, label, value, accent }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string; accent?: boolean }) {
  return (
    <div className={`glass rounded-xl p-4 flex items-center gap-3 ${accent ? "border-gold/30" : ""}`}>
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${accent ? "bg-gold-gradient text-primary-foreground" : "bg-accent text-gold"}`}>
        <Icon className="w-4 h-4" />
      </div>
      <div className="min-w-0">
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
        <div className="font-display font-bold text-lg leading-tight tabular-nums truncate">{value}</div>
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
        type="range"
        min={40}
        max={1500}
        step={8}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-28 accent-[var(--gold)] cursor-pointer"
        aria-label="Creative row height"
      />
      <span className="text-[11px] tabular-nums text-foreground w-12 text-right">{value}px</span>
      <div className="hidden md:flex items-center gap-1 ml-1 border-l border-white/10 pl-2">
        {presets.map(p => (
          <button
            key={p}
            onClick={() => onChange(p)}
            className={cn(
              "text-[10px] px-1.5 py-0.5 rounded border transition",
              value === p ? "border-gold/40 bg-gold/15 text-gold" : "border-white/10 text-muted-foreground hover:text-foreground hover:bg-white/[0.06]"
            )}
          >
            {p}
          </button>
        ))}
      </div>
    </div>
  );
}
