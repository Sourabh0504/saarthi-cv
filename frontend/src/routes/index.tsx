import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useMemo, useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import {
  Gem, Sparkles, Moon, Sun, LayoutGrid, Trophy,
  IndianRupee, MousePointerClick, Eye, Coins, PanelLeftClose,
  PanelLeftOpen, RefreshCw, AlertTriangle,
  Loader2, FileDown, Percent, Palette, SlidersHorizontal, ChevronDown,
} from "lucide-react";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

// ── API ───────────────────────────────────────────────────────────────────────
import {
  fetchRawPerformance, fetchCurrentStructure, syncCache,
  type Creative, type FilterOptions, type RawDailyRow, type CreativeDimensionMap,
} from "@/lib/api";
import { idbClear } from "@/lib/idb";
import { exportDashboardPdf, type PdfTableRow } from "@/lib/exportPdf";

// ── Lib ───────────────────────────────────────────────────────────────────────
import { aggregateByDateRange, deriveFilterOptions as deriveFO, sortDailyRows } from "@/lib/aggregator";
import { computeMetrics, fmtINR, fmtINR0, fmtNum, fmtPct, type ComputedMetrics } from "@/lib/metrics";
import { GroupingSidebar, type SidebarMode } from "@/components/GroupingSidebar";
import { type Dim, DEFAULT_HIERARCHY, DIM_META } from "@/lib/hierarchy";
import { DirectoryTree } from "@/components/DirectoryTree";
import { TopPerformers } from "@/components/TopPerformers";
import { FilterPanel, type Filters } from "@/components/FilterPanel";
import { ExportModal, type ExportPick } from "@/components/ExportModal";
import { SavedViewsMenu } from "@/components/SavedViewsMenu";
import { CreativeDetailModal } from "@/components/CreativeDetailModal";
import { readSharedViewFromHash, clearShareHash } from "@/lib/savedViews";
// Tabs replaced with custom switcher for full style control
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { cn, copyText } from "@/lib/utils";

// ── Types (re-export so rest of app can import Creative from here) ─────────────
export type { Creative };

export const Route = createFileRoute("/")(({
  head: () => ({
    meta: [
      { title: "CreativeVisibility — Aukera Jewellery Campaign Portal" },
      { name: "description", content: "Real-time visual creative directory and performance reporting for high-budget jewelry Google Ads campaigns." },
    ],
    links: [
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "" },
      { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&family=Montserrat:wght@500;600;700;800&display=swap" },
    ],
  }),
  component: Portal,
}));

const DEFAULT_COLS = {
  impressions: true, clicks: true, cost: true, conversions: false,
  ctr: true, cpc: true, cpm: false, cr: false, cpa: false,
  share_pct: false,
};

const COL_LABELS: Record<string, string> = {
  impressions: "Impressions",
  clicks: "Clicks",
  cost: "Spend",
  conversions: "Conversions",
  ctr: "CTR",
  cpc: "CPC",
  cpm: "CPM",
  cr: "CR",
  cpa: "CPA",
  share_pct: "% Share",
};

// ─────────────────────────────────────────────────────────────────────────────
// Build flat PDF table rows from the current hierarchy (for exportDashboardPdf)
// ─────────────────────────────────────────────────────────────────────────────
interface ThresholdPdfConfig {
  enabled:        boolean;
  metric:         "impressions" | "cost";
  value:          number;
  minVisible:     number;
  expandedNMore:  Set<string>;
}

