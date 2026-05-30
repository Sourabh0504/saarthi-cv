import { useMemo, useState, useRef, useEffect } from "react";
import { ChevronRight, Video as VideoIcon, FileText, Sparkles, ExternalLink, ArrowUpDown, ArrowDownUp } from "lucide-react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { Creative } from "@/lib/api";
import { computeMetrics, fmtINR, fmtINR0, fmtNum, fmtPct, type ComputedMetrics } from "@/lib/metrics";
import { type Dim, DIM_META } from "@/lib/hierarchy";
import { cn, copyText } from "@/lib/utils";

interface Row {
  creative: Creative;
  metrics:  ComputedMetrics;
}

interface Props {
  rows:              Row[];
  visibleCols:       Record<string, boolean>;
  hierarchy:         Dim[];
  structureOnly?:    boolean;
  creativeRowHeight?: number;
  onCreativeClick?:  (creative: Creative) => void;
  sortBy?:           string | null;
  onSortByChange?:   (v: string | null) => void;
  // Compare mode
  compareMode?:      boolean;
  compareMetrics?:   Map<string, ComputedMetrics>; // per creative_id
  compareTotals?:    ComputedMetrics;              // for TOTAL strip
}

interface AggNode {
  key:             string;
  label:           string;
  depth:           number;
  dim:             Dim | "creative";
  metrics:         ComputedMetrics;
  compareMetrics?: ComputedMetrics; // compare-period aggregate for this node
  count:           number;
  children?:       AggNode[];
  creative?:       Creative;
  share?:          number; // % of cost within peer group at same level (0–100)
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function aggregate(rows: Row[]): ComputedMetrics {
  const t = { impressions: 0, clicks: 0, cost: 0, conversions: 0 };
  for (const r of rows) {
    t.impressions += r.metrics.impressions;
    t.clicks      += r.metrics.clicks;
    t.cost        += r.metrics.cost;
    t.conversions += r.metrics.conversions;
  }
  return computeMetrics(t);
}

function aggregateCmp(rows: Row[], map?: Map<string, ComputedMetrics>): ComputedMetrics | undefined {
  if (!map) return undefined;
  const t = { impressions: 0, clicks: 0, cost: 0, conversions: 0 };
  let any = false;
  for (const r of rows) {
    const m = map.get(r.creative.creative_id);
    if (!m) continue;
    any = true;
    t.impressions += m.impressions;
    t.clicks      += m.clicks;
    t.cost        += m.cost;
    t.conversions += m.conversions;
  }
  return any ? computeMetrics(t) : undefined;
}

function pctDelta(current: number, prev: number | undefined): number | null {
  if (!prev || prev === 0) return null;
  return ((current - prev) / Math.abs(prev)) * 100;
}

function buildTree(
  rows:       Row[],
  hierarchy:  Dim[],
  sortBy:     string | null,
  cmpMap?:    Map<string, ComputedMetrics>,
): AggNode[] {
  const sortNodes = (nodes: AggNode[]) => {
    if (sortBy) {
      nodes.sort((a, b) => ((b.metrics as Record<string, number>)[sortBy] ?? 0) - ((a.metrics as Record<string, number>)[sortBy] ?? 0));
    } else {
      nodes.sort((a, b) => a.label.localeCompare(b.label));
    }
    return nodes;
  };

  // Share = each node's cost / sum-of-siblings' cost × 100
  const assignShare = (nodes: AggNode[]) => {
    const total = nodes.reduce((s, n) => s + n.metrics.cost, 0);
    for (const n of nodes) {
      n.share = total > 0 ? (n.metrics.cost / total) * 100 : 0;
    }
  };

  const build = (items: Row[], depth: number, parentKey: string): AggNode[] => {
    if (depth >= hierarchy.length) {
      const leaves = items.map(r => ({
        key:            `${parentKey}>${r.creative.creative_id}`,
        label:          r.creative.headline ?? r.creative.creative_id,
        depth,
        dim:            "creative" as const,
        metrics:        r.metrics,
        compareMetrics: cmpMap?.get(r.creative.creative_id),
        count:          1,
        creative:       r.creative,
      }));
      assignShare(leaves);
      return sortNodes(leaves);
    }
    const dim    = hierarchy[depth];
    const getter = DIM_META[dim].get;
    const map    = new Map<string, Row[]>();
    for (const r of items) {
      const k   = getter(r.creative);
      const arr = map.get(k) ?? [];
      arr.push(r);
      map.set(k, arr);
    }
    const nodes: AggNode[] = [];
    for (const [k, list] of map) {
      const key = `${parentKey}>${dim}:${k}`;
      nodes.push({
        key,
        label:          k,
        depth,
        dim,
        metrics:        aggregate(list),
        compareMetrics: aggregateCmp(list, cmpMap),
        count:          list.length,
        children:       build(list, depth + 1, key),
      });
    }
    assignShare(nodes);
    return sortNodes(nodes);
  };
  return build(rows, 0, "root");
}

function flattenTree(tree: AggNode[], open: Set<string>): AggNode[] {
  const out: AggNode[] = [];
  const walk = (n: AggNode) => {
    out.push(n);
    if (open.has(n.key) && n.children) n.children.forEach(walk);
  };
  tree.forEach(walk);
  return out;
}

function getYouTubeId(url: string): string | null {
  const m = url.match(/(?:youtu\.be\/|v=|embed\/)([\w-]{11})/);
  return m ? m[1] : null;
}

function CreativeThumb({ creative, size }: { creative: Creative; size: number }) {
  // Height is fixed at `size`; width is natural (aspect-ratio-aware), capped at 2× height.
  const maxW = size * 2;

  if (creative.creative_type === "Image") {
    if (!creative.creative_url) {
      return (
        <div
          style={{ width: size, height: size }}
          className="rounded-lg border border-border bg-accent shrink-0 flex items-center justify-center"
        >
          <FileText className="text-muted-foreground" style={{ width: size * 0.4, height: size * 0.4 }} />
        </div>
      );
    }
    return (
      <img
        src={creative.creative_url}
        alt={creative.headline ?? ""}
        style={{ height: size, width: "auto", maxWidth: maxW }}
        loading="lazy"
        className="rounded-lg object-contain border border-border shrink-0 shadow-card transition-transform"
      />
    );
  }

  if (creative.creative_type === "Video") {
    const id = getYouTubeId(creative.creative_url);
    // hqdefault thumbnails are 4:3 — natural width = size × (4/3)
    const videoW = Math.min(Math.round(size * (4 / 3)), maxW);
    return (
      <div
        style={{ height: size, width: videoW }}
        className="rounded-lg overflow-hidden border border-border shrink-0 relative bg-black shadow-card"
      >
        {id && (
          <img
            src={`https://i.ytimg.com/vi/${id}/hqdefault.jpg`}
            alt=""
            loading="lazy"
            className="w-full h-full object-contain"
          />
        )}
        <div className="absolute inset-0 flex items-center justify-center bg-black/30">
          <VideoIcon className="text-white" style={{ width: size * 0.25, height: size * 0.25 }} />
        </div>
      </div>
    );
  }

  // Text creatives — keep square
  return (
    <div
      style={{ width: size, height: size }}
      className="rounded-lg border border-border bg-accent shrink-0 flex items-center justify-center"
    >
      <FileText className="text-muted-foreground" style={{ width: size * 0.4, height: size * 0.4 }} />
    </div>
  );
}

const COL_DEFS: Array<{ key: string; label: string; render: (m: ComputedMetrics) => string }> = [
  { key: "impressions", label: "Impr.",  render: m => fmtNum(m.impressions) },
  { key: "clicks",      label: "Clicks", render: m => fmtNum(m.clicks) },
  { key: "cost",        label: "Spend",  render: m => fmtINR0(m.cost) },
  { key: "conversions", label: "Conv.",  render: m => m.conversions.toFixed(1) },
  { key: "ctr",         label: "CTR",    render: m => fmtPct(m.ctr) },
  { key: "cpc",         label: "CPC",    render: m => fmtINR(m.cpc) },
  { key: "cpm",         label: "CPM",    render: m => fmtINR(m.cpm) },
  { key: "cr",          label: "CR",     render: m => fmtPct(m.cr) },
  { key: "cpa",         label: "CPA",    render: m => fmtINR(m.cpa) },
];

function CopyableValue({ text, className }: { text: string; className?: string }) {
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); void copyText(text); }}
      className={cn("w-full text-right cursor-copy", className)}
      title="Click to copy"
    >
      {text}
    </button>
  );
}

