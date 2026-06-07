import { useMemo, useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { Trophy, Medal, Award, FileText, ChevronDown, Info, Pencil, Check, Play, ExternalLink, Plus, X, Fingerprint, MapPin, Filter, Tag } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn, copyText } from "@/lib/utils";
import type { Creative } from "@/lib/api";
import { computeMetrics, type ComputedMetrics, fmtINR, fmtINR0, fmtNum, fmtPct, getYouTubeId } from "@/lib/metrics";
import { exportTopPerformersPdf } from "@/lib/exportTopPerformersPdf";

interface Row { creative: Creative; metrics: ComputedMetrics; }

// ─── Types ──────────────────────────────────────────────────────────────────
export type ThresholdType = "impressions" | "spend";

// ─── Comparison types ────────────────────────────────────────────────────────
interface ComparisonCol {
  city: string | null;
  type: "Image" | "Video";
}

interface ComparisonRowState {
  id: string;
  label: "compare" | "city-level";
  left: ComparisonCol;
  right: ComparisonCol;
}

// ─── Props ───────────────────────────────────────────────────────────────────
interface Props {
  rows: Row[];
  metric: "ctr" | "conversions" | "cpc" | "cpa";
  rowHeight: number;
  dateRange: string;
  onCreativeClick: (c: Creative) => void;
  exportRef?: React.MutableRefObject<(() => Promise<void>) | null>;
}

const metricLabel: Record<Props["metric"], string> = {
  ctr: "CTR", conversions: "Conversions", cpc: "CPC", cpa: "CPA"
};
const metricFmt: Record<Props["metric"], (v: number) => string> = {
  ctr: fmtPct, conversions: (v) => v.toFixed(1), cpc: fmtINR, cpa: fmtINR,
};
const ascending = (m: Props["metric"]) => m === "cpc" || m === "cpa";

// ─── Preset options for Top-N dropdown ─────────────────────────────────────
const PRESET_OPTIONS: { label: string; value: number }[] = [
  { label: "5", value: 5 },
  { label: "10", value: 10 },
  { label: "15", value: 15 },
  { label: "20", value: 20 },
  { label: "30", value: 30 },
  { label: "40", value: 40 },
  { label: "50", value: 50 },
  { label: "ALL", value: Infinity },
];

// ─── rank() ────────────────────────────────────────────────────────────────
function rank(
  rows: Row[],
  metric: Props["metric"],
  limit: number,
  minThreshold: number,
  thresholdType: ThresholdType,
) {
  const sorted = [...rows].sort((a, b) => {
    const av = a.metrics[metric]; const bv = b.metrics[metric];
    return ascending(metric) ? av - bv : bv - av;
  });
  const filtered = sorted.filter(r => {
    const meetsThreshold = thresholdType === "impressions"
      ? r.metrics.impressions >= minThreshold
      : r.metrics.cost >= minThreshold;
    return meetsThreshold && (ascending(metric) ? r.metrics[metric] > 0 : true);
  });
  return limit === Infinity ? filtered : filtered.slice(0, limit);
}

const medals = [
  { icon: Trophy, color: "text-gold", bg: "bg-gold/15", label: "1st" },
  { icon: Medal, color: "text-[#c0c0c0]", bg: "bg-white/10", label: "2nd" },
  { icon: Award, color: "text-[#cd7f32]", bg: "bg-[#cd7f32]/15", label: "3rd" },
];

