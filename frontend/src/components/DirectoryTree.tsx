import { useMemo, useState, useRef, useEffect } from "react";
import { ChevronRight, Video as VideoIcon, FileText, Sparkles } from "lucide-react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { Creative } from "@/lib/api";
import { computeMetrics, fmtINR, fmtINR0, fmtNum, fmtPct, type ComputedMetrics } from "@/lib/metrics";
import { type Dim, DIM_META } from "@/lib/hierarchy";
import { cn, copyText } from "@/lib/utils";

interface Row {
  creative: Creative;
  metrics: ComputedMetrics;
}

interface Props {
  rows: Row[];
  visibleCols: Record<string, boolean>;
  hierarchy: Dim[];
  structureOnly?: boolean;
  creativeRowHeight?: number;
  onCreativeClick?: (creative: Creative) => void;
}

interface AggNode {
  key: string;
  label: string;
  depth: number;
  dim: Dim | "creative";
  metrics: ComputedMetrics;
  count: number;
  children?: AggNode[];
  creative?: Creative;
}

function aggregate(rows: Row[]): ComputedMetrics {
  const t = { impressions: 0, clicks: 0, cost: 0, conversions: 0 };
  for (const r of rows) {
    t.impressions += r.metrics.impressions;
    t.clicks += r.metrics.clicks;
    t.cost += r.metrics.cost;
    t.conversions += r.metrics.conversions;
  }
  return computeMetrics(t);
}

