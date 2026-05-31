import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { FileDown, Sun, Moon, Check } from "lucide-react";
import type { Creative } from "@/lib/api";
import type { ComputedMetrics } from "@/lib/metrics";
import { computeMetrics, fmtINR0, fmtNum, fmtPct, fmtINR, getYouTubeId } from "@/lib/metrics";
import { DIM_META, type Dim } from "@/lib/hierarchy";
import { cn } from "@/lib/utils";

// ── Public types ───────────────────────────────────────────────────────────────

export interface ExportContext {
  dateRange:     string;
  filters:       { status: string[]; city: string[]; funnel: string[]; search: string };
  selectedCount: number;
  totalCount:    number;
  columnsLabel:  string;
  columnKeys:    string[];
  rowHeight:     number;
}

export interface ExportPick {
  theme:            "light" | "dark";
  scope:            "current" | "all";
  rowHeight:        number | null;
}

// ── Constants ──────────────────────────────────────────────────────────────────

const DENSITY_OPTS = [
  { label: "Compact",     value: 64  as number | null },
  { label: "Comfortable", value: 96  as number | null },
  { label: "Spacious",    value: 160 as number | null },
  { label: "Current",     value: null                  },
] as const;

const COL_LABELS: Record<string, string> = {
  impressions: "IMPR.", clicks: "CLICKS",   cost: "SPEND",
  conversions: "CONV.", ctr:    "CTR",       cpc:  "CPC",
  cpm:         "CPM",   cr:     "CR",         cpa:  "CPA", share_pct: "% SHARE",
};

const METRIC_FMT: Record<string, (m: ComputedMetrics) => string> = {
  impressions: m => fmtNum(m.impressions),
  clicks:      m => fmtNum(m.clicks),
  cost:        m => fmtINR0(m.cost),
  conversions: m => m.conversions.toFixed(1),
  ctr:         m => fmtPct(m.ctr),
  cpc:         m => fmtINR(m.cpc),
  cpm:         m => fmtINR(m.cpm),
  cr:          m => fmtPct(m.cr),
  cpa:         m => fmtINR(m.cpa),
  share_pct:   () => "—",
};

// ── Preview colour palettes ────────────────────────────────────────────────────

const PALETTES = {
  dark: {
    bg:        "#0a0b0f",
    header:    "#12121a",
    gold:      "#c8a350",
    goldDim:   "#6a5420",
    text:      "#f0f0f5",
    muted:     "#78798c",
    border:    "rgba(255,255,255,0.07)",
    colHeader: "#12121a",
    totalBg:   "#1c1608",
    totalBorder:"rgba(200,163,80,0.5)",
    groupBg:   ["#1c1c2a","#181820","#141419","#121216","#111115"],
    creativeBg:"#0c0c11",
    tileBg:    "#1c1c28",
    stripe:    "#c8a350",
  },
  light: {
    bg:        "#ffffff",
    header:    "#f5f3ec",
    gold:      "#b8902a",
    goldDim:   "#d4a840",
    text:      "#1a1a2e",
    muted:     "#888898",
    border:    "rgba(0,0,0,0.08)",
    colHeader: "#f5f3ec",
    totalBg:   "#fdf8ec",
    totalBorder:"rgba(200,163,80,0.4)",
    groupBg:   ["#e8e8f5","#ededf8","#f1f1fb","#f4f4fd","#f7f7ff"],
    creativeBg:"#ffffff",
    tileBg:    "#f0f0f6",
    stripe:    "#c8a350",
  },
};

// ── Density visual — mini table-row silhouette ─────────────────────────────────