// ─── TopNDropdown ──────────────────────────────────────────────────────────
function TopNDropdown({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [open, setOpen] = useState(false);
  const [customMode, setCustom] = useState(false);
  const [customInput, setCustomInput] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false); setCustom(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const label = value === Infinity ? "ALL" : String(value);

  const commitCustom = () => {
    const n = parseInt(customInput, 10);
    if (!isNaN(n) && n >= 1) {
      onChange(n); setOpen(false); setCustom(false); setCustomInput("");
    }
  };

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={() => { setOpen(o => !o); setCustom(false); }}
        className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-sm font-bold
                   bg-gold/10 border border-gold/25 text-gold hover:bg-gold/20
                   hover:border-gold/50 transition-all duration-150 tabular-nums"
        title="Change number of creatives shown"
      >
        {label}
        <ChevronDown className={`w-3 h-3 transition-transform duration-150 ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1.5 z-50 glass rounded-xl border border-white/10
                        shadow-[0_8px_32px_-8px_rgba(0,0,0,0.6)] p-2 min-w-[100px]">
          {PRESET_OPTIONS.map(opt => (
            <button
              key={opt.label}
              type="button"
              onClick={() => { onChange(opt.value); setOpen(false); setCustom(false); }}
              className={`w-full text-left px-3 py-1.5 rounded-lg text-xs font-medium transition-colors
                         ${value === opt.value
                  ? "bg-gold-gradient text-[#2a1800] font-bold"
                  : "text-foreground hover:bg-white/[0.07]"
                }`}
            >
              {opt.label}
            </button>
          ))}
          <div className="my-1.5 border-t border-white/[0.08]" />
          {!customMode ? (
            <button
              type="button"
              onClick={() => { setCustom(true); setCustomInput(""); }}
              className="w-full text-left px-3 py-1.5 rounded-lg text-xs text-muted-foreground
                         hover:bg-white/[0.07] transition-colors"
            >
              Custom…
            </button>
          ) : (
            <div className="flex items-center gap-1 px-1">
              <input
                type="number" min={1} max={999} value={customInput}
                onChange={e => setCustomInput(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") commitCustom(); if (e.key === "Escape") setCustom(false); }}
                placeholder="e.g. 7" autoFocus
                className="w-full bg-transparent border border-gold/30 rounded-md px-2 py-1
                           text-xs text-foreground placeholder:text-muted-foreground focus:outline-none
                           focus:border-gold/60 tabular-nums"
              />
              <button type="button" onClick={commitCustom}
                className="shrink-0 p-1 rounded-md bg-gold/15 text-gold hover:bg-gold/30 transition-colors"
                title="Apply"
              >
                <Check className="w-3 h-3" />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── ThresholdPill — Min Impressions OR Min Spend, exported for toolbar ─────
export function ThresholdPill({
  value,
  thresholdType,
  onChange,
  onTypeChange,
}: {
  value: number;
  thresholdType: ThresholdType;
  onChange: (v: number) => void;
  onTypeChange: (t: ThresholdType) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [typeOpen, setTypeOpen] = useState(false);
  const inputRef    = useRef<HTMLInputElement>(null);
  const typeBtnRef  = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number } | null>(null);

  // Compute portal position when dropdown opens
  useEffect(() => {
    if (typeOpen && typeBtnRef.current) {
      const r = typeBtnRef.current.getBoundingClientRect();
      setDropdownPos({ top: r.bottom + 4, left: r.left });
    }
  }, [typeOpen]);

  // Close when clicking outside both the trigger and the portaled dropdown
  useEffect(() => {
    if (!typeOpen) return;
    const handler = (e: MouseEvent) => {
      if (
        typeBtnRef.current?.contains(e.target as Node) ||
        dropdownRef.current?.contains(e.target as Node)
      ) return;
      setTypeOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [typeOpen]);

  const startEdit = () => {
    setDraft(value === 0 ? "" : String(value));
    setEditing(true);
    setTimeout(() => inputRef.current?.select(), 0);
  };

  const commit = () => {
    const n = parseInt(draft, 10);
    onChange(!isNaN(n) && n >= 0 ? n : value);
    setEditing(false);
  };

  const handleTypeChange = (t: ThresholdType) => {
    setTypeOpen(false);
    if (t === thresholdType) return;
    // Reset to sensible defaults when switching type
    onTypeChange(t);
    onChange(t === "spend" ? 500 : 100);
  };

  const typeLabel = thresholdType === "impressions" ? "Impr" : "₹";

  return (
    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-white/[0.08]
                    bg-white/[0.03] text-xs text-muted-foreground shrink-0">
      <Info className="w-3 h-3 text-blue-400 shrink-0" />
      <span className="whitespace-nowrap">Min </span>

      {/* Type dropdown trigger */}
      <button
        ref={typeBtnRef}
        type="button"
        onClick={() => setTypeOpen(o => !o)}
        className="flex items-center gap-0.5 font-semibold text-foreground hover:text-blue-300
                   transition-colors rounded px-0.5 cursor-pointer"
        title="Switch threshold type"
      >
        {typeLabel}
        <ChevronDown className={`w-2.5 h-2.5 transition-transform duration-150 ${typeOpen ? "rotate-180" : ""}`} />
      </button>

      {/* Portaled dropdown — escapes all stacking contexts */}
      {typeOpen && dropdownPos && createPortal(
        <div
          ref={dropdownRef}
          style={{ position: "fixed", top: dropdownPos.top, left: dropdownPos.left, zIndex: 9999 }}
          className="glass rounded-lg border border-white/10 shadow-[0_8px_32px_-8px_rgba(0,0,0,0.8)] p-1 min-w-[120px]"
        >
          {([
            { value: "impressions" as ThresholdType, label: "Impressions" },
            { value: "spend"       as ThresholdType, label: "Spend (₹)"   },
          ]).map(opt => (
            <button
              key={opt.value}
              type="button"
              onClick={() => handleTypeChange(opt.value)}
              className={`w-full text-left px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer
                         ${thresholdType === opt.value
                ? "bg-blue-500/20 text-blue-300"
                : "text-foreground hover:bg-white/[0.07]"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>,
        document.body,
      )}

      <span className="whitespace-nowrap">:{" "}
        {editing ? (
          <input
            ref={inputRef}
            type="number" min={0}
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={e => { if (e.key === "Enter") commit(); if (e.key === "Escape") setEditing(false); }}
            className="inline-block w-16 bg-transparent border-b border-blue-400/60 text-foreground
                       font-bold tabular-nums focus:outline-none text-xs px-0.5 mx-0.5"
            autoFocus
          />
        ) : (
          <span className="font-bold text-foreground tabular-nums">
            {value === 0 ? "OFF" : (thresholdType === "spend" ? `₹${fmtNum(value)}` : fmtNum(value))}
          </span>
        )}{" "}
        {!editing && (
          <button
            type="button"
            onClick={startEdit}
            className="inline-flex items-center gap-0.5 text-blue-400 hover:text-blue-300 transition-colors"
            title={`Edit minimum ${thresholdType} threshold`}
          >
            <Pencil className="w-2.5 h-2.5" />
            Edit
          </button>
        )}
      </span>
    </div>
  );
}

