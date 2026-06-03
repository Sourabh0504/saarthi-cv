import { useEffect, useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid,
  ResponsiveContainer, Legend, ReferenceLine, ReferenceArea,
} from "recharts";
import type { Creative, DailyRow } from "@/lib/api";
import { computeMetrics, fmtINR, fmtINR0, fmtNum, fmtPct, getYouTubeId } from "@/lib/metrics";
import {
  TrendingUp, TrendingDown, Minus, ChevronLeft, ChevronRight,
  ArrowLeft, ArrowRight, ChevronRight as Chev, ExternalLink, Settings, FileDown, Loader2, Play,
} from "lucide-react";
import { DIM_META, type Dim } from "@/lib/hierarchy";
import { cn, copyText } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Check } from "lucide-react";
import { exportCreativePdf } from "@/lib/exportPdf";

const MODAL_METRIC_OPTS = [
  { key: "impressions", label: "Impressions" },
  { key: "clicks",      label: "Clicks"      },
  { key: "cost",        label: "Spend"       },
  { key: "ctr",         label: "CTR"         },
  { key: "cpc",         label: "CPC"         },
  { key: "cpm",         label: "CPM"         },
  { key: "conversions", label: "Conversions" },
  { key: "cr",          label: "CR"          },
] as const;

const DEFAULT_MODAL_METRICS: Record<string, boolean> = {
  impressions: true,
  clicks:      true,
  cost:        true,
  ctr:         true,
  cpc:         true,
  cpm:         true,
  conversions: false,
  cr:          false,
};

// ── Text label above the ReferenceArea band, right-aligned to its right edge ──
function BandLabel({
  viewBox,
  label,
  color,
}: {
  viewBox?: { x: number; y: number; width: number; height: number };
  label: string;
  color: string;
}) {
  if (!viewBox) return null;
  const { x, y, width } = viewBox;
  return (
    <text
      x={x + width - 2}
      y={y - 6}
      textAnchor="end"
      fill={color}
      fontSize={9}
      fontWeight="700"
      letterSpacing="0.08em"
      style={{ userSelect: "none" }}
    >
      {label}
    </text>
  );
}

// ── Period observation options ─────────────────────────────────────────────────
const PERIOD_OPTIONS = [
  { id: "3D",  days: 3,  label: "3D",  color: "#f43f5e" },
  { id: "7D",  days: 7,  label: "7D",  color: "#f59e0b" },
  { id: "14D", days: 14, label: "14D", color: "#10b981" },
  { id: "21D", days: 21, label: "21D", color: "#3b82f6" },
  { id: "28D", days: 28, label: "28D", color: "#8b5cf6" },
] as const;
type PeriodId = typeof PERIOD_OPTIONS[number]["id"];

interface Props {
  creative:       Creative | null;
  onClose:        () => void;
  daily:          DailyRow[];
  startDate:      string;
  endDate:        string;
  comparisonIds:  string[];
  creativeById:   Map<string, Creative>;
  hierarchy:      Dim[];
  onNavigate:     (creative: Creative) => void;
  canBack:        boolean;
  canForward:     boolean;
  onBack:         () => void;
  onForward:      () => void;
}

interface SeriesPoint {
  date:        string;
  ctr:         number;
  cpc:         number;
  cost:        number;
  impressions: number;
  clicks:      number;
  conversions: number;
  avgCtr:      number;
  avgCpc:      number;
}

function buildSeries(
  daily: DailyRow[],
  creativeId: string,
  comparisonIds: string[],
  start: string,
  end: string,
): SeriesPoint[] {
  const inRange = daily.filter(r => r.date >= start && r.date <= end);
  const dates   = Array.from(new Set(inRange.map(r => r.date))).sort();

  const own = new Map<string, DailyRow>();
  inRange.filter(r => r.creative_id === creativeId).forEach(r => own.set(r.date, r));

  const otherIds = new Set(comparisonIds.filter(id => id !== creativeId));
  const bench    = new Map<string, { ctr: number[]; cpc: number[] }>();

  for (const r of inRange) {
    if (!otherIds.has(r.creative_id) || r.impressions === 0) continue;
    const e = bench.get(r.date) ?? { ctr: [], cpc: [] };
    e.ctr.push((r.clicks / r.impressions) * 100);
    if (r.clicks > 0) e.cpc.push(r.cost / r.clicks);
    bench.set(r.date, e);
  }

  return dates.map(date => {
    const r  = own.get(date);
    const m  = computeMetrics({
      impressions: r?.impressions ?? 0,
      clicks:      r?.clicks      ?? 0,
      cost:        r?.cost        ?? 0,
      conversions: r?.conversions ?? 0,
    });
    const b      = bench.get(date);
    const avg    = <T,>(arr: T[], fn: (v: T) => number) =>
      arr.length ? +(arr.reduce((a, v) => a + fn(v), 0) / arr.length).toFixed(2) : 0;
    const avgCtr = b ? avg(b.ctr, x => x) : 0;
    const avgCpc = b ? avg(b.cpc, x => x) : 0;
    return {
      date: date.slice(5),
      ctr: m.ctr, cpc: m.cpc, cost: m.cost,
      impressions: m.impressions, clicks: m.clicks, conversions: m.conversions,
      avgCtr, avgCpc,
    };
  });
}