function buildTree(rows: Row[], hierarchy: Dim[]): AggNode[] {
  const build = (items: Row[], depth: number, parentKey: string): AggNode[] => {
    if (depth >= hierarchy.length) {
      return items.map(r => ({
        key: `${parentKey}>${r.creative.creative_id}`,
        label: r.creative.headline ?? r.creative.creative_id,
        depth,
        dim: "creative" as const,
        metrics: r.metrics,
        count: 1,
        creative: r.creative,
      }));
    }
    const dim = hierarchy[depth];
    const getter = DIM_META[dim].get;
    const map = new Map<string, Row[]>();
    for (const r of items) {
      const k = getter(r.creative);
      const arr = map.get(k) ?? [];
      arr.push(r);
      map.set(k, arr);
    }
    const nodes: AggNode[] = [];
    for (const [k, list] of map) {
      const key = `${parentKey}>${dim}:${k}`;
      nodes.push({
        key,
        label: k,
        depth,
        dim,
        metrics: aggregate(list),
        count: list.length,
        children: build(list, depth + 1, key),
      });
    }
    nodes.sort((a, b) => b.metrics.cost - a.metrics.cost);
    return nodes;
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
  const style = { width: size, height: size } as const;
  if (creative.creative_type === "Image") {
    if (!creative.creative_url) {
      return (
        <div style={style} className="rounded-lg border border-border bg-accent shrink-0 flex items-center justify-center">
          <FileText className="text-muted-foreground" style={{ width: size * 0.4, height: size * 0.4 }} />
        </div>
      );
    }
    return (
      <img
        src={creative.creative_url}
        alt={creative.headline ?? ""}
        style={style}
        loading="lazy"
        className="rounded-lg object-cover border border-border shrink-0 shadow-card transition-transform"
      />
    );
  }
  if (creative.creative_type === "Video") {
    const id = getYouTubeId(creative.creative_url);
    return (
      <div style={style} className="rounded-lg overflow-hidden border border-border shrink-0 relative bg-black shadow-card">
        {id && <img src={`https://i.ytimg.com/vi/${id}/hqdefault.jpg`} alt="" loading="lazy" className="w-full h-full object-cover" />}
        <div className="absolute inset-0 flex items-center justify-center bg-black/30">
          <VideoIcon className="text-white" style={{ width: size * 0.25, height: size * 0.25 }} />
        </div>
      </div>
    );
  }
  return (
    <div style={style} className="rounded-lg border border-border bg-accent shrink-0 flex items-center justify-center">
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

interface HoverState {
  creative: Creative;
  x: number;
  y: number;
}

export function DirectoryTree({ rows, visibleCols, hierarchy, structureOnly = false, creativeRowHeight = 64, onCreativeClick }: Props) {
  const tree = useMemo(() => buildTree(rows, hierarchy), [rows, hierarchy]);
  const grandTotal = useMemo(() => aggregate(rows), [rows]);
  const totalCreatives = rows.length;

  const [open, setOpen] = useState<Set<string>>(new Set());
  const [hover, setHover] = useState<HoverState | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-expand top two levels whenever hierarchy or tree shape changes
  useEffect(() => {
    const s = new Set<string>();
    for (const n of tree) {
      s.add(n.key);
      n.children?.forEach(c => s.add(c.key));
    }
    setOpen(s);
  }, [hierarchy, tree]);

  const cols = structureOnly ? [] : COL_DEFS.filter(c => visibleCols[c.key]);
  const toggle = (k: string) => {
    setOpen(prev => {
      const n = new Set(prev);
      n.has(k) ? n.delete(k) : n.add(k);
      return n;
    });
  };

  const headerLabel = hierarchy.map(d => DIM_META[d].label).concat("Creative").join(" › ");
  const thumbSize = Math.max(40, Math.min(1500, creativeRowHeight));

  const flat = useMemo(() => flattenTree(tree, open), [tree, open]);

  // Estimate row heights — creative rows use thumbSize, others ~44
  const estimateSize = (index: number) => {
    const n = flat[index];
    if (!n) return 44;
    return n.dim === "creative" ? thumbSize + 16 : 44;
  };

  const virtualizer = useVirtualizer({
    count: flat.length,
    getScrollElement: () => scrollRef.current,
    estimateSize,
    overscan: 8,
    getItemKey: (i) => flat[i]?.key ?? i,
  });

  // Reset measurements when row heights change
  useEffect(() => {
    virtualizer.measure();
  }, [thumbSize, virtualizer]);

  const indentPx = (depth: number) => 12 + depth * 22;

  const onThumbEnter = (e: React.MouseEvent, creative: Creative) => setHover({ creative, x: e.clientX, y: e.clientY });
  const onThumbMove  = (e: React.MouseEvent, creative: Creative) => setHover({ creative, x: e.clientX, y: e.clientY });
  const onThumbLeave = () => setHover(null);

  if (!tree.length) return null;

  // Hover preview position — clamp to viewport
  let hoverStyle: React.CSSProperties | null = null;
  if (hover) {
    const PREV_W = 480;
    const PREV_H = 480;
    const pad = 16;
    let left = hover.x + 24;
    let top = hover.y - PREV_H / 2;
    if (typeof window !== "undefined") {
      if (left + PREV_W + pad > window.innerWidth) left = hover.x - PREV_W - 24;
      if (top < pad) top = pad;
      if (top + PREV_H + pad > window.innerHeight) top = window.innerHeight - PREV_H - pad;
    }
    hoverStyle = { left, top, width: PREV_W };
  }

  // Grid template for header + rows: fixed metric widths to keep numbers aligned
  const metricColWidth = 120;
  const colTemplate = `minmax(280px, 1fr) ${cols.map(() => `minmax(${metricColWidth}px, ${metricColWidth}px)`).join(" ")}`.trim();
  const minTableWidth = 280 + cols.length * metricColWidth;

  const items = virtualizer.getVirtualItems();
  const totalSize = virtualizer.getTotalSize();

  return (
    <div className="glass rounded-2xl overflow-hidden relative">
      {/* Header (non-scrolling vertically; horizontally scrollable with body) */}
      <div className="overflow-x-auto">
        <div style={{ minWidth: minTableWidth }}>
          {/* Column header */}
          <div
            className="bg-background/80 backdrop-blur-xl border-b border-white/10 sticky top-0 z-20 grid items-center"
            style={{ gridTemplateColumns: colTemplate }}
          >
            <div className="py-2.5 px-3 text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">
              {headerLabel}
            </div>
            {cols.map(c => (
              <div key={c.key} className="py-2.5 px-3 text-right text-[10px] uppercase tracking-widest text-muted-foreground font-semibold whitespace-nowrap">
                {c.label}
              </div>
            ))}
          </div>

          {/* TOTAL strip */}
          {!structureOnly ? (
            <div
              className="border-b-2 border-gold/40 grid items-center"
              style={{
                gridTemplateColumns: colTemplate,
                backgroundImage: "linear-gradient(90deg, color-mix(in oklab, var(--gold) 14%, transparent), color-mix(in oklab, var(--gold) 6%, transparent))",
              }}
            >
              <div className="py-2.5 px-3">
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-gold shadow-[0_0_10px_var(--gold)]" />
                  <span className="font-display font-bold text-sm tracking-tight text-gold">TOTAL</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gold/15 border border-gold/30 text-gold">
                    {totalCreatives} creatives
                  </span>
                </div>
              </div>
              {cols.map(c => (
                <div key={c.key} className={cn(
                  "py-2.5 px-3 text-right tabular-nums whitespace-nowrap font-display font-bold text-sm",
                  c.key === "cost" ? "text-gold" : "text-foreground",
                )}>
                    <CopyableValue text={c.render(grandTotal)} className="font-display font-bold" />
                </div>
              ))}
            </div>
          ) : (
            <div
              className="border-b-2 border-gold/40 grid items-center"
              style={{
                gridTemplateColumns: colTemplate,
                backgroundImage: "linear-gradient(90deg, color-mix(in oklab, var(--gold) 14%, transparent), color-mix(in oklab, var(--gold) 6%, transparent))",
              }}
            >
              <div className="py-2.5 px-3">
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-gold shadow-[0_0_10px_var(--gold)]" />
                  <span className="font-display font-bold text-sm tracking-tight text-gold">CREATIVE STRUCTURE</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gold/15 border border-gold/30 text-gold">
                    {totalCreatives} creatives
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Virtualized body */}
          <div
            ref={scrollRef}
            className="overflow-y-auto"
            style={{ maxHeight: "calc(100vh - 280px)", minHeight: 400 }}
          >
            <div style={{ height: totalSize, position: "relative", width: "100%" }}>
              {items.map(vi => {
                const node = flat[vi.index];
                if (!node) return null;
                const isOpen = open.has(node.key);
                const hasChildren = !!node.children?.length;
                const isCreative = node.dim === "creative";
                const isTop = node.depth === 0;
                const isSecond = node.depth === 1;
                const Icon = isCreative ? Sparkles : DIM_META[node.dim as Dim].icon;
                return (
                  <div
                    key={vi.key}
                    data-index={vi.index}
                    ref={virtualizer.measureElement}
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      width: "100%",
                      transform: `translateY(${vi.start}px)`,
                      gridTemplateColumns: colTemplate,
                    }}
                    className={cn(
                      "grid items-center border-b border-white/5 transition-colors group",
                      isTop && "bg-gold/[0.06] hover:bg-gold/10 border-l-4 border-l-gold",
                      isSecond && "bg-white/[0.03] hover:bg-white/[0.05]",
                      !isTop && !isSecond && !isCreative && "hover:bg-white/[0.03]",
                      isCreative && "hover:bg-gold/[0.05] cursor-pointer",
                      hasChildren && "cursor-pointer",
                    )}
                    onClick={
                      hasChildren ? () => toggle(node.key)
                        : isCreative && node.creative && onCreativeClick ? () => onCreativeClick(node.creative!)
                        : undefined
                    }
                  >
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
                          onMouseMove={(e) => onThumbMove(e, node.creative!)}
                          onMouseLeave={onThumbLeave}
                          className="shrink-0"
                        >
                          <CreativeThumb creative={node.creative} size={thumbSize} />
                        </div>
                      ) : (
                        <Icon className={cn("w-4 h-4 shrink-0",
                          isTop ? "text-gold" : isSecond ? "text-emerald-accent" : "text-muted-foreground",
                        )} />
                      )}
                      <div className="min-w-0">
                        <div className={cn("truncate",
                          isTop && "font-display font-bold text-base tracking-tight",
                          isSecond && "font-display font-semibold text-sm tracking-wide",
                          !isTop && !isSecond && !isCreative && "text-sm",
                          isCreative && "text-sm font-medium",
                        )}>
                          {node.label}
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
                    {cols.map(c => (
                      <div key={c.key} className={cn(
                        "py-2.5 px-3 text-right tabular-nums whitespace-nowrap",
                        isTop ? "font-display font-bold text-sm" :
                        isSecond ? "font-semibold text-sm" : "text-sm",
                        c.key === "cost" && isTop && "text-gold",
                      )}>
                        <CopyableValue text={c.render(node.metrics)} />
                      </div>
                    ))}
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

      {/* Hover preview */}
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