// Renders the main value + optional compare delta for one metric cell
function MetricCell({
  colKey, value, cmpValue, compareMode, bold, accentCost,
}: {
  colKey:      string;
  value:       string;
  cmpValue?:   string;
  compareMode: boolean;
  bold?:       boolean;
  accentCost?: boolean;
}) {
  const delta = useMemo(() => {
    if (!compareMode || !cmpValue) return null;
    const curr = parseFloat(value.replace(/[^\d.-]/g, ""));
    const prev = parseFloat(cmpValue.replace(/[^\d.-]/g, ""));
    return pctDelta(curr, prev);
  }, [compareMode, value, cmpValue]);

  return (
    <div className="text-right">
      <CopyableValue
        text={value}
        className={cn(
          bold && "font-display font-bold",
          accentCost && colKey === "cost" ? "text-gold" : "",
        )}
      />
      {delta !== null && (
        <div className={cn(
          "text-[10px] font-normal tabular-nums mt-px",
          delta > 0  ? "text-emerald-400"
          : delta < 0 ? "text-red-400"
          : "text-muted-foreground/60",
        )}>
          ({delta > 0 ? "+" : ""}{delta.toFixed(1)}%)
        </div>
      )}
    </div>
  );
}

interface HoverState { creative: Creative; x: number; y: number; }