function Delta({ value, suffix, invert }: { value: number; suffix?: string; invert?: boolean }) {
  const positive = invert ? value < 0 : value > 0;
  const neutral  = Math.abs(value) < 0.5;
  const Icon     = neutral ? Minus : positive ? TrendingUp : TrendingDown;
  return (
    <span className={cn(
      "inline-flex items-center gap-1 text-xs font-medium",
      neutral ? "text-muted-foreground" : positive ? "text-emerald-accent" : "text-destructive",
    )}>
      <Icon className="w-3 h-3" />
      {value > 0 ? "+" : ""}{value.toFixed(1)}{suffix ?? "%"}
    </span>
  );
}

/** Clean display name for an ad — never exposes the raw creative_id slug. */
function adName(c: Creative): string {
  if (c.headline) return c.headline;
  if (c.creative_type === "Text") return "Text Ad";
  // For image/video ads: "Image · Mumbai · Bridal · AssetGroupName"
  const parts = [c.creative_type, c.city, c.category, c.ad_group].filter(Boolean);
  return parts.join(" · ");
}

export function CreativeDetailModal({
  creative, onClose, daily, startDate, endDate, comparisonIds, creativeById,
  hierarchy, onNavigate, canBack, canForward, onBack, onForward,
}: Props) {
  // ── Refs for PDF chart capture ────────────────────────────────────
  // ── Metric visibility state (declared before downloadPdf so closure captures it) ──
  const [modalMetrics, setModalMetrics] = useState<Record<string, boolean>>(DEFAULT_MODAL_METRICS);
  const toggleMetric = (key: string) =>
    setModalMetrics(prev => ({ ...prev, [key]: !prev[key] }));

  // Video playback states
  const [isPlaying, setIsPlaying] = useState(false);
  const [ytThumbUrl, setYtThumbUrl] = useState("");

  const modalYtId = creative?.creative_type === "Video" && creative.creative_url ? getYouTubeId(creative.creative_url) : null;

  useEffect(() => {
    setIsPlaying(false);
    if (modalYtId) {
      setYtThumbUrl(`https://img.youtube.com/vi/${modalYtId}/maxresdefault.jpg`);
    } else {
      setYtThumbUrl("");
    }
  }, [creative?.creative_id, modalYtId]);

  const handleThumbError = () => {
    if (!modalYtId) return;
    if (ytThumbUrl.includes("maxresdefault")) {
      setYtThumbUrl(`https://img.youtube.com/vi/${modalYtId}/sddefault.jpg`);
    } else if (ytThumbUrl.includes("sddefault")) {
      setYtThumbUrl(`https://img.youtube.com/vi/${modalYtId}/hqdefault.jpg`);
    }
  };

  // ── Chart refs + PDF export ────────────────────────────────────────────────
  const chartRefs = {
    ctr:          useRef<HTMLDivElement>(null),
    cpc:          useRef<HTMLDivElement>(null),
    spend:        useRef<HTMLDivElement>(null),
    "impr-clicks": useRef<HTMLDivElement>(null),
  };
  const [isExporting, setIsExporting] = useState(false);

  const downloadPdf = async () => {
    if (!creative || !totals || isExporting) return;
    setIsExporting(true);
    try {
      await exportCreativePdf({
        creative,
        totals,
        avgs,
        ctrDelta,
        cpcDelta,
        startDate,
        endDate,
        // Mirror exactly which metrics are currently visible in the modal
        enabledMetrics: Object.entries(modalMetrics)
          .filter(([, on]) => on)
          .map(([key]) => key),
        chartEls: {
          ctr:           chartRefs.ctr.current,
          cpc:           chartRefs.cpc.current,
          spend:         chartRefs.spend.current,
          "impr-clicks": chartRefs["impr-clicks"].current,
        },
      });
    } finally {
      setIsExporting(false);
    }
  };

  // ── Period observation state ───────────────────────────────────────────────
  const [selectedPeriods, setSelectedPeriods] = useState<PeriodId[]>([]);
  const [customOpen,  setCustomOpen]  = useState(false);
  const [customStart, setCustomStart] = useState("");
  const [customEnd,   setCustomEnd]   = useState("");

  const togglePeriod = (id: PeriodId) =>
    setSelectedPeriods(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  // Reset observation when a new creative is opened
  useEffect(() => {
    if (!creative) return;
    setSelectedPeriods([]);
    setCustomOpen(false);
    setCustomStart("");
    setCustomEnd("");
  }, [creative?.creative_id]); // eslint-disable-line react-hooks/exhaustive-deps

  const series = useMemo(() => {
    if (!creative) return [];
    return buildSeries(daily, creative.creative_id, comparisonIds, startDate, endDate);
  }, [creative, daily, comparisonIds, startDate, endDate]);

  const totals = useMemo(() => {
    if (!series.length) return null;
    const t = series.reduce((acc, s) => ({
      impressions: acc.impressions + s.impressions,
      clicks:      acc.clicks      + s.clicks,
      cost:        acc.cost        + s.cost,
      conversions: acc.conversions + s.conversions,
    }), { impressions: 0, clicks: 0, cost: 0, conversions: 0 });
    return computeMetrics(t);
  }, [series]);

  const avgs = useMemo(() => {
    if (!series.length) return { ctr: 0, cpc: 0 };
    const ctrs = series.filter(s => s.avgCtr > 0).map(s => s.avgCtr);
    const cpcs = series.filter(s => s.avgCpc > 0).map(s => s.avgCpc);
    const avg  = (arr: number[]) => arr.length ? arr.reduce((a, x) => a + x, 0) / arr.length : 0;
    return { ctr: avg(ctrs), cpc: avg(cpcs) };
  }, [series]);

  // ── Compute ReferenceArea bands for each active period ────────────────────
  const periodBands = useMemo(() => {
    const bands: Array<{ id: string; label: string; color: string; x1: string; x2: string }> = [];
    if (!series.length) return bands;
    const first = series[0].date;

    for (const p of PERIOD_OPTIONS) {
      if (!selectedPeriods.includes(p.id)) continue;
      const endIdx = Math.min(p.days - 1, series.length - 1);
      bands.push({ id: p.id, label: p.label, color: p.color, x1: first, x2: series[endIdx].date });
    }

    // Custom period band
    if (customStart && customEnd) {
      const fmt = (iso: string) => iso.slice(5); // YYYY-MM-DD → MM-DD
      const cs = fmt(customStart);
      const ce = fmt(customEnd);
      const x1 = series.find(s => s.date >= cs)?.date;
      const x2 = [...series].reverse().find(s => s.date <= ce)?.date;
      if (x1 && x2) bands.push({ id: "custom", label: "Custom", color: "#06b6d4", x1, x2 });
    }

    return bands;
  }, [selectedPeriods, series, customStart, customEnd]);

  // ── Per-chart XAxis tick data (one entry per date in series) ────────────────
  const ctrTickMap = useMemo(() => new Map(series.map(s => [s.date, {
    row1: s.ctr   > 0 ? `${s.ctr.toFixed(1)}%`    : "",
    row2: s.avgCtr > 0 ? `${s.avgCtr.toFixed(1)}%` : "",
  }])), [series]);

  const cpcTickMap = useMemo(() => new Map(series.map(s => [s.date, {
    row1: s.cpc   > 0 ? `₹${s.cpc.toFixed(0)}`    : "",
    row2: s.avgCpc > 0 ? `₹${s.avgCpc.toFixed(0)}` : "",
  }])), [series]);

  const spendTickMap = useMemo(() => new Map(series.map(s => [s.date, {
    row1: s.cost > 0 ? `₹${s.cost.toFixed(0)}` : "",
  }])), [series]);

  const imprClicksTickMap = useMemo(() => new Map(series.map(s => [s.date, {
    row1: s.impressions > 0 ? fmtNum(s.impressions) : "",
    row2: s.clicks      > 0 ? String(s.clicks)       : "",
  }])), [series]);

  // Prev/next within comparisonIds
  const { prevCreative, nextCreative, position } = useMemo(() => {
    if (!creative) return { prevCreative: null, nextCreative: null, position: null as null | { i: number; n: number } };
    const idx    = comparisonIds.indexOf(creative.creative_id);
    if (idx === -1) return { prevCreative: null, nextCreative: null, position: null };
    const prevId = idx > 0                           ? comparisonIds[idx - 1] : null;
    const nextId = idx < comparisonIds.length - 1   ? comparisonIds[idx + 1] : null;
    return {
      prevCreative: prevId ? creativeById.get(prevId) ?? null : null,
      nextCreative: nextId ? creativeById.get(nextId) ?? null : null,
      position:     { i: idx + 1, n: comparisonIds.length },
    };
  }, [creative, comparisonIds, creativeById]);

  // Keyboard nav
  useEffect(() => {
    if (!creative) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && ["INPUT", "TEXTAREA"].includes(e.target.tagName)) return;
      if (e.key === "ArrowLeft"  && prevCreative) { e.preventDefault(); onNavigate(prevCreative); }
      else if (e.key === "ArrowRight" && nextCreative) { e.preventDefault(); onNavigate(nextCreative); }
      else if ((e.key === "Backspace" || (e.altKey && e.key === "ArrowLeft"))  && canBack)    { e.preventDefault(); onBack(); }
      else if (e.altKey && e.key === "ArrowRight" && canForward) { e.preventDefault(); onForward(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [creative, prevCreative, nextCreative, canBack, canForward, onNavigate, onBack, onForward]);

  // Breadcrumb
  const crumbs = useMemo(() => {
    if (!creative) return [];
    return hierarchy.map(dim => ({
      dim,
      label: DIM_META[dim].label,
      value: DIM_META[dim].get(creative),
    }));
  }, [creative, hierarchy]);

  const jumpToCrumbSibling = (idx: number) => {
    if (!creative) return;
    const targetDims = hierarchy.slice(0, idx + 1);
    const siblings   = comparisonIds
      .map(id => creativeById.get(id))
      .filter((c): c is Creative => !!c && targetDims.every(d => DIM_META[d].get(c) === DIM_META[d].get(creative)));
    const i    = siblings.findIndex(c => c.creative_id === creative.creative_id);
    const next = siblings[(i + 1) % siblings.length];
    if (next && next.creative_id !== creative.creative_id) onNavigate(next);
  };

  // Ensure totals/avgs/deltas are computed BEFORE the early-return guard
  // so the downloadPdf closure always has the right values.
  const ctrDelta = avgs.ctr ? ((totals?.ctr ?? 0) - avgs.ctr) / avgs.ctr * 100 : 0;
  const cpcDelta = avgs.cpc && (totals?.cpc ?? 0) ? ((totals?.cpc ?? 0) - avgs.cpc) / avgs.cpc * 100 : 0;

  if (!creative || !totals) return null;

  const ytId = creative.creative_type === "Video" ? getYouTubeId(creative.creative_url) : null;

  return (
    <Dialog open={!!creative} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="w-[960px] max-w-[96vw] max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          {/* History + prev/next nav + download button */}
          <div className="flex items-center gap-1 -mt-1 mb-1 flex-wrap">
            <Button size="sm" variant="outline" className="h-7 px-2 gap-1" disabled={!canBack} onClick={onBack} title="Back (Backspace / Alt+←)">
              <ArrowLeft className="w-3.5 h-3.5" /> Back
            </Button>
            <Button size="sm" variant="outline" className="h-7 px-2 gap-1" disabled={!canForward} onClick={onForward} title="Forward (Alt+→)">
              Forward <ArrowRight className="w-3.5 h-3.5" />
            </Button>
            <div className="ml-2 flex items-center gap-1">
              <Button size="icon" variant="outline" className="h-7 w-7"
                disabled={!prevCreative}
                onClick={() => prevCreative && onNavigate(prevCreative)}
                title={prevCreative ? `Previous: ${prevCreative.headline ?? prevCreative.creative_id} (←)` : "No previous"}
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              {position && (
                <span className="text-[11px] tabular-nums text-muted-foreground px-1.5">
                  {position.i} / {position.n}
                </span>
              )}
              <Button size="icon" variant="outline" className="h-7 w-7"
                disabled={!nextCreative}
                onClick={() => nextCreative && onNavigate(nextCreative)}
                title={nextCreative ? `Next: ${nextCreative.headline ?? nextCreative.creative_id} (→)` : "No next"}
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
            {/* Download PDF button */}
            <Button
              size="sm"
              variant="outline"
              className="h-7 px-2.5 gap-1.5 ml-auto border-gold/40 text-gold hover:bg-gold/10 hover:border-gold hover:text-gold transition-all"
              onClick={downloadPdf}
              disabled={isExporting}
              title="Download this creative as a vector PDF report"
            >
              {isExporting
                ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Exporting…</>
                : <><FileDown className="w-3.5 h-3.5" /> Download PDF</>}
            </Button>
          </div>

          {/* ── Funnel path ── */}
          <div className="space-y-1.5 pr-8">
            {/* Row 1: Location › Funnel › Type */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="flex items-center gap-1.5">
                <span className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground/70">Location</span>
                <span className="text-sm font-semibold text-foreground/90">{creative.city}</span>
              </span>
              <Chev className="w-3.5 h-3.5 text-muted-foreground/30" />
              <span className="flex items-center gap-1.5">
                <span className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground/70">Funnel</span>
                <span className={cn("text-sm font-bold", creative.funnel === "MOFU" ? "text-gold" : "text-emerald-400")}>
                  {creative.funnel}
                </span>
              </span>
              <Chev className="w-3.5 h-3.5 text-muted-foreground/30" />
              <span className="flex items-center gap-1.5">
                <span className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground/70">Type</span>
                <span className="text-sm font-semibold text-foreground/90">{creative.campaign_type}</span>
              </span>
            </div>
            {/* Row 2: Campaign + Ad Group on same line */}
            <div className="flex items-center gap-4 flex-wrap">
              <span className="flex items-center gap-1.5">
                <span className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground/70 shrink-0">Campaign</span>
                <span className="font-mono text-sm text-foreground/90 break-all">{creative.campaign_name || "--"}</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground/70 shrink-0">Ad Group</span>
                <span className="font-mono text-sm text-foreground/90">{creative.ad_group || "--"}</span>
              </span>
            </div>
          </div>

          {/* Title — clickable link to the creative asset */}
          <DialogTitle className="font-display text-xl tracking-tight pr-8 pt-1">
            <a
              href={creative.creative_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 hover:text-gold transition-colors group"
            >
              <span className="underline-offset-4 group-hover:underline">{adName(creative)}</span>
              <ExternalLink className="w-4 h-4 shrink-0 opacity-50 group-hover:opacity-100 transition-opacity" />
            </a>
          </DialogTitle>

          {/* Raw URL link — small, below the title */}
          {creative.creative_url && (
            <a
              href={creative.creative_url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={e => e.stopPropagation()}
              className="flex items-center gap-1 text-[10px] text-blue-400/60 hover:text-blue-400 transition-colors truncate -mt-0.5"
            >
              <span className="text-muted-foreground/60 font-semibold not-italic">Link:</span>
              <ExternalLink className="w-3 h-3 shrink-0" />
              <span className="truncate font-mono">{creative.creative_url}</span>
            </a>
          )}

          {/* Type + Funnel tag pills */}
          <div className="flex flex-wrap gap-1.5 pt-0.5">
            <span className="px-1.5 py-0.5 rounded bg-muted text-xs">{creative.creative_type}</span>
            <span className="px-1.5 py-0.5 rounded bg-gold/15 text-gold text-xs">{creative.funnel}</span>
            {creative.category && <span className="px-1.5 py-0.5 rounded bg-muted text-xs">{creative.category}</span>}
          </div>
        </DialogHeader>

        {/* ── Creative preview + stats ───────────────────────────────────── */}
        <div className="flex gap-4 pt-2 items-center">
          {/* Creative preview column */}
          <div className="shrink-0 self-start space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-[10px] uppercase tracking-widest text-muted-foreground shrink-0">Creative</span>
              <div className="flex-1 h-px bg-white/[0.06]" />
            </div>
          <div className="rounded-xl overflow-hidden border border-border bg-muted/40">
            {creative.creative_type === "Image" && creative.creative_url && (
              <img
                src={creative.creative_url}
                alt={creative.headline ?? ""}
                className="block max-h-[200px] w-auto max-w-[280px]"
                style={{ objectFit: "contain" }}
              />
            )}
            {creative.creative_type === "Video" && ytId && (
              <div className="relative w-[280px] aspect-video bg-black flex items-center justify-center">
                {isPlaying ? (
                  <iframe
                    src={`https://www.youtube.com/embed/${ytId}?autoplay=1&mute=0&enablejsapi=1`}
                    title={creative.headline ?? "Creative Video"}
                    frameBorder="0"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                    allowFullScreen
                    className="w-full h-full"
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => setIsPlaying(true)}
                    className="relative w-full h-full group/play flex items-center justify-center overflow-hidden"
                  >
                    <img
                      src={ytThumbUrl}
                      onError={handleThumbError}
                      alt={creative.headline ?? ""}
                      className="w-full h-full object-cover transition-transform duration-300 group-hover/play:scale-105"
                    />
                    <div className="absolute inset-0 bg-black/35 group-hover/play:bg-black/45 transition-colors" />
                    {/* Play button overlay */}
                    <div className="absolute w-14 h-14 rounded-full bg-black/60 border border-white/20 flex items-center justify-center
                                    backdrop-blur-sm group-hover/play:scale-110 group-hover/play:bg-gold/90 group-hover/play:border-gold transition-all duration-200">
                      <Play className="w-6 h-6 text-white group-hover/play:text-black fill-current ml-0.5" />
                    </div>
                  </button>
                )}
              </div>
            )}
            {creative.creative_type === "Image" && !creative.creative_url && (
              <div className="w-[160px] h-[160px] flex items-center justify-center text-xs text-muted-foreground">
                No preview available
              </div>
            )}
            {creative.creative_type === "Video" && !ytId && (
              <div className="w-[160px] h-[160px] flex items-center justify-center text-xs text-muted-foreground">
                No preview available
              </div>
            )}
            {creative.creative_type === "Text" && (
              <div className="w-[200px] h-[160px] p-3 bg-white text-[#202124] flex flex-col justify-center gap-1 text-xs">
                <div className="text-[10px] flex items-center gap-1 text-[#4d5156]">
                  <span className="inline-block w-3 h-3 rounded-full bg-[#4285F4]" /> Ad
                </div>
                <div className="text-[#1a0dab] text-sm font-medium line-clamp-2">{creative.headline}</div>
                <p className="text-[#4d5156] line-clamp-4">{creative.description}</p>
              </div>
            )}
          </div>
          </div> {/* end creative preview column */}

          {/* Stats grid + settings */}
          <div className="flex-1 min-w-0 space-y-2">
            {/* Row: label ── configure */}
            <div className="flex items-center gap-2">
              <span className="text-[10px] uppercase tracking-widest text-muted-foreground shrink-0">Metrics</span>
              <div className="flex-1 h-px bg-white/[0.06]" />
              <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="flex items-center gap-1.5 px-2 py-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-white/[0.06] transition-colors text-[10px] uppercase tracking-widest"
                  title="Configure visible metrics"
                >
                  <Settings className="w-3 h-3" />
                  Configure
                </button>
              </PopoverTrigger>
              <PopoverContent align="end" sideOffset={6} className="w-48 p-1.5">
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground px-2 py-1 mb-1">
                  Visible metrics
                </p>
                {MODAL_METRIC_OPTS.map(o => {
                  const on = !!modalMetrics[o.key];
                  return (
                    <button
                      key={o.key}
                      type="button"
                      onClick={() => toggleMetric(o.key)}
                      className={cn(
                        "w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md text-sm transition-colors",
                        on ? "text-gold" : "text-foreground/70 hover:bg-white/[0.06] hover:text-foreground",
                      )}
                    >
                      <span className={cn(
                        "w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors",
                        on ? "bg-gold/20 border-gold/60" : "border-white/20",
                      )}>
                        {on && <Check className="w-2.5 h-2.5 text-gold" />}
                      </span>
                      {o.label}
                    </button>
                  );
                })}
              </PopoverContent>
              </Popover>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {modalMetrics.impressions && <Stat label="Impressions" value={fmtNum(totals.impressions)} />}
              {modalMetrics.clicks      && <Stat label="Clicks"      value={fmtNum(totals.clicks)} />}
              {modalMetrics.cost        && <Stat label="Spend"       value={fmtINR0(totals.cost)} accent />}
              {modalMetrics.ctr         && <Stat label="CTR"  value={fmtPct(totals.ctr)}  delta={<Delta value={ctrDelta} />}        sub={`avg ${fmtPct(avgs.ctr)}`} />}
              {modalMetrics.cpc         && <Stat label="CPC"  value={fmtINR(totals.cpc)}  delta={<Delta value={cpcDelta} invert />} sub={`avg ${fmtINR(avgs.cpc)}`} />}
              {modalMetrics.cpm         && <Stat label="CPM"  value={fmtINR(totals.cpm)} />}
              {modalMetrics.conversions && <Stat label="Conversions" value={totals.conversions.toFixed(1)} />}
              {modalMetrics.cr          && <Stat label="CR"   value={fmtPct(totals.cr)} />}
            </div>
          </div> {/* end stats + settings */}
        </div>

        {/* ── Period observation pills ──────────────────────────────────── */}
        <div className="space-y-2 pt-1">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Observe periods</div>
          <div className="flex items-center gap-2 flex-wrap">
            {PERIOD_OPTIONS.map(p => {
              const active    = selectedPeriods.includes(p.id);
              const available = series.length >= p.days;
              return (
                <button
                  key={p.id}
                  type="button"
                  disabled={!available}
                  onClick={() => togglePeriod(p.id)}
                  style={active ? {
                    backgroundColor: `${p.color}1a`,
                    borderColor:     p.color,
                    color:           p.color,
                    boxShadow:       `0 0 14px ${p.color}55, 0 0 4px ${p.color}33`,
                  } : {}}
                  className={cn(
                    "text-xs px-3.5 py-1.5 rounded-full border font-semibold tracking-wide transition-all duration-200",
                    active ? "" : "border-border text-muted-foreground hover:border-white/30 hover:text-foreground",
                    !available && "opacity-25 cursor-not-allowed",
                  )}
                >
                  {p.label}
                </button>
              );
            })}

            {/* Custom period */}
            <button
              type="button"
              onClick={() => setCustomOpen(o => !o)}
              style={customStart && customEnd ? {
                backgroundColor: "#06b6d41a",
                borderColor:     "#06b6d4",
                color:           "#06b6d4",
                boxShadow:       "0 0 14px #06b6d455, 0 0 4px #06b6d433",
              } : {}}
              className={cn(
                "text-xs px-3.5 py-1.5 rounded-full border font-semibold tracking-wide transition-all duration-200",
                customStart && customEnd ? "" : "border-border text-muted-foreground hover:border-white/30 hover:text-foreground",
              )}
            >
              Custom
            </button>

            {/* Clear all */}
            {(selectedPeriods.length > 0 || customStart || customEnd) && (
              <button
                type="button"
                onClick={() => { setSelectedPeriods([]); setCustomStart(""); setCustomEnd(""); setCustomOpen(false); }}
                className="text-xs px-3 py-1.5 rounded-full border border-border text-muted-foreground hover:text-destructive hover:border-destructive/40 transition-all duration-200"
              >
                Clear
              </button>
            )}
          </div>

          {/* Custom date range inputs */}
          {customOpen && (
            <div className="flex items-center gap-2 pt-1 flex-wrap">
              <span className="text-[10px] text-muted-foreground">From</span>
              <input
                type="date"
                value={customStart}
                min={startDate}
                max={endDate}
                onChange={e => setCustomStart(e.target.value)}
                className="h-7 px-2 text-xs rounded-md bg-background/40 border border-border outline-none focus:border-[#06b6d4] transition-colors [color-scheme:dark]"
              />
              <span className="text-[10px] text-muted-foreground">to</span>
              <input
                type="date"
                value={customEnd}
                min={customStart || startDate}
                max={endDate}
                onChange={e => setCustomEnd(e.target.value)}
                className="h-7 px-2 text-xs rounded-md bg-background/40 border border-border outline-none focus:border-[#06b6d4] transition-colors [color-scheme:dark]"
              />
              {customStart && customEnd && (
                <span style={{ color: "#06b6d4" }} className="text-[10px] font-semibold">
                  ✓ Applied
                </span>
              )}
            </div>
          )}
        </div>

        {/* ── Charts — one chart per row ──────────────────────────────────── */}
        <div className="flex flex-col gap-3 pt-1">
          {/* 1 — CTR vs dataset average */}
          <ChartCard title="CTR vs. dataset avg" suffix="%" chartRef={chartRefs.ctr}>
            <LineChart data={series} margin={{ top: 22, right: 5, left: 0, bottom: 0 }}>
              {periodBands.map(b => (
                <ReferenceArea key={b.id} x1={b.x1} x2={b.x2} fill={b.color} fillOpacity={0.12} stroke="none"
                  label={{ content: (p: { viewBox?: { x: number; y: number; width: number; height: number } }) => <BandLabel viewBox={p.viewBox} label={b.label} color={b.color} /> }} />
              ))}
              <CartesianGrid strokeDasharray="3 3" stroke="oklch(1 0 0 / 0.06)" />
              <XAxis dataKey="date" height={52} stroke="oklch(0.7 0.02 260)"
                tick={(p: any) => <ChartXTick {...p} tickMap={ctrTickMap} color1={CHART_GOLD} color2={CHART_TEAL} />} />
              <YAxis stroke="oklch(0.7 0.02 260)" fontSize={10} tickFormatter={v => `${v}%`} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [`${v.toFixed(2)}%`]} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Line type="monotone" dataKey="ctr"    name="This creative" stroke="var(--gold)"          strokeWidth={2.5} dot={false} />
              <Line type="monotone" dataKey="avgCtr" name="Dataset avg"   stroke="oklch(0.62 0.11 175)" strokeWidth={1.5} strokeDasharray="4 4" dot={false} />
              {avgs.ctr > 0 && <ReferenceLine y={avgs.ctr} stroke="oklch(0.62 0.11 175 / 0.3)" />}
            </LineChart>
          </ChartCard>

          {/* 2 — CPC vs dataset average */}
          <ChartCard title="CPC vs. dataset avg" suffix="₹" chartRef={chartRefs.cpc}>
            <LineChart data={series} margin={{ top: 22, right: 5, left: 0, bottom: 0 }}>
              {periodBands.map(b => (
                <ReferenceArea key={b.id} x1={b.x1} x2={b.x2} fill={b.color} fillOpacity={0.12} stroke="none"
                  label={{ content: (p: { viewBox?: { x: number; y: number; width: number; height: number } }) => <BandLabel viewBox={p.viewBox} label={b.label} color={b.color} /> }} />
              ))}
              <CartesianGrid strokeDasharray="3 3" stroke="oklch(1 0 0 / 0.06)" />
              <XAxis dataKey="date" height={52} stroke="oklch(0.7 0.02 260)"
                tick={(p: any) => <ChartXTick {...p} tickMap={cpcTickMap} color1={CHART_GOLD} color2={CHART_TEAL} />} />
              <YAxis stroke="oklch(0.7 0.02 260)" fontSize={10} tickFormatter={v => `₹${v}`} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [`₹${v.toFixed(2)}`]} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Line type="monotone" dataKey="cpc"    name="This creative" stroke="var(--gold)"          strokeWidth={2.5} dot={false} />
              <Line type="monotone" dataKey="avgCpc" name="Dataset avg"   stroke="oklch(0.62 0.11 175)" strokeWidth={1.5} strokeDasharray="4 4" dot={false} />
              {avgs.cpc > 0 && <ReferenceLine y={avgs.cpc} stroke="oklch(0.62 0.11 175 / 0.3)" />}
            </LineChart>
          </ChartCard>

          {/* 3 — Daily spend */}
          <ChartCard title="Spend (₹)" chartRef={chartRefs.spend}>
            <LineChart data={series} margin={{ top: 22, right: 5, left: 0, bottom: 0 }}>
              {periodBands.map(b => (
                <ReferenceArea key={b.id} x1={b.x1} x2={b.x2} fill={b.color} fillOpacity={0.12} stroke="none"
                  label={{ content: (p: { viewBox?: { x: number; y: number; width: number; height: number } }) => <BandLabel viewBox={p.viewBox} label={b.label} color={b.color} /> }} />
              ))}
              <CartesianGrid strokeDasharray="3 3" stroke="oklch(1 0 0 / 0.06)" />
              <XAxis dataKey="date" height={40} stroke="oklch(0.7 0.02 260)"
                tick={(p: any) => <ChartXTick {...p} tickMap={spendTickMap} color1={CHART_GOLD} />} />
              <YAxis stroke="oklch(0.7 0.02 260)" fontSize={10} tickFormatter={v => `₹${v}`} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [`₹${v.toFixed(0)}`]} />
              <Line type="monotone" dataKey="cost" name="Spend" stroke="var(--gold)" strokeWidth={2} dot={false} />
            </LineChart>
          </ChartCard>

          {/* 4 — Impressions & Clicks */}
          <ChartCard title="Impressions & Clicks" chartRef={chartRefs["impr-clicks"]}>
            <LineChart data={series} margin={{ top: 22, right: 5, left: 0, bottom: 0 }}>
              {periodBands.map(b => (
                <ReferenceArea key={b.id} yAxisId="l" x1={b.x1} x2={b.x2} fill={b.color} fillOpacity={0.12} stroke="none"
                  label={{ content: (p: { viewBox?: { x: number; y: number; width: number; height: number } }) => <BandLabel viewBox={p.viewBox} label={b.label} color={b.color} /> }} />
              ))}
              <CartesianGrid strokeDasharray="3 3" stroke="oklch(1 0 0 / 0.06)" />
              <XAxis dataKey="date" height={52} stroke="oklch(0.7 0.02 260)"
                tick={(p: any) => <ChartXTick {...p} tickMap={imprClicksTickMap} color1={CHART_GOLD} color2={CHART_TEAL} />} />
              <YAxis yAxisId="l" stroke="oklch(0.7 0.02 260)" fontSize={10} />
              <YAxis yAxisId="r" orientation="right" stroke="oklch(0.7 0.02 260)" fontSize={10} />
              <Tooltip contentStyle={tooltipStyle} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Line yAxisId="l" type="monotone" dataKey="impressions" name="Impressions" stroke="var(--gold)"          strokeWidth={2} dot={false} />
              <Line yAxisId="r" type="monotone" dataKey="clicks"      name="Clicks"      stroke="oklch(0.62 0.11 175)" strokeWidth={2} dot={false} />
            </LineChart>
          </ChartCard>
        </div> {/* end charts */}
      </DialogContent>
    </Dialog>
  );
}

// ── Chart color constants (resolved sRGB — safe in SVG attributes) ───────────
const CHART_GOLD = "#c8a350";   // ~var(--gold)
const CHART_TEAL = "#3dbf9e";   // ~oklch(0.62 0.11 175)

// ── Custom XAxis tick: date + two metric data rows ─────────────────────────────
function ChartXTick({
  x, y, payload, tickMap, color1, color2,
}: {
  x?: number; y?: number;
  payload?: { value: string };
  tickMap: Map<string, { row1?: string; row2?: string }>;
  color1: string;
  color2?: string;
}) {
  if (x === undefined || y === undefined || !payload) return null;
  const vals = tickMap.get(payload.value);
  return (
    <g transform={`translate(${x},${y})`}>
      {/* Date label */}
      <text x={0} y={0} dy={12} textAnchor="middle" fill="#6b7280" fontSize={9}>
        {payload.value}
      </text>
      {/* Row 1 — gold/yellow metric */}
      {vals?.row1 && (
        <text x={0} y={0} dy={25} textAnchor="middle" fill={color1} fontSize={8} fontWeight="700">
          {vals.row1}
        </text>
      )}
      {/* Row 2 — teal/green metric */}
      {vals?.row2 && color2 && (
        <text x={0} y={0} dy={37} textAnchor="middle" fill={color2} fontSize={8}>
          {vals.row2}
        </text>
      )}
    </g>
  );
}

// ── Shared styles ─────────────────────────────────────────────────────────────

const tooltipStyle: React.CSSProperties = {
  background:   "oklch(0.18 0.012 260)",
  border:       "1px solid oklch(1 0 0 / 0.1)",
  borderRadius: 8,
  fontSize:     11,
};

// ── Sub-components ────────────────────────────────────────────────────────────

function Stat({ label, value, sub, delta, accent }: {
  label:   string;
  value:   string;
  sub?:    string;
  delta?:  React.ReactNode;
  accent?: boolean;
}) {
  return (
    <div className={cn("rounded-lg border border-border bg-background/40 p-2.5", accent && "border-gold/30 bg-gold/5")}>
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <button
        type="button"
        onClick={() => { void copyText(value); }}
        className="font-display font-bold text-base tabular-nums leading-tight mt-0.5 cursor-copy text-left"
        title="Click to copy"
      >
        {value}
      </button>
      {(sub || delta) && (
        <div className="flex items-center justify-between gap-1 mt-1">
          {sub   && <span className="text-[10px] text-muted-foreground">{sub}</span>}
          {delta}
        </div>
      )}
    </div>
  );
}

function ChartCard({ title, children, suffix, chartRef }: {
  title:     string;
  children:  React.ReactElement;
  suffix?:   string;
  chartRef?: React.RefObject<HTMLDivElement | null>;
}) {
  return (
    <div ref={chartRef} className="rounded-xl border border-border bg-background/40 p-3 w-full">
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-xs font-display font-semibold uppercase tracking-widest text-muted-foreground">
          {title}
        </h4>
        {suffix && <span className="text-[10px] text-muted-foreground">{suffix}</span>}
      </div>
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">{children}</ResponsiveContainer>
      </div>
    </div>
  );
}