function DensityVisual({ densityPx, active }: { densityPx: number; active: boolean }) {
  const h = Math.max(10, Math.min(Math.round(densityPx / 5.5), 30));
  return (
    <div className="flex items-start gap-1.5 w-full px-0.5">
      <div
        className={cn("rounded-sm flex-shrink-0 transition-all duration-200", active ? "bg-gold" : "bg-muted-foreground/30")}
        style={{ width: 13, height: h }}
      />
      <div className="flex flex-col gap-[3px] pt-1 flex-1 min-w-0">
        <div className={cn("h-[3px] rounded-full transition-colors", active ? "bg-gold/50" : "bg-muted-foreground/20")} />
        <div className={cn("h-[2px] w-3/4 rounded-full transition-colors", active ? "bg-gold/30" : "bg-muted-foreground/15")} />
      </div>
    </div>
  );
}

// ── Preview metric cells row ───────────────────────────────────────────────────

function MetricCells({ metrics, keys, C, size = 7, bold = false, goldCost = false }: {
  metrics:  ComputedMetrics;
  keys:     string[];
  C:        typeof PALETTES.dark;
  size?:    number;
  bold?:    boolean;
  goldCost?: boolean;
}) {
  return (
    <div style={{ display: "flex", flexShrink: 0 }}>
      {keys.map(key => (
        <div key={key} style={{
          width: 60, textAlign: "right",
          fontSize: size, lineHeight: "1",
          fontWeight: bold || key === "cost" ? 700 : 400,
          color: goldCost && key === "cost" ? C.gold : C.text,
          paddingRight: 6,
        }}>
          {METRIC_FMT[key]?.(metrics) ?? "—"}
        </div>
      ))}
    </div>
  );
}

// ── Table preview pane (HTML mockup matching the PDF structure) ────────────────