// Keep old export name as alias for backward compatibility
export const ImpressionThresholdPill = ThresholdPill;

// ─── HoverPreview — portal-based floating media preview ───────────────────
function HoverPreview({
  row,
  side,
  anchorRef,
}: {
  row: Row;
  side: "left" | "right";
  anchorRef: React.RefObject<HTMLDivElement | null>;
}) {
  const ytId   = row.creative.creative_type === "Video" ? getYouTubeId(row.creative.creative_url) : null;
  const isImg  = row.creative.creative_type === "Image" && !!row.creative.creative_url;
  const isShort = !!row.creative.creative_url?.includes("/shorts/");

  const previewW = isShort ? 337.5 : 600;
  const previewH = isShort ? 600 : 337.5;

  // Position: fixed, vertically centered on screen, horizontally anchored to column edge
  const [pos, setPos] = useState<{ top: number; left?: number; right?: number } | null>(null);

  // Cascade high-quality thumbnails
  const [ytThumbUrl, setYtThumbUrl] = useState(ytId ? `https://img.youtube.com/vi/${ytId}/maxresdefault.jpg` : "");

  // Auto-play timer
  const [shouldPlay, setShouldPlay] = useState(false);
  const [progressActive, setProgressActive] = useState(false);

  useEffect(() => {
    if (ytId) {
      setYtThumbUrl(`https://img.youtube.com/vi/${ytId}/maxresdefault.jpg`);
      setShouldPlay(false);
      setProgressActive(false);

      const timer = setTimeout(() => {
        setShouldPlay(true);
      }, 2000);

      const raf = requestAnimationFrame(() => {
        setProgressActive(true);
      });

      return () => {
        clearTimeout(timer);
        cancelAnimationFrame(raf);
      };
    }
  }, [ytId]);

  const handleThumbError = () => {
    if (!ytId) return;
    if (ytThumbUrl.includes("maxresdefault")) {
      setYtThumbUrl(`https://img.youtube.com/vi/${ytId}/sddefault.jpg`);
    } else if (ytThumbUrl.includes("sddefault")) {
      setYtThumbUrl(`https://img.youtube.com/vi/${ytId}/hqdefault.jpg`);
    }
  };

  useEffect(() => {
    if (!anchorRef.current) return;
    const rect = anchorRef.current.getBoundingClientRect();
    const gap = 16;

    let left: number | undefined;
    let right: number | undefined;

    if (side === "right") {
      // preview appears to the RIGHT of the image column
      left = rect.right + gap;
    } else {
      // preview appears to the LEFT of the video column
      right = window.innerWidth - rect.left + gap;
    }

    // Clamp so it doesn't go off-screen horizontally
    if (left !== undefined) {
      left = Math.min(left, window.innerWidth - previewW - 16);
    }
    if (right !== undefined) {
      right = Math.min(right, window.innerWidth - previewW - 16);
    }

    setPos({
      top: window.innerHeight / 2,
      left,
      right,
    });
  }, [anchorRef, side, previewW]);

  if (!pos) return null;

  return createPortal(
    <div
      className="pointer-events-none"
      style={{
        position: "fixed",
        top: pos.top,
        left: pos.left,
        right: pos.right,
        transform: "translateY(-50%)",
        zIndex: 9999,
        width: previewW,
      }}
    >
      <div className="glass rounded-2xl overflow-hidden border border-gold/20
                      shadow-[0_8px_40px_-8px_rgba(0,0,0,0.8),0_0_0_1px_rgba(212,175,55,0.12)]
                      animate-in fade-in zoom-in-95 duration-150">
        {/* Media */}
        <div className="relative w-full bg-black overflow-hidden" style={{ height: previewH }}>
          {isImg && (
            <img
              src={row.creative.creative_url}
              alt={row.creative.headline ?? ""}
              className="w-full h-full object-contain"
            />
          )}
          {ytId && (
            <>
              {shouldPlay ? (
                <iframe
                  src={`https://www.youtube.com/embed/${ytId}?autoplay=1&mute=0&enablejsapi=1`}
                  title={row.creative.headline ?? "Creative Preview"}
                  frameBorder="0"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  allowFullScreen
                  className="w-full h-full"
                />
              ) : (
                <>
                  <img
                    src={ytThumbUrl}
                    onError={handleThumbError}
                    alt={row.creative.headline ?? ""}
                    className="w-full h-full object-cover"
                  />
                  {/* Play icon overlay */}
                  <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                    <div className="w-14 h-14 rounded-full bg-black/60 border border-white/20 flex items-center justify-center
                                    backdrop-blur-sm">
                      <Play className="w-6 h-6 text-white fill-white ml-0.5 animate-pulse" />
                    </div>
                  </div>
                  {/* Visual progress bar at bottom of thumbnail */}
                  <div
                    className="absolute bottom-0 left-0 h-1 bg-gold transition-all ease-linear duration-[2000ms]"
                    style={{ width: progressActive ? "100%" : "0%" }}
                  />
                </>
              )}
            </>
          )}
          {!isImg && !ytId && (
            <div className="absolute inset-0 flex items-center justify-center">
              <FileText className="w-10 h-10 text-muted-foreground" />
            </div>
          )}
        </div>

        {/* Caption */}
        <div className="px-3 py-2.5 space-y-0.5">
          {row.creative.headline && (
            <div className="font-display font-semibold text-sm truncate">{row.creative.headline}</div>
          )}
          <div className="text-[11px] text-muted-foreground truncate">
            {row.creative.city} · {row.creative.category} · {row.creative.funnel}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ─── TopPerformers (root) ──────────────────────────────────────────────────
export function TopPerformers({ rows, metric, rowHeight, dateRange, onCreativeClick, exportRef }: Props) {

  const imageRows = useMemo(
    () => rows.filter(r => r.creative.creative_type === "Image"),
    [rows],
  );
  const videoRows = useMemo(
    () => rows.filter(r => r.creative.creative_type === "Video"),
    [rows],
  );

  // Collect the final ranked rows from each column for the PDF snapshot
  const imageRankedRef = useRef<Array<{ rank: number; creative: Creative; metrics: ComputedMetrics }>>([]);
  const videoRankedRef = useRef<Array<{ rank: number; creative: Creative; metrics: ComputedMetrics }>>([]);

  // ── Comparison rows ───────────────────────────────────────────────────────
  const [comparisonRows, setComparisonRows] = useState<ComparisonRowState[]>([]);

  const availableCities = useMemo(
    () => [...new Set(rows.map(r => r.creative.city).filter(Boolean))].sort() as string[],
    [rows],
  );

  const addComparisonRow = () => setComparisonRows(prev => [...prev, {
    id: crypto.randomUUID(),
    label: "compare" as const,
    left:  { city: availableCities[0] ?? null, type: "Image" },
    right: { city: availableCities[0] ?? null, type: "Video" },
  }]);

  const removeComparisonRow = (id: string) =>
    setComparisonRows(prev => prev.filter(r => r.id !== id));

  const updateComparisonLabel = (id: string, label: ComparisonRowState["label"]) =>
    setComparisonRows(prev => prev.map(r => r.id === id ? { ...r, label } : r));

  const updateComparisonCol = (id: string, side: "left" | "right", patch: Partial<ComparisonCol>) =>
    setComparisonRows(prev => prev.map(r =>
      r.id === id ? { ...r, [side]: { ...r[side], ...patch } } : r
    ));

  const RANK_LABEL: Record<Props["metric"], string> = {
    ctr: "CTR", conversions: "Conversions", cpc: "CPC", cpa: "CPA",
  };

  const handleExportPdf = async () => {
    await exportTopPerformersPdf({
      imageRows: imageRankedRef.current,
      videoRows: videoRankedRef.current,
      rankMetric: metric,
      rankLabel:  RANK_LABEL[metric],
      dateRange,
      rowHeightPx: rowHeight,
    });
  };

  if (exportRef) exportRef.current = handleExportPdf;

  return (
    <div className="space-y-4">

      <div className="grid lg:grid-cols-2 gap-6">
        <RankColumn
          title="Top Image Creatives"
          allRows={imageRows}
          metric={metric}
          rowHeight={rowHeight}
          previewSide="right"
          onCreativeClick={onCreativeClick}
          onRankedRowsChange={(r) => { imageRankedRef.current = r; }}
          defaultMinThreshold={200}
          defaultThresholdType="spend"
        />
        <RankColumn
          title="Top Video Creatives"
          allRows={videoRows}
          metric={metric}
          rowHeight={rowHeight}
          previewSide="left"
          onCreativeClick={onCreativeClick}
          defaultMinThreshold={1000}
          defaultThresholdType="spend"
          onRankedRowsChange={(r) => { videoRankedRef.current = r; }}
        />
      </div>

      {/* ── Comparison rows ─────────────────────────────────────────────── */}
      {comparisonRows.map((row) => (
        <div key={row.id} className="space-y-3">
          {/* Divider with label toggle + remove button */}
          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-white/[0.06]" />
            <div className="flex items-center rounded-lg border border-white/[0.08] p-0.5 shrink-0 gap-0.5">
              {([
                { value: "compare",    text: "Compare"    },
                { value: "city-level", text: "City Level" },
              ] as const).map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => updateComparisonLabel(row.id, opt.value)}
                  className={cn(
                    "px-2.5 py-0.5 rounded-md text-[11px] font-semibold transition-all cursor-pointer",
                    row.label === opt.value
                      ? "bg-gold/[0.15] text-gold"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {opt.text}
                </button>
              ))}
            </div>
            <div className="h-px flex-1 bg-white/[0.06]" />
            <button
              type="button"
              onClick={() => removeComparisonRow(row.id)}
              className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-red-400 transition-colors shrink-0 cursor-pointer"
            >
              <X className="w-3 h-3" />
              Remove
            </button>
          </div>

          <div className="grid lg:grid-cols-2 gap-6">
            <ComparisonColumnPanel
              col={row.left}
              rows={rows}
              metric={metric}
              rowHeight={rowHeight}
              previewSide="right"
              onCreativeClick={onCreativeClick}
              availableCities={availableCities}
              onUpdate={patch => updateComparisonCol(row.id, "left", patch)}
            />
            <ComparisonColumnPanel
              col={row.right}
              rows={rows}
              metric={metric}
              rowHeight={rowHeight}
              previewSide="left"
              onCreativeClick={onCreativeClick}
              availableCities={availableCities}
              onUpdate={patch => updateComparisonCol(row.id, "right", patch)}
            />
          </div>
        </div>
      ))}

      {/* ── Add comparison row button ─────────────────────────────────────── */}
      <button
        type="button"
        onClick={addComparisonRow}
        className="relative w-full py-4 rounded-2xl border border-dashed border-gold/20
                   hover:border-gold/45 transition-all duration-300 group overflow-hidden cursor-pointer"
      >
        {/* Shimmer sweep on hover */}
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-gold/[0.06] to-transparent
                        -translate-x-full group-hover:translate-x-full transition-transform duration-700 pointer-events-none" />
        <div className="relative flex items-center justify-center gap-3 text-sm font-semibold text-gold/50 group-hover:text-gold/90 transition-colors duration-200">
          <div className="w-6 h-6 rounded-full border border-current flex items-center justify-center shrink-0
                          group-hover:bg-gold/10 group-hover:shadow-[0_0_12px_rgba(212,175,55,0.25)] transition-all duration-300">
            <Plus className="w-3.5 h-3.5" />
          </div>
          <span>Add City Comparison</span>
          <span className="text-[11px] font-normal text-muted-foreground/60 group-hover:text-gold/40 transition-colors duration-200">
            · compare any city &amp; format side by side
          </span>
        </div>
      </button>
    </div>
  );
}


// ─── RankColumn ────────────────────────────────────────────────────────────
function RankColumn({
  title,
  allRows,
  metric,
  rowHeight,
  previewSide,
  onCreativeClick,
  onRankedRowsChange,
  defaultMinThreshold = 100,
  defaultThresholdType = "impressions",
}: {
  title: string;
  allRows: Row[];
  metric: Props["metric"];
  rowHeight: number;
  previewSide: "left" | "right";
  onCreativeClick: (c: Creative) => void;
  onRankedRowsChange?: (rows: Array<{ rank: number; creative: Creative; metrics: ComputedMetrics }>) => void;
  defaultMinThreshold?: number;
  defaultThresholdType?: ThresholdType;
}) {
  const [topN, setTopN] = useState<number>(5);
  const [hoveredRow, setHoveredRow] = useState<Row | null>(null);
  const columnRef = useRef<HTMLDivElement>(null);

  // ─ Per-column independent threshold state ──────────────────────────────────────
  const [minThreshold, setMinThreshold] = useState<number>(defaultMinThreshold);
  const [thresholdType, setThresholdType] = useState<ThresholdType>(defaultThresholdType);
  const [uniqueMode, setUniqueMode] = useState(true);

  const handleThresholdTypeChange = (t: ThresholdType) => {
    setThresholdType(t);
    setMinThreshold(t === "spend" ? defaultMinThreshold : 100);
  };

  // Deduplicate by creative URL — aggregate raw metrics, then recompute KPIs
  const deduplicatedRows = useMemo(() => {
    if (!uniqueMode) return allRows;

    const grouped = new Map<string, Row[]>();
    for (const row of allRows) {
      const url = row.creative.creative_url;
      if (!grouped.has(url)) grouped.set(url, []);
      grouped.get(url)!.push(row);
    }

    return [...grouped.values()].map(group => {
      if (group.length === 1) return group[0];

      // Sort group by spend so the best-performing city comes first
      const bySpend = [...group].sort((a, b) => b.metrics.cost - a.metrics.cost);
      const rep = bySpend[0];

      // Unique cities in spend-rank order (best city first)
      const cities = [...new Set(bySpend.map(r => r.creative.city).filter(Boolean))];

      const agg = computeMetrics({
        impressions: group.reduce((s, r) => s + r.metrics.impressions, 0),
        clicks:      group.reduce((s, r) => s + r.metrics.clicks, 0),
        cost:        group.reduce((s, r) => s + r.metrics.cost, 0),
        conversions: group.reduce((s, r) => s + r.metrics.conversions, 0),
      });

      const creative = cities.length > 1
        ? { ...rep.creative, city: cities.join(" · ") }
        : rep.creative;

      return { creative, metrics: agg };
    });
  }, [allRows, uniqueMode]);

  const rows = useMemo(
    () => rank(deduplicatedRows, metric, topN, minThreshold, thresholdType),
    [deduplicatedRows, metric, topN, minThreshold, thresholdType],
  );

  // Notify parent with ranked rows (for PDF export)
  useEffect(() => {
    onRankedRowsChange?.(rows.map((r, i) => ({ rank: i + 1, creative: r.creative, metrics: r.metrics })));
  }, [rows, onRankedRowsChange]);

  // Derive thumbnail dimensions from rowHeight
  const thumbH = Math.max(40, Math.min(160, Math.round(rowHeight * 0.5)));
  const thumbW = Math.round(thumbH * (5 / 3));
  const iconBox = Math.max(36, Math.min(80, Math.round(rowHeight * 0.5)));
  const iconSize = Math.max(14, Math.min(28, Math.round(rowHeight * 0.22)));

  const handleMouseLeave = useCallback(() => setHoveredRow(null), []);

  return (
    <div ref={columnRef} className="glass rounded-2xl p-5">
      {/* Column header: [N▾] [Title]  [by CTR]  [Min Impr▾] */}
      <h3 className="font-display font-semibold text-lg mb-4 flex items-center gap-2 min-w-0">
        <span className="w-1 h-5 bg-gold-gradient rounded-full shrink-0" />
        <TopNDropdown value={topN} onChange={setTopN} />
        <span className="truncate min-w-0 flex-1">{title}</span>
        <span className="text-xs text-muted-foreground shrink-0">by {metricLabel[metric]}</span>
        {/* Per-column threshold pill — lives in the header */}
        <ThresholdPill
          value={minThreshold}
          thresholdType={thresholdType}
          onChange={setMinThreshold}
          onTypeChange={handleThresholdTypeChange}
        />
        {/* Unique toggle — merges duplicates by URL */}
        <button
          type="button"
          onClick={() => setUniqueMode(m => !m)}
          title="Aggregate creatives with the same URL across campaigns, cities & ad groups"
          className={cn(
            "flex items-center gap-1 h-6 px-2 rounded-md border text-[10px] font-semibold transition-all cursor-pointer shrink-0",
            uniqueMode
              ? "border-gold/40 bg-gold/[0.12] text-gold"
              : "border-white/10 bg-white/[0.03] text-muted-foreground hover:text-foreground hover:border-white/20",
          )}
        >
          <Fingerprint className="w-3 h-3 shrink-0" />
          Unique
        </button>
      </h3>

      {rows.length === 0 && (
        <div className="text-sm text-muted-foreground py-8 text-center">
          No creatives meet the current {thresholdType === "spend" ? "spend" : "impressions"} threshold.
        </div>
      )}

      <div className="space-y-2">
        {rows.map((r, idx) => {
          const m = medals[idx] ?? { icon: Award, color: "text-muted-foreground", bg: "bg-muted", label: `${idx + 1}` };
          const Icon = m.icon;
          const ytId = r.creative.creative_type === "Video" ? getYouTubeId(r.creative.creative_url) : null;
          const isHovered = hoveredRow?.creative.creative_id === r.creative.creative_id;

          return (
            <div
              key={r.creative.creative_id}
              onClick={() => onCreativeClick(r.creative)}
              onMouseLeave={handleMouseLeave}
              className="flex gap-3 p-3 rounded-xl bg-accent/30 hover:bg-accent/60 transition
                         border border-transparent hover:border-gold/30 cursor-pointer group"
              style={{ minHeight: rowHeight * 0.6 }}
            >
              {/* Medal */}
              <div
                className={`shrink-0 rounded-lg ${m.bg} flex items-center justify-center`}
                style={{ width: iconBox, height: iconBox }}
              >
                <Icon style={{ width: iconSize, height: iconSize }} className={m.color} />
              </div>

              {/* Thumbnail — hover triggers preview */}
              <div
                className="shrink-0 rounded-lg overflow-hidden bg-muted relative border border-white/5 flex items-center justify-center"
                style={{
                  height: thumbH,
                  width: r.creative.creative_type === "Image" && r.creative.creative_url ? "auto" : thumbW,
                  maxWidth: thumbH * 2,
                }}
                onMouseEnter={() => setHoveredRow(r)}
              >
                {r.creative.creative_type === "Image" && r.creative.creative_url && (
                  <img
                    src={r.creative.creative_url}
                    alt=""
                    className="h-full w-auto object-contain transition-transform"
                    style={{ maxHeight: thumbH, maxWidth: thumbH * 2 }}
                  />
                )}
                {ytId && (
                  <>
                    <img src={`https://img.youtube.com/vi/${ytId}/mqdefault.jpg`} alt="" className="w-full h-full object-cover" />
                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <div className="w-7 h-7 rounded-full bg-black/60 flex items-center justify-center">
                        <Play className="w-3.5 h-3.5 text-white fill-white ml-0.5" />
                      </div>
                    </div>
                  </>
                )}
                {!r.creative.creative_url && !ytId && (
                  <div className="w-full h-full flex items-center justify-center" style={{ width: thumbW }}>
                    <FileText className="w-4 h-4 text-muted-foreground" />
                  </div>
                )}
                {/* Hover indicator ring */}
                {isHovered && (
                  <div className="absolute inset-0 rounded-lg ring-2 ring-gold/60 pointer-events-none" />
                )}
              </div>

              {/* Text info */}
              <div className="flex-1 min-w-0 flex flex-col justify-center gap-1">
                <div className="font-display font-bold text-[14px] leading-tight truncate group-hover:text-gold transition-colors">
                  {r.creative.headline}
                </div>
                {/* Row 1: Location */}
                <div className="flex items-center gap-1 text-[11px]">
                  <MapPin className="w-3 h-3 shrink-0 text-white/35" />
                  <span className="font-semibold text-white/85 truncate">
                    {r.creative.city || "—"}
                  </span>
                </div>

                {/* Row 2: Funnel · Campaign Type */}
                {(r.creative.funnel || r.creative.campaign_type) && (
                  <div className="flex items-center gap-2 text-[11px]">
                    {r.creative.funnel && (
                      <span className="flex items-center gap-1 min-w-0">
                        <Filter className="w-3 h-3 shrink-0 text-white/35" />
                        <span className="font-medium text-white/75 truncate">{r.creative.funnel}</span>
                      </span>
                    )}
                    {r.creative.funnel && r.creative.campaign_type && (
                      <span className="text-white/20 shrink-0">·</span>
                    )}
                    {r.creative.campaign_type && (
                      <span className="flex items-center gap-1 min-w-0">
                        <Tag className="w-3 h-3 shrink-0 text-white/35" />
                        <span className="font-medium text-white/75 truncate">{r.creative.campaign_type}</span>
                      </span>
                    )}
                  </div>
                )}
                {r.creative.creative_url && (
                  <a
                    href={r.creative.creative_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={e => e.stopPropagation()}
                    title={r.creative.creative_url}
                    className="inline-flex items-center gap-1.5 text-[11px] font-medium text-blue-400/80 hover:text-blue-400 hover:underline transition-colors leading-tight w-fit mt-0.5"
                  >
                    Link <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>

              {/* ── Metric column (right side) ───────────────────────────────── */}
              <div className="text-right shrink-0 flex flex-col justify-center gap-1.5">

                {/* Labels + Values as side-by-side column stacks: [CPC col] [Rank metric col] */}
                <div className="flex items-end justify-end gap-4">
                  {/* CPC column — label on top, value below */}
                  {metric !== "cpc" && (
                    <div className="flex flex-col items-center gap-0.5">
                      <span className="text-[11px] font-semibold text-muted-foreground/80 uppercase tracking-wider leading-none">CPC</span>
                      <button
                        type="button"
                        onClick={e => { e.stopPropagation(); void copyText(fmtINR(r.metrics.cpc)); }}
                        className="font-display font-bold text-gold tabular-nums cursor-copy text-base leading-tight"
                        title="CPC — click to copy"
                      >
                        {fmtINR(r.metrics.cpc)}
                      </button>
                    </div>
                  )}

                  {/* Primary rank metric column — label on top, value below */}
                  <div className="flex flex-col items-center gap-0.5">
                    <span className="text-[11px] font-semibold text-muted-foreground/80 uppercase tracking-wider leading-none">{metricLabel[metric]}</span>
                    <button
                      type="button"
                      onClick={e => { e.stopPropagation(); void copyText(metricFmt[metric](r.metrics[metric])); }}
                      className="font-display font-bold text-gold tabular-nums cursor-copy text-base leading-tight"
                      title={`${metricLabel[metric]} — click to copy`}
                    >
                      {metricFmt[metric](r.metrics[metric])}
                    </button>
                  </div>
                </div>

                {/* Separator */}
                <div className="h-px bg-white/[0.06]" />

                {/* Cost + Impr — one row, larger and bolder */}
                <div className="flex items-center justify-end gap-2.5">
                  <button
                    type="button"
                    onClick={e => { e.stopPropagation(); void copyText(fmtINR0(r.metrics.cost)); }}
                    className="text-[12px] font-semibold text-muted-foreground cursor-copy leading-tight whitespace-nowrap"
                    title="Cost — click to copy"
                  >
                    Cost {fmtINR0(r.metrics.cost)}
                  </button>
                  <span className="text-[11px] text-muted-foreground/30 font-bold">·</span>
                  <button
                    type="button"
                    onClick={e => { e.stopPropagation(); void copyText(fmtNum(r.metrics.impressions)); }}
                    className="text-[12px] font-semibold text-muted-foreground cursor-copy leading-tight whitespace-nowrap"
                    title="Impressions — click to copy"
                  >
                    Impr {fmtNum(r.metrics.impressions)}
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Hover Preview Portal */}
      {hoveredRow && (
        <HoverPreview row={hoveredRow} side={previewSide} anchorRef={columnRef} />
      )}
    </div>
  );
}

// ─── ComparisonColumnPanel ─────────────────────────────────────────────────
function ComparisonColumnPanel({
  col, rows, metric, rowHeight, previewSide, onCreativeClick, availableCities, onUpdate,
}: {
  col: ComparisonCol;
  rows: Row[];
  metric: Props["metric"];
  rowHeight: number;
  previewSide: "left" | "right";
  onCreativeClick: (c: Creative) => void;
  availableCities: string[];
  onUpdate: (patch: Partial<ComparisonCol>) => void;
}) {
  const filtered = useMemo(
    () => rows.filter(r =>
      r.creative.creative_type === col.type &&
      (col.city === null || r.creative.city === col.city)
    ),
    [rows, col.city, col.type],
  );

  const title = `${col.city ?? "All Cities"} · ${col.type === "Image" ? "Static" : "Video"}`;

  return (
    <div className="space-y-3">
      {/* Config row: city selector + Image/Video toggle */}
      <div className="flex items-center gap-2">
        <Select
          value={col.city ?? "__all__"}
          onValueChange={v => onUpdate({ city: v === "__all__" ? null : v })}
        >
          <SelectTrigger className="h-8 text-xs flex-1 min-w-0">
            <SelectValue placeholder="All Cities" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All Cities</SelectItem>
            {availableCities.map(c => (
              <SelectItem key={c} value={c}>{c}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex rounded-lg border border-white/10 overflow-hidden shrink-0">
          {(["Image", "Video"] as const).map(t => (
            <button
              key={t}
              type="button"
              onClick={() => onUpdate({ type: t })}
              className={cn(
                "px-3 h-8 text-xs font-medium transition-all cursor-pointer",
                col.type === t
                  ? "bg-gold-gradient text-[#2a1800]"
                  : "text-muted-foreground hover:text-foreground hover:bg-white/[0.05]",
              )}
            >
              {t === "Image" ? "Static" : "Video"}
            </button>
          ))}
        </div>
      </div>

      <RankColumn
        key={col.type}
        title={title}
        allRows={filtered}
        metric={metric}
        rowHeight={rowHeight}
        previewSide={previewSide}
        onCreativeClick={onCreativeClick}
        defaultMinThreshold={col.type === "Image" ? 200 : 1000}
        defaultThresholdType="spend"
      />
    </div>
  );
}