function ShareCell({ share, bold }: { share: number; bold?: boolean }) {
  return (
    <div className="space-y-1.5">
      <CopyableValue
        text={share.toFixed(1) + "%"}
        className={cn(bold && "font-display font-bold")}
      />
      <div className="w-full h-[3px] rounded-full bg-white/[0.06] overflow-hidden">
        <div
          className="h-full rounded-full bg-gold-gradient"
          style={{ width: `${Math.min(100, share)}%` }}
        />
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function DirectoryTree({
  rows,
  visibleCols,
  hierarchy,
  structureOnly    = false,
  creativeRowHeight = 64,
  onCreativeClick,
  sortBy: sortByProp,
  onSortByChange,
  compareMode    = false,
  compareMetrics,
  compareTotals,
}: Props) {
  const [internalSortBy, setInternalSortBy] = useState<string | null>(null);
  const sortBy   = sortByProp ?? internalSortBy;
  const setSortBy = onSortByChange ?? setInternalSortBy;

  const tree       = useMemo(() => buildTree(rows, hierarchy, sortBy, compareMode ? compareMetrics : undefined), [rows, hierarchy, sortBy, compareMode, compareMetrics]);
  const grandTotal = useMemo(() => aggregate(rows), [rows]);
  const totalCreatives = rows.length;

  const [open, setOpen]           = useState<Set<string>>(new Set());
  const [hover, setHover]         = useState<HoverState | null>(null);
  const [activeLevel, setActiveLevel] = useState<number>(1); // 0 = top only, 1 = +1 below, …
  const scrollRef = useRef<HTMLDivElement>(null);

  // Reset drill depth when hierarchy order changes
  useEffect(() => { setActiveLevel(1); }, [hierarchy]);

  // Expand tree to exactly `activeLevel` depth on every change
  useEffect(() => {
    const s = new Set<string>();
    const walk = (nodes: AggNode[], depth: number) => {
      for (const n of nodes) {
        if (depth < activeLevel && n.children?.length) {
          s.add(n.key);
          walk(n.children, depth + 1);
        }
      }
    };
    walk(tree, 0);
    setOpen(s);
  }, [activeLevel, tree]);

  const cols      = structureOnly ? [] : COL_DEFS.filter(c => visibleCols[c.key]);
  const showShare = !structureOnly && !!visibleCols.share_pct;
  const toggle = (k: string) => {
    setOpen(prev => { const n = new Set(prev); n.has(k) ? n.delete(k) : n.add(k); return n; });
  };
  const thumbSize   = Math.max(40, Math.min(200, creativeRowHeight));

  const flat = useMemo(() => flattenTree(tree, open), [tree, open]);

  // Group rows are taller when compare deltas are showing
  const groupRowH = compareMode ? 58 : 44;

  const estimateSize = (index: number) => {
    const n = flat[index];
    if (!n) return groupRowH;
    return n.dim === "creative" ? thumbSize + 16 : groupRowH;
  };

  const virtualizer = useVirtualizer({
    count:           flat.length,
    getScrollElement: () => scrollRef.current,
    estimateSize,
    overscan:        8,
    getItemKey:      (i) => flat[i]?.key ?? i,
  });

  useEffect(() => { virtualizer.measure(); }, [thumbSize, compareMode, virtualizer]);

  const indentPx = (depth: number) => 12 + depth * 22;

  const onThumbEnter = (e: React.MouseEvent, creative: Creative) => setHover({ creative, x: e.clientX, y: e.clientY });
  const onThumbMove  = (e: React.MouseEvent, creative: Creative) => setHover({ creative, x: e.clientX, y: e.clientY });
  const onThumbLeave = () => setHover(null);

  if (!tree.length) return null;

  let hoverStyle: React.CSSProperties | null = null;
  if (hover) {
    const PREV_W = 480; const PREV_H = 480; const pad = 16;
    let left = hover.x + 24;
    let top  = hover.y - PREV_H / 2;
    if (typeof window !== "undefined") {
      if (left + PREV_W + pad > window.innerWidth)  left = hover.x - PREV_W - 24;
      if (top < pad)                                top  = pad;
      if (top + PREV_H + pad > window.innerHeight)  top  = window.innerHeight - PREV_H - pad;
    }
    hoverStyle = { left, top, width: PREV_W };
  }

  const metricColWidth = 120;
  const shareColWidth  = 100;
  const colTemplate = [
    "minmax(280px, 1fr)",
    ...cols.map(() => `minmax(${metricColWidth}px, ${metricColWidth}px)`),
    ...(showShare ? [`minmax(${shareColWidth}px, ${shareColWidth}px)`] : []),
  ].join(" ");
  const minTableWidth = 280 + cols.length * metricColWidth + (showShare ? shareColWidth : 0);

  const items     = virtualizer.getVirtualItems();
  const totalSize = virtualizer.getTotalSize();

  return (
    <div className="glass rounded-2xl overflow-hidden relative">
      <div className="overflow-x-auto">
        <div style={{ minWidth: minTableWidth }}>

          {/* ── Column header ─────────────────────────────────────────────── */}
          <div
            className="bg-background/80 backdrop-blur-xl border-b border-white/10 sticky top-0 z-20 grid items-center"
            style={{ gridTemplateColumns: colTemplate }}
          >
            {/* ── Clickable drill-depth breadcrumb ── */}
            <div className="py-2.5 px-3 flex items-center overflow-hidden whitespace-nowrap min-w-0">
              {hierarchy.map((dim, i) => {
                const active = activeLevel === i;
                return (
                  <span key={dim} className="flex items-center shrink-0">
                    <button
                      type="button"
                      onClick={() => setActiveLevel(i)}
                      title={i === 0 ? `Show ${DIM_META[dim].label} only` : `Expand to ${DIM_META[dim].label}`}
                      className={cn(
                        "text-[9px] uppercase tracking-widest font-semibold transition-all duration-150",
                        active ? "text-gold" : "text-white/30 hover:text-white/60",
                      )}
                      style={undefined}
                    >
                      {DIM_META[dim].label}
                    </button>
                    <span className="text-white/15 text-[9px] mx-1 select-none">›</span>
                  </span>
                );
              })}
              {(() => {
                const active = activeLevel === hierarchy.length;
                return (
                  <button
                    type="button"
                    onClick={() => setActiveLevel(hierarchy.length)}
                    title="Expand all levels to creatives"
                    className={cn(
                      "text-[9px] uppercase tracking-widest font-semibold transition-all duration-150 shrink-0",
                      active ? "text-gold" : "text-white/30 hover:text-white/60",
                    )}
                    style={undefined}
                  >
                    Creative
                  </button>
                );
              })()}
            </div>
            {cols.map(c => (
              <button
                key={c.key}
                type="button"
                onClick={() => setSortBy(sortBy === c.key ? null : c.key)}
                className={cn(
                  "py-2.5 px-3 flex items-center justify-end gap-1.5 text-[10px] uppercase tracking-widest font-semibold whitespace-nowrap w-full transition-colors duration-150",
                  sortBy === c.key ? "text-gold" : "text-muted-foreground hover:text-foreground",
                )}
                title={sortBy === c.key ? "Click to reset sort" : `Sort by ${c.label}`}
              >
                {c.label}
                {sortBy === c.key
                  ? <ArrowDownUp className="w-3 h-3 shrink-0" />
                  : <ArrowUpDown className="w-3 h-3 shrink-0 opacity-30 group-hover:opacity-60" />}
              </button>
            ))}
            {showShare && (
              <div className="py-2.5 px-3 text-right text-[10px] uppercase tracking-widest font-semibold text-muted-foreground whitespace-nowrap">
                % Share
              </div>
            )}
          </div>

          {/* ── TOTAL strip ───────────────────────────────────────────────── */}
          <div
            className="border-b-2 border-gold/40 grid items-center"
            style={{
              gridTemplateColumns: colTemplate,
              backgroundImage: "linear-gradient(90deg, color-mix(in oklab, var(--gold) 14%, transparent), color-mix(in oklab, var(--gold) 6%, transparent))",
            }}
          >
            <div className="py-2.5 px-3">
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-gold" />
                {structureOnly
                  ? <span className="font-display font-bold text-sm tracking-tight text-gold">CREATIVE STRUCTURE</span>
                  : <span className="font-display font-bold text-sm tracking-tight text-gold">TOTAL</span>}
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gold/15 border border-gold/30 text-gold">
                  {totalCreatives} creatives
                </span>
              </div>
            </div>
            {!structureOnly && cols.map(c => (
              <div key={c.key} className="py-2.5 px-3 tabular-nums whitespace-nowrap">
                <MetricCell
                  colKey={c.key}
                  value={c.render(grandTotal)}
                  cmpValue={compareTotals ? c.render(compareTotals) : undefined}
                  compareMode={compareMode}
                  bold
                  accentCost
                />
              </div>
            ))}
            {showShare && (
              <div className="py-2.5 px-3 tabular-nums whitespace-nowrap">
                <ShareCell share={100} bold />
              </div>
            )}
          </div>

          {/* ── Virtualized body ──────────────────────────────────────────── */}
          <div
            ref={scrollRef}
            className="overflow-y-auto"
            style={{ maxHeight: "calc(100vh - 280px)", minHeight: 400 }}
          >
            <div style={{ height: totalSize, position: "relative", width: "100%" }}>
              {items.map(vi => {
                const node = flat[vi.index];
                if (!node) return null;
                const isOpen      = open.has(node.key);
                const hasChildren = !!node.children?.length;
                const isCreative  = node.dim === "creative";
                const isTop       = node.depth === 0;
                const isSecond    = node.depth === 1;
                const Icon = isCreative ? Sparkles : DIM_META[node.dim as Dim].icon;

                return (
                  <div
                    key={vi.key}
                    data-index={vi.index}
                    ref={virtualizer.measureElement}
                    style={{
                      position: "absolute",
                      top: 0, left: 0,
                      width: "100%",
                      transform: `translateY(${vi.start}px)`,
                      gridTemplateColumns: colTemplate,
                    }}
                    className={cn(
                      "grid items-center border-b border-white/5 transition-all duration-300 group",
                      isTop    && "bg-gold/[0.04] hover:bg-gold/[0.08] border-l-4 border-l-gold",
                      isSecond && "bg-white/[0.02] hover:bg-white/[0.05]",
                      !isTop && !isSecond && !isCreative && "hover:bg-white/[0.04] hover:pl-1",
                      isCreative && "hover:bg-gold/[0.05] cursor-pointer hover:pl-1",
                      hasChildren && "cursor-pointer",
                    )}
                    onClick={
                      hasChildren
                        ? () => toggle(node.key)
                        : isCreative && node.creative && onCreativeClick
                        ? () => onCreativeClick(node.creative!)
                        : undefined
                    }
                  >
                    {/* ── Label cell ────────────────────────────────────── */}
                    <div className="py-2.5 pr-3 flex items-center gap-3 min-w-0" style={{ paddingLeft: indentPx(node.depth) }}>
                      <span className={cn(
                        "w-4 h-4 flex items-center justify-center text-muted-foreground transition-transform shrink-0",
                        hasChildren ? "" : "opacity-0",
                        isOpen && "rotate-90",
                      )}>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </span>
                      {isCreative && node.creative ? (
                        <div
                          onMouseEnter={(e) => onThumbEnter(e, node.creative!)}
                          onMouseMove={(e) =>  onThumbMove(e,  node.creative!)}
                          onMouseLeave={onThumbLeave}
                          className="shrink-0"
                        >
                          <CreativeThumb creative={node.creative} size={thumbSize} />
                        </div>
                      ) : (
                        <Icon className={cn("w-4 h-4 shrink-0",
                          isTop    ? "text-gold"
                          : isSecond ? "text-emerald-accent"
                          : "text-muted-foreground",
                        )} />
                      )}
                      <div className="min-w-0">
                        <div className={cn("truncate flex items-center gap-2",
                          isTop      && "font-display font-bold text-base tracking-tight",
                          isSecond   && "font-display font-semibold text-sm tracking-wide",
                          !isTop && !isSecond && !isCreative && "text-sm",
                          isCreative && "text-sm font-medium",
                        )}>
                          <span className="truncate">{node.label}</span>
                          {isCreative && node.creative?.creative_url && (
                            <a
                              href={node.creative.creative_url}
                              target="_blank" rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="text-muted-foreground hover:text-white transition-colors shrink-0"
                              title="Open creative in new tab"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                          )}
                        </div>
                        {isCreative && node.creative && (
                          <div className="text-[11px] text-muted-foreground truncate mt-0.5 flex items-center gap-1.5 flex-wrap">
                            <span className="px-1.5 py-0.5 rounded bg-white/[0.04] border border-white/10">{node.creative.creative_type}</span>
                            <span>{node.creative.city}</span>
                            <span>·</span>
                            <span>{node.creative.category}</span>
                            <span>·</span>
                            <span>{node.creative.age_group}</span>
                            <span>·</span>
                            <span className="text-gold/80">{node.creative.funnel}</span>
                          </div>
                        )}
                      </div>
                      {!isCreative && (
                        <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded-full bg-white/[0.06] border border-white/10 text-muted-foreground shrink-0">
                          {node.count}
                        </span>
                      )}
                      {isCreative && node.creative?.status === "Paused" && (
                        <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground shrink-0">Paused</span>
                      )}
                    </div>

                    {/* ── Metric cells ──────────────────────────────────── */}
                    {cols.map((c, ci) => {
                      const hasCmp = !!node.compareMetrics;
                      // For creative rows in compare mode: show "New" badge on the
                      // first metric column when the creative has no comparison data.
                      const showNewBadge =
                        compareMode && isCreative && !hasCmp && ci === 0;
                      return (
                        <div key={c.key} className={cn(
                          "py-2 px-3 tabular-nums whitespace-nowrap",
                          isTop    ? "font-display font-bold text-sm"
                          : isSecond ? "font-semibold text-sm"
                          : "text-sm",
                        )}>
                          <MetricCell
                            colKey={c.key}
                            value={c.render(node.metrics)}
                            cmpValue={hasCmp ? c.render(node.compareMetrics!) : undefined}
                            compareMode={compareMode}
                            bold={isTop}
                            accentCost={isTop}
                          />
                          {showNewBadge && (
                            <div className="text-[9px] text-blue-400/70 font-normal text-right mt-px tracking-wide uppercase">
                              new
                            </div>
                          )}
                        </div>
                      );
                    })}
                    {/* ── % Share cell ──────────────────────────────────── */}
                    {showShare && (
                      <div className={cn(
                        "py-2 px-3 tabular-nums whitespace-nowrap",
                        isTop    ? "font-display font-bold text-sm"
                        : isSecond ? "font-semibold text-sm"
                        : "text-sm",
                      )}>
                        <ShareCell share={node.share ?? 0} bold={isTop} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Virtualization footer hint */}
            <div className="px-3 py-2 text-[10px] uppercase tracking-widest text-muted-foreground/70 border-t border-white/5 flex items-center justify-between sticky bottom-0 bg-background/60 backdrop-blur">
              <span>{flat.length.toLocaleString()} rows rendered virtually</span>
              <span>{items.length} on screen</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Hover preview ─────────────────────────────────────────────────── */}
      {hover && hoverStyle && (
        <div
          className="fixed z-[100] pointer-events-none animate-in fade-in zoom-in-95 duration-150"
          style={hoverStyle}
        >
          <div className="glass-strong rounded-2xl overflow-hidden border border-gold/30 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.8)]">
            <div className="aspect-square bg-black/40 relative">
              {hover.creative.creative_type === "Image" && (
                <img src={hover.creative.creative_url} alt={hover.creative.headline ?? ""} className="w-full h-full object-cover" />
              )}
              {hover.creative.creative_type === "Video" && (() => {
                const id = getYouTubeId(hover.creative.creative_url);
                return id ? (
                  <img src={`https://i.ytimg.com/vi/${id}/maxresdefault.jpg`} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-muted-foreground">No preview</div>
                );
              })()}
              {hover.creative.creative_type === "Text" && (
                <div className="w-full h-full p-6 bg-white text-[#202124] flex flex-col justify-center gap-2">
                  <div className="text-xs flex items-center gap-1">
                    <span className="inline-block w-3 h-3 rounded-full bg-[#4285F4]" />
                    Ad · {new URL(hover.creative.creative_url).hostname}
                  </div>
                  <div className="text-[#1a0dab] text-2xl leading-tight font-medium">{hover.creative.headline}</div>
                  <p className="text-sm text-[#4d5156] leading-snug">{hover.creative.description}</p>
                </div>
              )}
            </div>
            <div className="p-3 space-y-1.5 bg-background/80">
              <div className="font-display font-semibold text-sm truncate">{hover.creative.headline ?? hover.creative.creative_id}</div>
              <div className="text-[11px] text-muted-foreground flex flex-wrap gap-1.5">
                <span className="px-1.5 py-0.5 rounded bg-white/[0.04] border border-white/10">{hover.creative.creative_type}</span>
                <span className="px-1.5 py-0.5 rounded bg-white/[0.04] border border-white/10">{hover.creative.city}</span>
                <span className="px-1.5 py-0.5 rounded bg-white/[0.04] border border-white/10">{hover.creative.category}</span>
                <span className="px-1.5 py-0.5 rounded bg-gold/10 border border-gold/30 text-gold">{hover.creative.funnel}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