function TablePreviewPane({
  visibleRows, totals, context, hierarchy, theme, effectiveDensity,
}: {
  visibleRows:       Array<{ creative: Creative; metrics: ComputedMetrics }>;
  totals:            ComputedMetrics;
  context:           ExportContext;
  hierarchy:         Dim[];
  theme:             "dark" | "light";
  effectiveDensity:  number;
}) {
  const C = PALETTES[theme];
  const cols = context.columnKeys.slice(0, 5);
  const thumbH = Math.max(22, Math.min(Math.round(effectiveDensity * 0.37), 58));
  const thumbW = Math.min(thumbH * 1.7, 90);

  // Build a 2-level preview tree: top group + first creative per group
  const firstDim = hierarchy[0];
  const getVal   = firstDim ? DIM_META[firstDim].get : null;

  const previewGroups = useMemo(() => {
    if (!getVal || !visibleRows.length) return [];
    const map = new Map<string, typeof visibleRows>();
    for (const row of visibleRows) {
      const key = getVal(row.creative) || "—";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(row);
    }
    return [...map.entries()]
      .sort(([, a], [, b]) => b.reduce((s, r) => s + r.metrics.cost, 0) - a.reduce((s, r) => s + r.metrics.cost, 0))
      .slice(0, 3)
      .map(([label, rows]) => ({
        label,
        count: rows.length,
        metrics: computeMetrics(rows.reduce(
          (acc, r) => ({
            impressions: acc.impressions + r.metrics.impressions,
            clicks:      acc.clicks      + r.metrics.clicks,
            cost:        acc.cost        + r.metrics.cost,
            conversions: acc.conversions + r.metrics.conversions,
          }),
          { impressions: 0, clicks: 0, cost: 0, conversions: 0 },
        )),
        firstRow: rows[0],
      }));
  }, [visibleRows, getVal]);

  const breadcrumb = [...hierarchy.map(d => DIM_META[d].label), "Creative"].join(" · ");

  const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const fmtDate = (iso: string) => { const [y, m, d] = iso.split("-"); return `${+d} ${MONTHS[+m-1]} ${y}`; };
  const [s, e] = context.dateRange.includes(" to ") ? context.dateRange.split(" to ") : [context.dateRange, context.dateRange];

  return (
    <div style={{ background: C.bg, fontFamily: "'Poppins', sans-serif", color: C.text, fontSize: 10, lineHeight: "1.4" }}>

      {/* Gold stripe */}
      <div style={{ height: 3, background: C.gold }} />

      {/* Mini header */}
      <div style={{
        background: C.header, padding: "7px 12px",
        display: "flex", justifyContent: "space-between", alignItems: "center",
        borderBottom: `1px solid ${C.border}`,
      }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: C.gold, fontFamily: "'Montserrat', sans-serif" }}>
            CreativeVisibility
          </div>
          <div style={{ fontSize: 6, color: C.muted, marginTop: 1 }}>
            Aukera Jewellery · Campaign Performance Portal
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 7, fontWeight: 600, color: C.gold }}>{fmtDate(s)} → {fmtDate(e)}</div>
          <div style={{ fontSize: 6, color: C.muted, marginTop: 1 }}>{context.selectedCount} creatives · {context.filters.status.length ? context.filters.status.join(", ") : "All Status"}</div>
        </div>
      </div>

      {/* Column headers */}
      <div style={{
        display: "flex", alignItems: "center",
        background: C.colHeader, padding: "5px 12px",
        borderBottom: `1px solid ${C.border}`,
      }}>
        <div style={{ flex: 1, fontSize: 6, color: C.muted, textTransform: "uppercase", letterSpacing: "0.07em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {breadcrumb}
        </div>
        <div style={{ display: "flex", flexShrink: 0 }}>
          {cols.map(key => (
            <div key={key} style={{ width: 60, textAlign: "right", paddingRight: 6, fontSize: 6, color: C.gold, textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 700 }}>
              {COL_LABELS[key] ?? key}
            </div>
          ))}
        </div>
      </div>

      {/* TOTAL row */}
      <div style={{
        display: "flex", alignItems: "center",
        background: C.totalBg, padding: "5px 12px",
        borderBottom: `1px solid ${C.totalBorder}`,
        borderLeft: `3px solid ${C.gold}`,
      }}>
        <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 8, fontWeight: 700, color: C.gold, fontFamily: "'Montserrat', sans-serif", letterSpacing: "0.06em" }}>TOTAL</span>
          <span style={{
            fontSize: 6, padding: "1px 5px", borderRadius: 10,
            background: `${C.gold}25`, border: `0.5px solid ${C.gold}60`,
            color: C.gold,
          }}>{context.selectedCount} creatives</span>
        </div>
        <MetricCells metrics={totals} keys={cols} C={C} size={7.5} bold goldCost />
      </div>

      {/* Group + creative rows */}
      {previewGroups.map((group, gi) => {
        const groupBg = C.groupBg[0] ?? C.bg;
        const { creative, metrics } = group.firstRow ?? {};
        const ytId = creative?.creative_type === "Video" ? getYouTubeId(creative.creative_url) : null;
        const imgSrc = creative?.creative_type === "Image" ? creative.creative_url
          : ytId ? `https://i.ytimg.com/vi/${ytId}/mqdefault.jpg` : null;

        return (
          <div key={group.label}>
            {/* Group row */}
            <div style={{
              display: "flex", alignItems: "center",
              background: groupBg, padding: "5px 12px",
              borderBottom: `1px solid ${C.border}`,
            }}>
              <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 5, minWidth: 0 }}>
                <span style={{ fontSize: 7, color: C.muted, flexShrink: 0 }}>▶</span>
                <span style={{ fontSize: 7.5, fontWeight: 700, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{group.label}</span>
                <span style={{
                  fontSize: 6, padding: "1px 4px", borderRadius: 8, flexShrink: 0,
                  background: theme === "dark" ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.07)",
                  color: C.muted,
                }}>{group.count}</span>
              </div>
              <MetricCells metrics={group.metrics} keys={cols} C={C} size={7} bold />
            </div>

            {/* First creative row */}
            {creative && (
              <div style={{
                display: "flex", alignItems: "center",
                background: C.creativeBg, padding: `5px 12px 5px ${12 + 14}px`,
                borderBottom: `1px solid ${C.border}`,
                gap: 7,
              }}>
                {/* Thumbnail */}
                <div style={{
                  width: thumbW, height: thumbH, flexShrink: 0,
                  background: C.tileBg, borderRadius: 3, overflow: "hidden",
                  border: `0.5px solid ${C.border}`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  {imgSrc ? (
                    <img src={imgSrc} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} crossOrigin="anonymous" />
                  ) : creative.creative_type === "Text" ? (
                    <div style={{ padding: 3, fontSize: 6, color: C.gold, lineHeight: 1.3, overflow: "hidden" }}>
                      {(creative.headline || "Ad").slice(0, 20)}
                    </div>
                  ) : (
                    <span style={{ fontSize: 14, opacity: 0.3 }}>▶</span>
                  )}
                </div>

                {/* Label */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 7, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {creative.headline || creative.creative_url.replace(/^https?:\/\//, "").slice(0, 45)}
                  </div>
                  <div style={{ display: "flex", gap: 3, marginTop: 2 }}>
                    {[creative.creative_type, creative.city, creative.funnel].filter(Boolean).map((t, i) => (
                      <span key={i} style={{
                        fontSize: 5.5, padding: "1px 3.5px", borderRadius: 2,
                        background: C.tileBg, color: i === 2 ? C.gold : C.muted,
                        border: `0.5px solid ${C.border}`,
                      }}>{t}</span>
                    ))}
                  </div>
                </div>

                <MetricCells metrics={metrics} keys={cols} C={C} size={6.5} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Props ──────────────────────────────────────────────────────────────────────

interface Props {
  open:        boolean;
  onClose:     () => void;
  onPick:      (opts: ExportPick) => void;
  context:     ExportContext;
  visibleRows: Array<{ creative: Creative; metrics: ComputedMetrics }>;
  totals:      ComputedMetrics;
  hierarchy:   Dim[];
}

// ── Main component ─────────────────────────────────────────────────────────────

export function ExportModal({ open, onClose, onPick, context, visibleRows, totals, hierarchy }: Props) {
  const [scope, setScope]               = useState<"current" | "all">("current");
  const [density, setDensity]           = useState<number | null>(null);
  const [previewTheme, setPreviewTheme] = useState<"dark" | "light">("dark");
  const [hoverTheme, setHoverTheme]     = useState<"dark" | "light" | null>(null);

  useEffect(() => {
    if (!open) return;
    setScope("current");
    setDensity(null);
    setPreviewTheme("dark");
    setHoverTheme(null);
  }, [open]);

  const liveTheme        = hoverTheme ?? previewTheme;
  const effectiveDensity = density ?? context.rowHeight;
  const scopeCount       = scope === "all" ? context.totalCount : context.selectedCount;
  const extraCount       = Math.max(0, scopeCount - (visibleRows.slice(0, 3).length + 3));

  const filterSummary = useMemo(() => {
    const p: string[] = [];
    if (context.filters.status.length) p.push(context.filters.status.join(", ")); else p.push("All Status");
    if (context.filters.city.length)   p.push(`${context.filters.city.length} ${context.filters.city.length === 1 ? "city" : "cities"}`); else p.push("All Cities");
    if (context.filters.funnel.length) p.push(context.filters.funnel.join(", ")); else p.push("All Funnels");
    if (context.filters.search)        p.push(`"${context.filters.search}"`);
    return p.join("  ·  ");
  }, [context.filters]);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-2xl max-h-[92vh] overflow-y-auto p-0 gap-0 border border-border/70">

        {/* Gold top stripe */}
        <div className="h-[3px] bg-gold rounded-tl-2xl rounded-tr-2xl shrink-0" />

        {/* ── Header ────────────────────────────────────────────────────── */}
        <div className="flex items-start gap-3 px-6 pt-5 pb-4 border-b border-border/40">
          <div className="w-10 h-10 rounded-xl bg-gold/10 border border-gold/25 flex items-center justify-center shrink-0 mt-0.5">
            <FileDown className="w-5 h-5 text-gold" />
          </div>
          <div className="min-w-0">
            <DialogTitle className="font-display font-semibold text-[15px] leading-snug">
              Export Performance Report
            </DialogTitle>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Full directory table — same hierarchy, columns, and row structure as the dashboard
            </p>
          </div>
        </div>

        <div className="px-6 pt-4 pb-6 space-y-5">

          {/* ── View snapshot ─────────────────────────────────────────── */}
          <div className="rounded-xl border border-border/60 bg-background/40 overflow-hidden">
            <div className="px-4 py-2 bg-muted/30 border-b border-border/40">
              <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-medium">Current view</span>
            </div>
            <div className="px-4 py-3 space-y-2">
              <div className="flex items-center justify-between gap-4">
                <span className="text-sm font-semibold text-foreground">{context.dateRange}</span>
                <span className="text-xs text-muted-foreground shrink-0">
                  <span className="font-medium text-foreground">{context.selectedCount}</span> / {context.totalCount} creatives
                </span>
              </div>
              {context.columnKeys.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {context.columnKeys.map(k => (
                    <span key={k} className="text-[10px] px-2 py-0.5 rounded-full bg-gold/8 border border-gold/20 text-gold font-medium">
                      {COL_LABELS[k] ?? k}
                    </span>
                  ))}
                </div>
              )}
              <p className="text-[11px] text-muted-foreground">{filterSummary}</p>
            </div>
          </div>

          {/* ── Scope + Density ───────────────────────────────────────── */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-medium">Scope</div>
              <div className="grid grid-cols-2 gap-2">
                {(["current", "all"] as const).map(s => {
                  const count  = s === "current" ? context.selectedCount : context.totalCount;
                  const active = scope === s;
                  return (
                    <button key={s} onClick={() => setScope(s)}
                      className={cn(
                        "relative flex flex-col items-start gap-1 rounded-xl border px-3 py-2.5 text-left transition-all duration-150",
                        active ? "border-gold/50 bg-gold/[0.07]" : "border-border/60 bg-background/30 hover:border-border",
                      )}>
                      {active && (
                        <span className="absolute top-2 right-2 w-4 h-4 rounded-full bg-gold/15 border border-gold/40 flex items-center justify-center">
                          <Check className="w-2.5 h-2.5 text-gold" />
                        </span>
                      )}
                      <span className={cn("text-[11px] font-semibold", active ? "text-gold" : "text-foreground")}>
                        {s === "current" ? "Selected" : "All"}
                      </span>
                      <span className="text-[11px] text-muted-foreground">{count} creatives</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-medium">Row density</div>
              <div className="grid grid-cols-4 gap-1.5">
                {DENSITY_OPTS.map(opt => {
                  const val      = opt.value;
                  const active   = density === val;
                  const displayPx = val ?? context.rowHeight;
                  return (
                    <button key={String(val)} onClick={() => setDensity(val)}
                      className={cn(
                        "flex flex-col items-start justify-between rounded-xl border px-2 py-2 gap-2 transition-all duration-150",
                        active ? "border-gold/50 bg-gold/[0.07]" : "border-border/60 bg-background/30 hover:border-border",
                      )}>
                      <DensityVisual densityPx={displayPx} active={active} />
                      <div>
                        <div className={cn("text-[9px] font-medium leading-tight", active ? "text-gold" : "text-muted-foreground")}>
                          {opt.label}
                        </div>
                        <div className="text-[8px] text-muted-foreground/50 tabular-nums">{displayPx}px</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* ── PDF Preview (table layout) ────────────────────────────── */}
          <div className="rounded-xl border border-border/60 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 bg-muted/30 border-b border-border/40">
              <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-medium">PDF Preview</span>
              <div className="flex items-center rounded-lg border border-border/60 overflow-hidden text-[10px] font-medium">
                {(["dark", "light"] as const).map(t => (
                  <button key={t} onClick={() => setPreviewTheme(t)}
                    className={cn(
                      "px-2.5 py-1 flex items-center gap-1.5 transition-colors",
                      previewTheme === t ? "bg-gold/15 text-gold" : "text-muted-foreground hover:text-foreground hover:bg-muted/30",
                    )}>
                    {t === "dark" ? <Moon className="w-2.5 h-2.5" /> : <Sun className="w-2.5 h-2.5" />}
                    {t === "dark" ? "Dark" : "Light"}
                  </button>
                ))}
              </div>
            </div>

            {/* Preview window */}
            <div className="relative h-[320px] overflow-hidden">
              <div className="absolute inset-0 overflow-y-auto pointer-events-none">
                <TablePreviewPane
                  visibleRows={visibleRows}
                  totals={totals}
                  context={context}
                  hierarchy={hierarchy}
                  theme={liveTheme}
                  effectiveDensity={effectiveDensity}
                />
              </div>

              {/* Bottom fade */}
              <div className="absolute bottom-0 left-0 right-0 h-24 pointer-events-none"
                style={{
                  background: liveTheme === "dark"
                    ? "linear-gradient(to bottom, transparent, #0a0b0f 85%)"
                    : "linear-gradient(to bottom, transparent, #ffffff 85%)",
                }}
              />

              {extraCount > 0 && (
                <div className="absolute bottom-3 left-0 right-0 flex justify-center pointer-events-none">
                  <span className="text-[11px] px-3 py-1 rounded-full border"
                    style={{
                      background:  liveTheme === "dark" ? "rgba(10,11,15,0.92)" : "rgba(255,255,255,0.92)",
                      borderColor: liveTheme === "dark" ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.10)",
                      color:       liveTheme === "dark" ? "#78798c" : "#888898",
                    }}>
                    ··· and {extraCount} more rows in the full PDF
                  </span>
                </div>
              )}
            </div>

            <div className="px-4 py-2 bg-muted/20 border-t border-border/40">
              <p className="text-[10px] text-muted-foreground">
                Preview shows top groups · Hover a download button to preview that theme
              </p>
            </div>
          </div>

          {/* ── Download CTA ──────────────────────────────────────────── */}
          <div className="space-y-2">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-medium">Download as</div>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => onPick({ theme: "light", scope, rowHeight: density })}
                onMouseEnter={() => setHoverTheme("light")}
                onMouseLeave={() => setHoverTheme(null)}
                className="group rounded-xl border-2 border-border/60 p-5 bg-white text-gray-900 hover:border-gold/70 transition-all duration-200 text-left"
              >
                <Sun className="w-7 h-7 mb-3 text-amber-500 transition-transform group-hover:scale-110" />
                <div className="font-display font-semibold text-sm">Plain White</div>
                <div className="text-xs text-gray-500 mt-1">Classic client-ready report</div>
              </button>
              <button
                onClick={() => onPick({ theme: "dark", scope, rowHeight: density })}
                onMouseEnter={() => setHoverTheme("dark")}
                onMouseLeave={() => setHoverTheme(null)}
                className="group rounded-xl border-2 border-border/60 p-5 bg-[#0a0b0f] text-gray-100 hover:border-gold/70 transition-all duration-200 text-left"
              >
                <Moon className="w-7 h-7 mb-3 text-gold transition-transform group-hover:scale-110" />
                <div className="font-display font-semibold text-sm">Luxury Dark</div>
                <div className="text-xs text-gray-400 mt-1">Premium brand presentation</div>
              </button>
            </div>
          </div>

        </div>
      </DialogContent>
    </Dialog>
  );
}