function buildPdfTableRows(
  rows:      Array<{ creative: Creative; metrics: ComputedMetrics }>,
  hierarchy: Dim[],
  totals:    ComputedMetrics,
  includeCreatives: boolean,
  threshold?: ThresholdPdfConfig,
): PdfTableRow[] {
  const result: PdfTableRow[] = [{ kind: "total", count: rows.length, metrics: totals }];

  const getYtId = (url: string) => url.match(/(?:youtu\.be\/|v=|embed\/)([\w-]{11})/)?.[1] ?? null;

  const recurse = (items: typeof rows, dims: Dim[], depth: number, groupKey: string) => {
    if (dims.length === 0 || items.length === 0) {
      if (!includeCreatives) return;

      // Apply threshold if enabled
      if (threshold?.enabled && threshold.value > 0) {
        const getVal = (r: typeof rows[0]) =>
          threshold.metric === "impressions" ? r.metrics.impressions : r.metrics.cost;
        const effectiveMin = Math.min(threshold.minVisible, items.length);
        const above = items.filter(r => getVal(r) >= threshold.value);
        const below = [...items.filter(r => getVal(r) < threshold.value)]
                        .sort((a, b) => getVal(b) - getVal(a));

        let visibleSet: Set<string>;
        let hidden: typeof rows;
        if (above.length >= effectiveMin) {
          visibleSet = new Set(above.map(r => r.creative.creative_id));
          hidden = below;
        } else {
          const needMore = effectiveMin - above.length;
          visibleSet = new Set([...above, ...below.slice(0, needMore)].map(r => r.creative.creative_id));
          hidden = below.slice(needMore);
        }

        for (const item of items) {
          if (visibleSet.has(item.creative.creative_id)) {
            result.push({ kind: "creative", creative: item.creative, metrics: item.metrics, depth });
          }
        }

        if (hidden.length > 0) {
          const nMoreKey = `nmore:${groupKey}`;
          const isExpanded = threshold.expandedNMore.has(nMoreKey);
          if (isExpanded) {
            for (const item of hidden) {
              result.push({ kind: "creative", creative: item.creative, metrics: item.metrics, depth });
            }
          } else {
            const videoCount = hidden.filter(r => r.creative.creative_type === "Video").length;
            const imageCount = hidden.filter(r => r.creative.creative_type === "Image").length;
            const textCount  = hidden.filter(r => r.creative.creative_type === "Text").length;
            const hMetrics = computeMetrics(hidden.reduce(
              (acc, r) => ({ impressions: acc.impressions + r.metrics.impressions, clicks: acc.clicks + r.metrics.clicks, cost: acc.cost + r.metrics.cost, conversions: acc.conversions + r.metrics.conversions }),
              { impressions: 0, clicks: 0, cost: 0, conversions: 0 },
            ));
            const thumbUrls = hidden.slice(0, 4).map(r => {
              if (r.creative.creative_type === "Video") {
                const id = getYtId(r.creative.creative_url ?? "");
                return id ? `https://i.ytimg.com/vi/${id}/default.jpg` : "";
              }
              return r.creative.creative_url ?? "";
            }).filter(Boolean);
            result.push({ kind: "n-more", depth, hiddenCount: hidden.length, videoCount, imageCount, textCount, metrics: hMetrics, thumbnailUrls: thumbUrls });
          }
        }
        return;
      }

      // No threshold — all rows
      for (const item of items) {
        result.push({ kind: "creative", creative: item.creative, metrics: item.metrics, depth });
      }
      return;
    }

    const [dim, ...rest] = dims;

    // "creative" as an explicit dim — group items by creative_url so the same
    // creative used across cities/campaigns merges into one row in the PDF.
    if (dim === "creative") {
      const groups = new Map<string, typeof rows>();
      for (const item of items) {
        const key = item.creative.creative_url || item.creative.creative_id;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(item);
      }
      const sorted = [...groups.entries()].sort(
        ([, a], [, b]) =>
          b.reduce((s, r) => s + r.metrics.cost, 0) -
          a.reduce((s, r) => s + r.metrics.cost, 0),
      );
      for (const [key, group] of sorted) {
        const rep = group[0].creative;
        const gm = computeMetrics(
          group.reduce(
            (acc, r) => ({
              impressions: acc.impressions + r.metrics.impressions,
              clicks:      acc.clicks      + r.metrics.clicks,
              cost:        acc.cost        + r.metrics.cost,
              conversions: acc.conversions + r.metrics.conversions,
            }),
            { impressions: 0, clicks: 0, cost: 0, conversions: 0 },
          ),
        );
        result.push({ kind: "creative", creative: rep, metrics: gm, depth });
        if (rest.length > 0) {
          recurse(group, rest, depth + 1, `${groupKey}>creative:${key}`);
        }
      }
      return;
    }

    const getVal = DIM_META[dim].get;
    const groups = new Map<string, typeof rows>();
    for (const item of items) {
      const key = getVal(item.creative) || "—";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(item);
    }
    const sorted = [...groups.entries()].sort(
      ([, a], [, b]) =>
        b.reduce((s, r) => s + r.metrics.cost, 0) -
        a.reduce((s, r) => s + r.metrics.cost, 0),
    );
    for (const [label, group] of sorted) {
      const gm = computeMetrics(
        group.reduce(
          (acc, r) => ({
            impressions: acc.impressions + r.metrics.impressions,
            clicks:      acc.clicks      + r.metrics.clicks,
            cost:        acc.cost        + r.metrics.cost,
            conversions: acc.conversions + r.metrics.conversions,
          }),
          { impressions: 0, clicks: 0, cost: 0, conversions: 0 },
        ),
      );
      const childKey = `${groupKey}>${dim}:${label}`;
      result.push({ kind: "group", label, dimLabel: DIM_META[dim].label, depth, count: group.length, metrics: gm });
      recurse(group, rest, depth + 1, childKey);
    }
  };

  recurse(rows, hierarchy, 0, "root");
  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// Portal Component
// ─────────────────────────────────────────────────────────────────────────────
function Portal() {
  const { user, isLoggedIn, isLoading: authLoading, logout } = useAuth();
  const navigate = useNavigate();

  // ── Auth guard ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!authLoading && !isLoggedIn) {
      navigate({ to: "/login" });
    }
  }, [isLoggedIn, authLoading, navigate]);

  // Date range defaults to auto (sheet min/max). Inputs are set after first load.
  const startDef = "";
  const endDef   = "";

  // ── UI State ─────────────────────────────────────────────────────────────
  const [filters, setFilters] = useState<Filters>({
    startDate: startDef, endDate: endDef,
    compareMode: false,
    status: ["Enabled"], city: [], funnel: [],
    campaign_type: [], campaign_name: [],
    search: "",
  });
  const [hierarchy, setHierarchy] = useState<Dim[]>(DEFAULT_HIERARCHY);
  const [sidebarOpen, setSidebarOpen]   = useState(true);
  const [columns, setColumns]           = useState<Record<string, boolean>>(DEFAULT_COLS);
  const [theme, setTheme]               = useState<"dark" | "light">("dark");
  const [palette, setPalette]           = useState<"gold" | "indigo" | "mint" | "rose">("gold");
  const [exportOpen, setExportOpen]     = useState(false);
  const [rankMetric, setRankMetric]     = useState<"ctr" | "conversions" | "cpc" | "cpa">("ctr");
  const [mode, setMode]                 = useState<SidebarMode>("report");
  const [rowHeight, setRowHeight]       = useState<number>(150);
  const [sortBy, setSortBy]             = useState<string | null>(null);
  const [activeKey, setActiveKey]       = useState<string>("ALL");
  const [directoryLevel, setDirectoryLevel] = useState<number>(1);
  const [pdfLoading, setPdfLoading]     = useState(false);
  const [activeTab, setActiveTab]       = useState<"directory" | "top">("directory");
  const topPdfRef = useRef<(() => Promise<void>) | null>(null);
  const [topPdfLoading, setTopPdfLoading] = useState(false);
  const handleTopPdf = useCallback(async () => {
    if (!topPdfRef.current) return;
    setTopPdfLoading(true);
    try { await topPdfRef.current(); } finally { setTopPdfLoading(false); }
  }, []);

  // ── Threshold filter ──────────────────────────────────────────────────────
  const [thresholdEnabled,    setThresholdEnabled]    = useState(true);
  const [thresholdMetric,     setThresholdMetric]     = useState<"impressions" | "cost">("cost");
  const [thresholdValue,      setThresholdValue]      = useState(100);
  const [minVisiblePerGroup,  setMinVisiblePerGroup]  = useState(5);
  const [expandedNMore,       setExpandedNMore]       = useState<Set<string>>(new Set());

  // ── Raw data (loaded once, aggregated client-side) ────────────────────────────────
  const [rawDimensions, setRawDimensions] = useState<CreativeDimensionMap>({});
  const [rawDailyRows,  setRawDailyRows]  = useState<RawDailyRow[]>([]);
  const [filterOptions, setFilterOptions] = useState<FilterOptions>({
    cities: [], campaign_types: [], campaign_names: [], categories: [], age_groups: [], funnels: [], statuses: [],
  });
  const [availableRange, setAvailableRange] = useState<{ min: string; max: string } | null>(null);
  const [loading, setLoading]     = useState(true);
  const [loadingSecs, setLoadingSecs] = useState(0);
  const [splashVisible, setSplashVisible] = useState(true); // full-screen splash
  const [syncing, setSyncing]     = useState(false);
  const [error, setError]         = useState<string | null>(null);

  // ── creatives: date-range aggregation (client-side, instant) ──────────────────────
  // Recomputes in < 10ms whenever date range changes — no network call.
  const creatives = useMemo(
    () => aggregateByDateRange(rawDimensions, rawDailyRows, filters.startDate || undefined, filters.endDate || undefined),
    [rawDimensions, rawDailyRows, filters.startDate, filters.endDate],
  );

  // ── Current Structure State ─────────────────────────────────────
  const [structureCreatives, setStructureCreatives] = useState<Creative[]>([]);
  const [structureLoading, setStructureLoading]     = useState(false);
  const [structureError, setStructureError]         = useState<string | null>(null);
  const structureFetched = useRef(false); // fetch once per session

  // Auto-sets date pickers to sheet's actual date range on first load (once only)
  const datesInitialized = useRef(false);

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

  // ── Palette persistence ───────────────────────────────────────────────────
  useEffect(() => {
    const stored = localStorage.getItem("cv-palette") as "gold" | "indigo" | "mint" | "rose" | null;
    if (stored) setPalette(stored);
  }, []);
  useEffect(() => {
    document.documentElement.classList.remove("palette-indigo", "palette-mint", "palette-rose");
    if (palette !== "gold") document.documentElement.classList.add(`palette-${palette}`);
    localStorage.setItem("cv-palette", palette);
  }, [palette]);

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

  // ── Main data fetch (loads raw daily rows ONCE) ──────────────────────────────
  const loadRawData = useCallback(async (quiet = false) => {
    const startTime = Date.now();
    if (!quiet) { setLoading(true); setLoadingSecs(0); }
    setError(null);

    // ── IndexedDB stale-while-revalidate ─────────────────────────────────────
    // On revisit: IDB entry is served instantly (<5ms) while we re-validate
    // with If-None-Match. If backend returns 304, we're done immediately.
    // On first visit: IDB is empty, we wait for the full network response.
    // fetchRawPerformance() handles all IDB read/write and ETag logic internally.
    //
    // Unlike localStorage:
    //   • No synchronous JSON.parse blocking the main thread
    //   • No 5MB quota limit (handles large Daily_dump exports)
    //   • Atomic transactions — no torn reads from partial writes
    try {
      const data = await fetchRawPerformance();

      // Sort daily_rows by date ONCE so aggregateByDateRange() can binary-search.
      const sortedRows = sortDailyRows(data.daily_rows ?? []);

      setRawDimensions(data.dimensions);
      setRawDailyRows(sortedRows);
      setFilterOptions(deriveFO(data.dimensions));

      const ar = data.available_date_range;
      if (ar?.min && ar?.max) {
        setAvailableRange({ min: ar.min, max: ar.max });
        if (!datesInitialized.current) {
          datesInitialized.current = true;
          setFilters(prev => ({ ...prev, startDate: ar.min, endDate: ar.max }));
        }
      }

      setSelected(prev => {
        if (prev.size > 0) return prev;
        return new Set(Object.keys(data.dimensions));
      });

      if (!quiet && data.served_from_cache) {
        toast.info("Served from cache", { description: "Data is up to 30 min old. Hit sync to refresh." });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      setError(msg);
      if (!quiet) toast.error("Failed to load data", { description: msg });
    } finally {
      setLoading(false);
      // Keep splash visible for a minimum of 5 seconds from load start
      const elapsed = Date.now() - startTime;
      const delay = Math.max(300, 5_000 - elapsed);
      setTimeout(() => setSplashVisible(false), delay);
    }
  }, []);

  // ── Splash elapsed timer (counts while splash is on screen, not just while loading) ─
  useEffect(() => {
    if (!splashVisible) { setLoadingSecs(0); return; }
    const id = setInterval(() => setLoadingSecs(s => s + 1), 1000);
    return () => clearInterval(id);
  }, [splashVisible]);

  // Fetch raw data on mount (only once per session)
  useEffect(() => { loadRawData(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Force sync ────────────────────────────────────────────────────────────
  const handleSync = async () => {
    setSyncing(true);
    structureFetched.current = false;
    setStructureCreatives([]);
    try {
      await syncCache();
      // Clear IDB so the next fetchRawPerformance() does a full re-fetch
      await idbClear();
      await loadRawData();
      toast.success("Synced", { description: "All caches cleared and refreshed." });
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

  // ── Filtered creatives (status / city / funnel / search — all client-side) ─────────
  const filteredCreatives = useMemo(() => {
    return creatives.filter(c => {
      if (filters.status.length        > 0 && !filters.status.includes(c.status))               return false;
      if (filters.city.length          > 0 && !filters.city.includes(c.city))                   return false;
      if (filters.funnel.length        > 0 && !filters.funnel.includes(c.funnel))               return false;
      if (filters.campaign_type.length > 0 && !filters.campaign_type.includes(c.campaign_type)) return false;
      if (filters.campaign_name.length > 0 && !filters.campaign_name.includes(c.campaign_name)) return false;
      if (filters.search) {
        const q = filters.search.toLowerCase();
        const hay = [c.campaign_name, c.ad_group, c.city, c.category, c.headline, c.description]
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

  // ── Compare period: per-creative map + grand totals ──────────────────────
  const compareData = useMemo(() => {
    if (!filters.compareMode || !filters.startDate || !filters.endDate) return null;
    const n      = Math.round((new Date(filters.endDate).getTime() - new Date(filters.startDate).getTime()) / 86_400_000) + 1;
    const cEndMs = new Date(filters.startDate).getTime() - 86_400_000;
    const cEnd   = new Date(cEndMs).toISOString().slice(0, 10);
    const cStart = new Date(cEndMs - (n - 1) * 86_400_000).toISOString().slice(0, 10);

    const cCreatives = aggregateByDateRange(rawDimensions, rawDailyRows, cStart, cEnd)
      .filter(c => {
        if (filters.status.length > 0 && !filters.status.includes(c.status)) return false;
        if (filters.city.length   > 0 && !filters.city.includes(c.city))     return false;
        if (filters.funnel.length > 0 && !filters.funnel.includes(c.funnel)) return false;
        return true;
      });
    if (cCreatives.length === 0) return null;

    const map = new Map<string, ComputedMetrics>();
    const t   = { impressions: 0, clicks: 0, cost: 0, conversions: 0 };
    for (const c of cCreatives) {
      const m = computeMetrics({ impressions: c.impressions, clicks: c.clicks, cost: c.cost, conversions: c.conversions });
      map.set(c.creative_id, m);
      t.impressions += c.impressions;
      t.clicks      += c.clicks;
      t.cost        += c.cost;
      t.conversions += c.conversions;
    }
    return { map, totals: computeMetrics(t) };
  }, [filters.compareMode, filters.startDate, filters.endDate, rawDimensions, rawDailyRows, filters.status, filters.city, filters.funnel]);

  const compareTotals     = compareData?.totals ?? null;
  const compareMetricsMap = compareData?.map    ?? null;

  const pctDelta = (current: number, prev: number | null | undefined): number | null => {
    if (!prev || prev === 0) return null;
    return ((current - prev) / Math.abs(prev)) * 100;
  };

  // ── "No data for selected date range" flag ────────────────────────────────
  // True when raw data is loaded but the selected window returns zero creatives
  const dataLoaded     = !loading && rawDailyRows.length > 0;
  const noDataForRange = dataLoaded && creatives.length === 0 && !!(filters.startDate || filters.endDate);

  // ── Compare-period validation warning ────────────────────────────────────
  type CmpWarning = { kind: "no_data" | "partial"; cStart: string; cEnd: string; dataMin?: string };
  const compareWarning = useMemo((): CmpWarning | null => {
    if (!filters.compareMode || !filters.startDate || !filters.endDate || loading) return null;
    const n      = Math.round((new Date(filters.endDate).getTime() - new Date(filters.startDate).getTime()) / 86_400_000) + 1;
    const cEndMs = new Date(filters.startDate).getTime() - 86_400_000;
    const cEnd   = new Date(cEndMs).toISOString().slice(0, 10);
    const cStart = new Date(cEndMs - (n - 1) * 86_400_000).toISOString().slice(0, 10);
    if (!compareData)                                         return { kind: "no_data", cStart, cEnd };
    if (availableRange && cStart < availableRange.min)        return { kind: "partial", cStart, cEnd, dataMin: availableRange.min };
    return null;
  }, [filters.compareMode, filters.startDate, filters.endDate, compareData, availableRange, loading]);

  const hierarchyLabel = useMemo(
    () => hierarchy.map(d => DIM_META[d].label).join(" | "),
    [hierarchy],
  );
  const selectionLabel = useMemo(() => {
    if (activeKey === "ALL")   return "All creatives";
    if (activeKey === "MULTI") return `${selected.size} creatives selected`;
    return activeKey.split("::").join(" | ");
  }, [activeKey, selected.size]);
  const columnLabels = useMemo(
    () => Object.entries(columns).filter(([, v]) => v).map(([k]) => COL_LABELS[k] ?? k),
    [columns],
  );
  const sortLabel = useMemo(
    () => (sortBy ? (COL_LABELS[sortBy] ?? sortBy) : "Default (A-Z)"),
    [sortBy],
  );
  const dateRangeLabel = filters.startDate && filters.endDate
    ? `${filters.startDate} to ${filters.endDate}`
    : "All dates";
  const exportContext = useMemo(() => ({
    modeLabel: mode === "structure" ? "Structure" : "Report",
    dateRange: dateRangeLabel,
    filters: {
      status: filters.status,
      city: filters.city,
      funnel: filters.funnel,
      search: filters.search,
    },
    selectionLabel,
    selectedCount: selected.size,
    totalCount: creatives.length,
    columnsLabel: columnLabels.length ? columnLabels.join(", ") : "None",
    columnKeys: Object.entries(columns).filter(([, v]) => v).map(([k]) => k),
    rowHeight,
  }), [
    mode,
    dateRangeLabel,
    filters.status,
    filters.city,
    filters.funnel,
    filters.search,
    selectionLabel,
    selected.size,
    creatives.length,
    columnLabels,
    columns,
    rowHeight,
  ]);

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

  const handleExportPDF = async ({ theme, scope, rowHeight: rowHeightOverride }: ExportPick) => {
    setExportOpen(false);
    setPdfLoading(true);

    // Build the rows to export — either current selection or all creatives
    const exportRows = scope === "all"
      ? creatives.map(c => ({
          creative: c,
          metrics: aggregated.get(c.creative_id)
            ?? computeMetrics({ impressions: 0, clicks: 0, cost: 0, conversions: 0 }),
        }))
      : visibleRows;

    const exportTotals = scope === "all"
      ? computeMetrics(creatives.reduce(
          (acc, c) => ({
            impressions: acc.impressions + (c.impressions ?? 0),
            clicks:      acc.clicks      + (c.clicks      ?? 0),
            cost:        acc.cost        + (c.cost        ?? 0),
            conversions: acc.conversions + (c.conversions ?? 0),
          }),
          { impressions: 0, clicks: 0, cost: 0, conversions: 0 },
        ))
      : totals;

    const filterBits: string[] = [
      filters.status.length ? `Status: ${filters.status.join(", ")}` : "Status: All",
      filters.city.length   ? `City: ${filters.city.join(", ")}`     : "City: All",
      filters.funnel.length ? `Funnel: ${filters.funnel.join(", ")}` : "Funnel: All",
      ...(filters.search ? [`Search: "${filters.search}"`] : []),
    ];

    const enabledCols = Object.entries(columns).filter(([, v]) => v).map(([k]) => k);

    const includeCreatives = directoryLevel >= hierarchy.length;
    const exportHierarchy = includeCreatives
      ? hierarchy
      : hierarchy.slice(0, Math.min(directoryLevel + 1, hierarchy.length));
    const tableRows = buildPdfTableRows(exportRows, exportHierarchy, exportTotals, includeCreatives, {
      enabled:       thresholdEnabled,
      metric:        thresholdMetric,
      value:         thresholdValue,
      minVisible:    minVisiblePerGroup,
      expandedNMore,
    });

    try {
      await exportDashboardPdf({
        tableRows,
        enabledColumns:  enabledCols,
        hierarchyLabels: exportHierarchy.map(d => DIM_META[d].label),
        context: {
          dateRange:      dateRangeLabel,
          selectionLabel: scope === "all" ? "All creatives" : selectionLabel,
          selectedCount:  exportRows.length,
          totalCount:     creatives.length,
          filterBits,
          columnsLabel:   columnLabels.length ? columnLabels.join(", ") : "None",
        },
        rowHeightPx: rowHeightOverride ?? rowHeight,
        theme,
      });
      toast.success("PDF exported", { description: `${exportRows.length} creatives · ${theme} theme` });
    } catch (err) {
      toast.error("PDF export failed", { description: err instanceof Error ? err.message : "Unknown error" });
    } finally {
      setPdfLoading(false);
    }
  };

  const handleActiveChange = (key: string, ids: string[]) => {
    setActiveKey(key);
    setSelected(new Set(ids));
  };

  // ── Cities from API (dynamic — never hardcoded) ───────────────────────────
  const cities = filterOptions.cities;

  // rawDailyRows is passed directly to CreativeDetailModal.
  // No shim needed — all daily rows are already in memory from /api/raw-performance.

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────
  if (authLoading || !isLoggedIn) return null;

  return (
    <div id="print-root" className="min-h-screen flex flex-col relative" data-print-theme="light">
      <div className="aurora-bg no-print"  aria-hidden />
      <div className="aurora-grid no-print" aria-hidden />

      {/* ── Fullscreen Splash Loader ── */}
      <SplashLoader visible={splashVisible} secs={loadingSecs} />

      {/* ── Header ── */}
      <header className="app-header border-b border-white/10 sticky top-0 z-30 no-print bg-background/95 backdrop-blur-xl shadow-[0_4px_20px_-8px_rgba(0,0,0,0.6)]">
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
            <div className="w-9 h-9 rounded-lg bg-gold-gradient flex items-center justify-center">
              <Gem className="w-5 h-5 text-primary-foreground" />
            </div>
            <div>
              <div className="font-display font-bold tracking-tight leading-none">CreativeVisibility</div>
              <div className="text-[10px] text-muted-foreground uppercase tracking-widest">Aukera Jewellery · Performance Portal</div>
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

            {/* Palette switcher */}
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="ghost" size="icon"
                  className="h-8 w-8 border-transparent hover:bg-white/10"
                  aria-label="Switch colour palette"
                  title="Switch colour palette"
                >
                  <Palette className="w-4 h-4" />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-auto p-3">
                <p className="text-[10px] text-muted-foreground mb-2.5 uppercase tracking-wider font-medium">Palette</p>
                <div className="flex items-center gap-3">
                  {(["gold", "indigo", "mint", "rose"] as const).map((p) => {
                    const swatchColor: Record<string, string> = {
                      gold:   "oklch(0.77 0.12 85)",
                      indigo: "oklch(0.70 0.18 270)",
                      mint:   "oklch(0.72 0.14 175)",
                      rose:   "oklch(0.70 0.16 10)",
                    };
                    return (
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
                              : "opacity-60 group-hover:opacity-100"
                          )}
                          style={{ background: swatchColor[p] }}
                        />
                        <span className={cn(
                          "text-[10px] capitalize",
                          palette === p ? "text-foreground" : "text-muted-foreground"
                        )}>
                          {p}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </PopoverContent>
            </Popover>

            <Button
              variant="outline" size="icon"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              aria-label="Toggle theme"
            >
              {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </Button>

            {/* Profile avatar */}
            <Link to="/profile" title={`Signed in as ${user?.email}`}>
              <div
                className="w-8 h-8 rounded-full p-0.5 cursor-pointer hover:scale-105 transition-transform"
                style={{ background: "linear-gradient(135deg, oklch(0.78 0.15 85) 0%, oklch(0.65 0.18 70) 100%)" }}
              >
                {user?.picture ? (
                  <img
                    src={user.picture}
                    alt={user.name || user.email}
                    className="w-full h-full rounded-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="w-full h-full rounded-full bg-[oklch(0.20_0.008_260)] flex items-center justify-center">
                    <span className="text-[10px] font-bold" style={{ color: "oklch(0.78 0.15 85)" }}>
                      {(user?.name || user?.email || "U").charAt(0).toUpperCase()}
                    </span>
                  </div>
                )}
              </div>
            </Link>
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
              rowHeight={rowHeight}
              setRowHeight={setRowHeight}
            />
          </div>
        </aside>

        {/* ── Main ── */}
        <main className="flex-1 min-w-0 p-6 space-y-5">

          {/* ── Error banner ── */}
          {error && !loading && (
            <div className="flex items-center gap-3 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm">
              <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
              <span className="text-red-300 flex-1">{error}</span>
              <Button
                size="sm" variant="outline"
                className="border-red-500/30 text-red-300 hover:bg-red-500/10"
                onClick={() => loadRawData()}
              >
                Retry
              </Button>
            </div>
          )}

          {/* ── Sticky filter bar (KPIs scroll naturally below) ── */}
          <div className="sticky top-[60px] z-20 -mx-6 px-6 pt-2 pb-3 backdrop-blur-2xl bg-background/95 border-b border-white/10 shadow-[0_8px_24px_-12px_rgba(0,0,0,0.6)] no-print">
            <FilterPanel
              filters={filters}
              setFilters={setFiltersSafe}
              minDate={availableRange?.min}
              maxDate={availableRange?.max}
              cities={cities}
              campaignTypes={filterOptions.campaign_types}
              campaignNames={filterOptions.campaign_names}
              columns={columns}
              setColumns={setColumns}
              onExportPDF={() => setExportOpen(true)}
              pdfLoading={pdfLoading}
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
          </div>

          {/* ── Non-sticky compare warning + KPI strip ── */}
          <div className="space-y-3 no-print">
            {compareWarning && (
              <div className="flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2.5">
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <div className="space-y-0.5">
                  {compareWarning.kind === "no_data" ? (
                    <>
                      <p className="text-sm font-medium text-amber-300">No comparison data available</p>
                      <p className="text-xs text-amber-300/80">
                        No data was found for the comparison period ({fmtD(compareWarning.cStart)} – {fmtD(compareWarning.cEnd)}).
                        Comparison deltas will not be shown. Try selecting a more recent date range.
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="text-sm font-medium text-amber-300">Comparison data is incomplete</p>
                      <p className="text-xs text-amber-300/80">
                        The comparison period ({fmtD(compareWarning.cStart)} – {fmtD(compareWarning.cEnd)}) starts before
                        the oldest available data ({fmtD(compareWarning.dataMin!)}). Figures may be understated — comparison results will not be accurate.
                      </p>
                    </>
                  )}
                </div>
              </div>
            )}

            {mode === "report" && (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2">
                <KPI icon={Eye}               label="Impressions"  value={fmtNum(totals.impressions)}  delta={pctDelta(totals.impressions, compareTotals?.impressions)} />
                <KPI icon={MousePointerClick} label="Clicks"       value={fmtNum(totals.clicks)}       delta={pctDelta(totals.clicks,      compareTotals?.clicks)} />
                <KPI icon={Sparkles}          label="CTR"          value={fmtPct(totals.ctr)}          delta={pctDelta(totals.ctr,         compareTotals?.ctr)} />
                <KPI icon={IndianRupee}       label="Spend"        value={fmtINR0(totals.cost)} accent delta={pctDelta(totals.cost,        compareTotals?.cost)} />
                <KPI icon={Coins}             label="CPC"          value={fmtINR(totals.cpc)}          delta={pctDelta(totals.cpc,         compareTotals?.cpc)} />
              </div>
            )}
          </div>


          {/* ── Loading skeleton with progress bar ── */}
          {loading && (
            <div className="space-y-4">
              <LoadingProgress secs={loadingSecs} />
              <div className="space-y-3 animate-pulse">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="glass rounded-xl h-28 opacity-50" />
                ))}
              </div>
            </div>
          )}

          {/* ── Content ── */}
          {!loading && mode === "report" && (
            <div className="w-full space-y-5">
              {/* ── Tab switcher + contextual controls (single row) ── */}
              <div className="no-print flex items-center gap-2 flex-wrap">
                {/* Tab pills */}
                <div className="flex items-center gap-1 p-1 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                  {([
                    { id: "directory", icon: LayoutGrid, label: "Creative Directory" },
                    { id: "top",       icon: Trophy,     label: "Top Performers"    },
                  ] as const).map(({ id, icon: Icon, label }) => {
                    const active = activeTab === id;
                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => setActiveTab(id)}
                        className={cn(
                          "flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium transition-all duration-200 cursor-pointer",
                          active
                            ? "bg-gold-gradient text-[#2a1800] font-semibold shadow-[0_2px_20px_rgba(212,175,55,0.35)]"
                            : "text-muted-foreground hover:text-foreground hover:bg-white/[0.05]",
                        )}
                      >
                        <Icon className="w-4 h-4 shrink-0" />
                        {label}
                      </button>
                    );
                  })}
                </div>

                {/* Rank-by pills — only visible when Top Performers tab is active */}
                {activeTab === "top" && (
                  <>
                    <span className="text-xs text-muted-foreground pl-1">Rank by:</span>
                    {(["ctr", "conversions", "cpc", "cpa"] as const).map(m => (
                      <button
                        key={m}
                        onClick={() => setRankMetric(m)}
                        className={cn(
                          "text-xs px-3 py-1.5 rounded-full border transition uppercase tracking-wider font-medium",
                          rankMetric === m
                            ? "bg-gold-gradient text-[#2a1800] border-transparent"
                            : "border-border hover:border-gold/50",
                        )}
                      >{m}</button>
                    ))}
                  </>
                )}

                {/* ── Download PDF — right end of tab row for Top Performers ── */}
                {activeTab === "top" && (
                  <div className="ml-auto">
                    <button
                      type="button"
                      onClick={handleTopPdf}
                      disabled={topPdfLoading}
                      className="flex items-center gap-2 h-9 px-4 rounded-xl text-sm font-semibold
                                 bg-gold/10 border border-gold/30 text-gold
                                 hover:bg-gold/20 hover:border-gold/60 active:scale-95
                                 transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                      title="Download Top Performers as PDF"
                    >
                      {topPdfLoading
                        ? <Loader2 className="w-4 h-4 animate-spin" />
                        : <FileDown className="w-4 h-4" />}
                      {topPdfLoading ? "Generating PDF…" : "Download PDF"}
                    </button>
                  </div>
                )}

                {/* ── Threshold — right end of the tab row ── */}
                {activeTab === "directory" && (
                  <div className="ml-auto">
                    <Popover>
                      <PopoverTrigger asChild>
                        <button
                          type="button"
                          className={cn(
                            "flex items-center gap-1.5 h-9 pl-3 pr-2 rounded-lg border text-[11px] font-medium transition-all shrink-0 cursor-pointer",
                            thresholdEnabled
                              ? "border-gold/40 bg-gold/[0.08] text-gold hover:bg-gold/[0.12]"
                              : "border-white/10 bg-white/[0.03] text-muted-foreground hover:text-foreground hover:border-white/20"
                          )}
                        >
                          <SlidersHorizontal className="w-3.5 h-3.5 shrink-0" />
                          <span>Threshold</span>
                          {thresholdEnabled && (
                            <span className="ml-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-gold/20 text-gold tabular-nums whitespace-nowrap">
                              {thresholdMetric === "cost" ? "Spend" : "Impr."} &lt; {thresholdValue} · min {minVisiblePerGroup}
                            </span>
                          )}
                        </button>
                      </PopoverTrigger>

                      <PopoverContent align="end" className="w-72 p-0 overflow-hidden">
                        {/* Header */}
                        <div className="px-4 pt-4 pb-3 flex items-center justify-between gap-4">
                          <div>
                            <p className="text-sm font-semibold text-foreground">Threshold filter</p>
                            <p className="text-[11px] text-muted-foreground mt-0.5 whitespace-nowrap">
                              Hide low-data creatives per group
                            </p>
                          </div>
                          <Switch
                            checked={thresholdEnabled}
                            onCheckedChange={setThresholdEnabled}
                            className="shrink-0"
                          />
                        </div>

                        <div className="h-px bg-white/[0.06]" />

                        {/* Controls */}
                        <div className={cn(
                          "px-4 py-3 space-y-3 transition-opacity",
                          !thresholdEnabled && "opacity-40 pointer-events-none select-none"
                        )}>
                          {/* Metric */}
                          <div className="flex items-center justify-between gap-3">
                            <label className="text-[11px] text-muted-foreground shrink-0">Metric</label>
                            <Select
                              value={thresholdMetric}
                              onValueChange={v => setThresholdMetric(v as "impressions" | "cost")}
                            >
                              <SelectTrigger className="h-8 text-xs w-36">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="impressions">Impressions</SelectItem>
                                <SelectItem value="cost">Spend</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          {/* Hide if < */}
                          <div className="flex items-center justify-between gap-3">
                            <label className="text-[11px] text-muted-foreground shrink-0">Hide if &lt;</label>
                            <input
                              type="number"
                              min={0}
                              value={thresholdValue}
                              onChange={e => setThresholdValue(Math.max(0, parseInt(e.target.value) || 0))}
                              className="w-36 h-8 text-xs bg-white/[0.05] border border-white/10 rounded-md px-3 text-right tabular-nums text-foreground focus:outline-none focus:border-gold/40"
                            />
                          </div>
                          {/* Min per group */}
                          <div className="flex items-center justify-between gap-3">
                            <label className="text-[11px] text-muted-foreground shrink-0">Min per group</label>
                            <input
                              type="number"
                              min={1}
                              value={minVisiblePerGroup}
                              onChange={e => setMinVisiblePerGroup(Math.max(1, parseInt(e.target.value) || 1))}
                              className="w-36 h-8 text-xs bg-white/[0.05] border border-white/10 rounded-md px-3 text-right tabular-nums text-foreground focus:outline-none focus:border-gold/40"
                            />
                          </div>
                        </div>
                      </PopoverContent>
                    </Popover>
                  </div>
                )}
              </div>

              {/* ── Directory tab ── */}
              {activeTab === "directory" && (
                <div className="print-area">
                  {visibleRows.length === 0 ? (
                    noDataForRange
                      ? <NoDateRangeData start={filters.startDate} end={filters.endDate} available={availableRange} />
                      : <EmptyState />
                  ) : (
                    <DirectoryTree
                      rows={visibleRows} visibleCols={columns}
                      hierarchy={hierarchy} creativeRowHeight={rowHeight}
                      sortBy={sortBy}
                      onSortByChange={setSortBy}
                      activeLevel={directoryLevel}
                      onActiveLevelChange={setDirectoryLevel}
                      onCreativeClick={openDetail}
                      compareMode={filters.compareMode}
                      compareMetrics={compareMetricsMap ?? undefined}
                      compareTotals={compareTotals ?? undefined}
                      thresholdEnabled={thresholdEnabled}
                      thresholdMetric={thresholdMetric}
                      thresholdValue={thresholdValue}
                      minVisiblePerGroup={minVisiblePerGroup}
                      expandedNMore={expandedNMore}
                      onExpandedNMoreChange={setExpandedNMore}
                    />
                  )}
                </div>
              )}

              {/* ── Top Performers tab ── */}
              {activeTab === "top" && (
                <div>
                  <TopPerformers
                    rows={visibleRows}
                    metric={rankMetric}
                    rowHeight={rowHeight}
                    dateRange={dateRangeLabel}
                    onCreativeClick={openDetail}
                    exportRef={topPdfRef}
                  />
                </div>
              )}
            </div>
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
                  sortBy={sortBy}
                  onSortByChange={setSortBy}
                  onCreativeClick={openDetail}
                />
              )}
            </div>
          )}
        </main>
      </div>

      <ExportModal
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        onPick={handleExportPDF}
        context={exportContext}
        visibleRows={visibleRows}
        totals={totals}
        hierarchy={hierarchy}
        activeLevel={directoryLevel}
      />

      <CreativeDetailModal
        creative={detailCreative}
        onClose={closeDetail}
        daily={rawDailyRows}
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

function KPI({ icon: Icon, label, value, accent, delta }: {
  icon: React.ComponentType<{ className?: string }>;
  label: string; value: string; accent?: boolean;
  delta?: number | null;
}) {
  const hasDelta = delta !== null && delta !== undefined;
  return (
    <div className={`glass rounded-xl p-4 flex items-center gap-3 ${accent ? "border-gold/30" : ""}`}>
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${accent ? "bg-gold-gradient text-primary-foreground" : "bg-accent text-gold"}`}>
        <Icon className="w-4 h-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
        <button
          type="button"
          onClick={() => { void copyText(value); }}
          className="font-display font-bold text-lg leading-tight tabular-nums truncate cursor-copy text-left w-full"
          title="Click to copy"
        >
          {value}
        </button>
        {hasDelta && (
          <div className={cn(
            "text-[10px] text-right tabular-nums",
            delta! > 0 ? "text-emerald-400" : delta! < 0 ? "text-red-400" : "text-muted-foreground",
          )}>
            ({delta! > 0 ? "+" : ""}{delta!.toFixed(1)}%)
          </div>
        )}
      </div>
    </div>
  );
}

// Short date formatter for warning messages  e.g. "May 01, 2025"
function fmtD(iso: string) {
  if (!iso) return iso;
  const [y, m, d] = iso.split("-");
  const mn = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${mn[+m - 1]} ${d}, ${y}`;
}

function NoDateRangeData({
  start, end, available,
}: { start: string; end: string; available: { min: string; max: string } | null }) {
  return (
    <div className="glass rounded-2xl py-20 px-6 text-center">
      <div className="w-14 h-14 mx-auto mb-5 rounded-full bg-amber-500/10 flex items-center justify-center">
        <AlertTriangle className="w-7 h-7 text-amber-400" />
      </div>
      <h3 className="font-display font-semibold text-xl">No data for this date range</h3>
      <p className="text-sm text-muted-foreground mt-2 max-w-sm mx-auto">
        No creative performance data was found for{" "}
        <span className="font-semibold text-foreground">{fmtD(start)}</span>
        {" – "}
        <span className="font-semibold text-foreground">{fmtD(end)}</span>.
      </p>
      {available && (
        <p className="text-sm text-muted-foreground mt-3 max-w-sm mx-auto">
          Data is available from{" "}
          <span className="font-semibold text-gold">{fmtD(available.min)}</span>
          {" to "}
          <span className="font-semibold text-gold">{fmtD(available.max)}</span>.
          {" "}Please select a date range within this window.
        </p>
      )}
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


// ─────────────────────────────────────────────────────────────────────────────
// Loading progress indicator
// ─────────────────────────────────────────────────────────────────────────────
function LoadingProgress({ secs }: { secs: number }) {
  // Simulate progress: fast at first, slows toward 90% while waiting for network
  const pct = Math.min(90, secs < 5 ? secs * 12 : 60 + (secs - 5) * 1.5);
  const msg = secs === 0
    ? "Connecting to Google Ads data…"
    : secs < 5
    ? "Fetching creative performance data…"
    : secs < 15
    ? "Reading from Google Sheets… hang tight"
    : secs < 35
    ? "Aggregating campaign data — this takes ~30s on first load"
    : "Almost there… large dataset detected";

  return (
    <div className="glass rounded-xl px-5 py-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin text-gold shrink-0" />
          <span>{msg}</span>
        </div>
        <span className="text-xs tabular-nums text-muted-foreground">{secs}s</span>
      </div>
      <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
        <div
          className="h-full rounded-full bg-gold-gradient transition-all duration-1000 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>
      {secs >= 5 && (
        <p className="text-[11px] text-muted-foreground">
          💡 Subsequent loads will be instant — data is cached for 30 minutes.
        </p>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Fullscreen Splash Loader
// Always visible for a minimum of 5 seconds.
// ─────────────────────────────────────────────────────────────────────────────
const AUTHOR_NAME = "Sourabh Chaudhari";

function SplashLoader({ visible, secs }: { visible: boolean; secs: number }) {
  // Progress bar: reaches ~95% at 5s, creeps slowly after that
  const pct = Math.min(97, secs < 5 ? secs * 19 : 95 + (secs - 5) * 0.5);

  const msg = secs === 0
    ? "Initialising CreativeVisibility…"
    : secs < 2
    ? "Connecting to Google Ads data…"
    : secs < 4
    ? "Fetching campaign performance…"
    : secs < 5
    ? "Aggregating creative insights…"
    : secs < 14
    ? "Reading from Google Sheets…"
    : "Loading large dataset — almost there";

  // ── Typewriter for author name ───────────────────────────────────────────
  const [typed, setTyped] = useState("");
  const [cursorOn, setCursorOn] = useState(true);
  const isDone = typed.length >= AUTHOR_NAME.length;

  // Start typing 1.3s after splash appears; type one char every 75ms
  useEffect(() => {
    if (!visible) { setTyped(""); return; }
    const startDelay = setTimeout(() => {
      let i = 0;
      const tick = setInterval(() => {
        i += 1;
        setTyped(AUTHOR_NAME.slice(0, i));
        if (i >= AUTHOR_NAME.length) clearInterval(tick);
      }, 75);
      return () => clearInterval(tick);
    }, 1300);
    return () => clearTimeout(startDelay);
  }, [visible]);

  // Blink cursor — faster while typing, slower once done
  useEffect(() => {
    const interval = isDone ? 530 : 400;
    const id = setInterval(() => setCursorOn(v => !v), interval);
    return () => clearInterval(id);
  }, [isDone]);

  return (
    <div
      className={`splash-overlay no-print${visible ? "" : " fade-out"}`}
      aria-live="polite"
      aria-label="Loading CreativeVisibility"
      role="status"
    >
      {/* Background grid */}
      <div className="splash-grid" aria-hidden />

      {/* Content column */}
      <div className="relative z-10 flex flex-col items-center gap-8 px-6 w-full max-w-sm">

        {/* Logo with orbiting rings */}
        <div className="relative flex items-center justify-center w-28 h-28">
          {/* Outer orbit ring */}
          <div className="splash-orbit-1 absolute inset-0">
            <svg viewBox="0 0 112 112" className="w-full h-full" aria-hidden>
              <circle
                cx="56" cy="56" r="52"
                fill="none"
                stroke="oklch(0.78 0.15 85 / 0.18)"
                strokeWidth="1"
                strokeDasharray="6 10"
              />
              <circle cx="56" cy="4" r="3" fill="oklch(0.78 0.15 85 / 0.8)" />
            </svg>
          </div>
          {/* Inner orbit ring */}
          <div className="splash-orbit-2 absolute inset-4">
            <svg viewBox="0 0 80 80" className="w-full h-full" aria-hidden>
              <circle
                cx="40" cy="40" r="36"
                fill="none"
                stroke="oklch(0.78 0.15 85 / 0.12)"
                strokeWidth="1"
                strokeDasharray="3 8"
              />
              <circle cx="40" cy="4" r="2" fill="oklch(0.78 0.15 85 / 0.5)" />
            </svg>
          </div>
          {/* Gold pulsing core */}
          <div className="splash-logo-ring relative flex items-center justify-center w-16 h-16 rounded-full bg-gradient-to-br from-[oklch(0.78_0.15_85/0.15)] to-[oklch(0.78_0.15_85/0.05)] border border-[oklch(0.78_0.15_85/0.35)]">
            <Gem className="w-7 h-7 text-gold" />
          </div>
        </div>

        {/* Brand name */}
        <div className="text-center space-y-1.5">
          <h1 className="splash-title font-display font-bold text-2xl tracking-tight text-white">
            Creative<span className="text-gold">Visibility</span>
          </h1>
          <p className="splash-sub text-xs text-muted-foreground tracking-widest uppercase">
            Google Ads Creative Intelligence
          </p>
        </div>

        {/* Progress bar + status */}
        <div className="splash-bar-track w-full space-y-3">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-gold" />
              {msg}
            </span>
            <span className="tabular-nums">{secs}s</span>
          </div>
          {/* Bar track */}
          <div className="relative h-[3px] rounded-full bg-white/5 overflow-hidden">
            <div className="splash-shimmer absolute inset-0" aria-hidden />
            <div
              className="h-full rounded-full bg-gold-gradient transition-all duration-1000 ease-out"
              style={{ width: `${pct}%` }}
            />
          </div>
          {secs >= 6 && (
            <p className="text-[10px] text-muted-foreground text-center">
              ⚡ Subsequent loads are instant — data cached locally
            </p>
          )}
        </div>

        {/* Separator */}
        <div className="w-full border-t border-white/[0.07]" />

        {/* Developer branding */}
        <div className="splash-credits text-center space-y-2 -mt-4">
          <p className="text-[10px] text-muted-foreground uppercase tracking-[0.2em]">
            Designed &amp; Built by
          </p>

          {/* Typewriter name */}
          <p className="font-display font-bold text-xl tracking-wide leading-none">
            <span className="text-gold">{typed}</span>
            <span
              className="inline-block w-[2px] h-[1.1em] bg-gold align-middle ml-[2px]"
              style={{ opacity: cursorOn ? 1 : 0, transition: "opacity 0.08s" }}
              aria-hidden
            />
          </p>

          {/* Tagline — fades in once name is fully typed */}
          <p
            className="text-[11px] tracking-widest uppercase font-medium leading-relaxed"
            style={{
              color: "oklch(0.78 0.15 85 / 0.55)",
              opacity: isDone ? 1 : 0,
              transform: isDone ? "translateY(0)" : "translateY(4px)",
              transition: "opacity 0.6s ease, transform 0.6s ease",
            }}
          >
            Decoding Data, Driving Decisions.
            <br />
            Implementing AI, Empowering Innovation.
          </p>
        </div>
      </div>
    </div>
  );
}
