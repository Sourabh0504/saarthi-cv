import { useMemo, useState, useEffect } from "react";
import { ChevronRight, ChevronDown, ArrowUp, ArrowDown, Eye, EyeOff, Check, Megaphone, BarChart3, Network, Maximize2 } from "lucide-react";
import type { Creative } from "@/lib/api";
import { type Dim, DIM_META, ALL_DIMS, HIERARCHY_PRESETS } from "@/lib/hierarchy";
import { cn } from "@/lib/utils";

export type SidebarMode = "report" | "structure";

interface Props {
  creatives:    Creative[];
  hierarchy:    Dim[];
  setHierarchy: (h: Dim[]) => void;
  activeKey:    string;
  setActive:    (key: string, ids: string[]) => void;
  mode:         SidebarMode;
  setMode:      (m: SidebarMode) => void;
  rowHeight:    number;
  setRowHeight: (v: number) => void;
}

function buildGroups(items: Creative[], hierarchy: Dim[]) {
  const primary = hierarchy[0];
  const secondary = hierarchy[1];
  const map = new Map<string, Map<string, Creative[]>>();
  for (const c of items) {
    const k = DIM_META[primary].get(c);
    if (!map.has(k)) map.set(k, new Map());
    const inner = map.get(k)!;
    const sk = secondary ? DIM_META[secondary].get(c) : "—";
    if (!inner.has(sk)) inner.set(sk, []);
    inner.get(sk)!.push(c);
  }
  return map;
}

function presetMatches(h: Dim[], dims: Dim[]) {
  return h.length === dims.length && h.every((d, i) => d === dims[i]);
}

export function GroupingSidebar({ creatives, hierarchy, setHierarchy, activeKey, setActive, mode, setMode, rowHeight, setRowHeight }: Props) {
  const groups = useMemo(() => buildGroups(creatives, hierarchy), [creatives, hierarchy]);
  const [open, setOpen] = useState<Set<string>>(() => new Set(Array.from(buildGroups(creatives, hierarchy).keys())));
  const [editor, setEditor] = useState(false);

  const toggle = (k: string) => {
    const n = new Set(open);
    n.has(k) ? n.delete(k) : n.add(k);
    setOpen(n);
  };

  const allIds = creatives.map(c => c.creative_id);
  const primary = hierarchy[0];

  // ── Multi-select: empty = "show all", else show union of selected groups ──
  const [multiSelected, setMultiSelected] = useState<Set<string>>(new Set());

  // Clear selection when the grouping hierarchy changes
  useEffect(() => { setMultiSelected(new Set()); }, [hierarchy]);

  const applyMulti = (next: Set<string>) => {
    if (next.size === 0) {
      setActive("ALL", allIds);
    } else {
      const ids: string[] = [];
      for (const [k, sub] of groups.entries()) {
        if (next.has(k)) {
          for (const list of sub.values()) ids.push(...list.map(c => c.creative_id));
        }
      }
      setActive("MULTI", ids);
    }
  };

  const toggleGroupSelect = (key: string) => {
    const next = new Set(multiSelected);
    next.has(key) ? next.delete(key) : next.add(key);
    setMultiSelected(next);
    applyMulti(next);
  };
  const secondary = hierarchy[1];
  const PrimaryIcon = DIM_META[primary].icon;
  const SecondaryIcon = secondary ? DIM_META[secondary].icon : null;

  const move = (idx: number, dir: -1 | 1) => {
    const next = [...hierarchy];
    const j = idx + dir;
    if (j < 0 || j >= next.length) return;
    [next[idx], next[j]] = [next[j], next[idx]];
    setHierarchy(next);
  };
  const toggleDim = (d: Dim) => {
    if (hierarchy.includes(d)) {
      if (hierarchy.length <= 1) return;
      setHierarchy(hierarchy.filter(x => x !== d));
    } else {
      setHierarchy([...hierarchy, d]);
    }
  };

  const tabs: { id: SidebarMode; label: string; icon: typeof BarChart3; sub: string }[] = [
    { id: "report",    label: "Creative Report",    icon: BarChart3, sub: "Performance metrics" },
    { id: "structure", label: "Creative Structure", icon: Network,   sub: "Where & how it's used" },
  ];

  return (
    <div className="flex flex-col h-full">
      {/* Mode tabs */}
      <div className="p-3 border-b border-white/5 space-y-1.5">
        <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground px-1 pb-1">View</div>
        {tabs.map(t => {
          const active = mode === t.id;
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              onClick={() => setMode(t.id)}
              className={cn(
                "group w-full text-left rounded-xl border transition-all px-3 py-2.5 flex items-center gap-3 relative overflow-hidden",
                active
                  ? "border-gold/40 bg-gradient-to-br from-gold/20 via-gold/8 to-transparent text-foreground"
                  : "border-white/5 bg-white/[0.02] text-muted-foreground hover:text-foreground hover:bg-white/[0.05]"
              )}
            >
              {active && <span className="absolute left-0 top-0 bottom-0 w-0.5 bg-gold-gradient" />}
              <div className={cn(
                "w-9 h-9 rounded-lg flex items-center justify-center shrink-0 transition",
                active ? "bg-gold-gradient text-primary-foreground" : "bg-white/[0.04] text-gold group-hover:bg-white/[0.08]"
              )}>
                <Icon className="w-4 h-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className={cn("text-[12.5px] font-display font-semibold tracking-tight leading-tight", active && "text-foreground")}>
                  {t.label}
                </div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground leading-snug mt-0.5">{t.sub}</div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Hierarchy presets */}
      <div className="p-4 border-b border-white/5 space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground flex items-center gap-1.5">
            <Network className="w-3 h-3 text-gold" /> Hierarchy
          </div>
          <button
            onClick={() => setEditor(o => !o)}
            className="text-[10px] uppercase tracking-wider text-gold hover:text-gold/80 flex items-center gap-1"
          >
            {editor ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
            Custom
          </button>
        </div>

        <div className="space-y-1">
          {HIERARCHY_PRESETS.map(p => {
            const active = presetMatches(hierarchy, p.dims);
            const FirstIcon = DIM_META[p.dims[0]].icon;
            return (
              <button
                key={p.id}
                onClick={() => setHierarchy(p.dims)}
                className={cn(
                  "w-full text-left text-[11px] px-2.5 py-1.5 rounded-lg border transition-all flex items-center gap-2",
                  active
                    ? "bg-gold/15 border-gold/40 text-gold"
                    : "border-white/5 bg-white/[0.02] text-muted-foreground hover:text-foreground hover:bg-white/[0.05]"
                )}
              >
                {active ? <Check className="w-3 h-3 shrink-0" /> : <FirstIcon className="w-3 h-3 shrink-0 opacity-70" />}
                <span className="truncate">{p.label}</span>
              </button>
            );
          })}
        </div>

        {editor && (
          <div className="rounded-lg border border-white/10 bg-white/[0.02] p-2 space-y-1">
            <div className="text-[9px] uppercase tracking-widest text-muted-foreground px-1 pb-1">
              Drill order (top → bottom)
            </div>
            {hierarchy.map((d, idx) => {
              const Icon = DIM_META[d].icon;
              return (
                <div key={d} className="flex items-center gap-1 px-1.5 py-1 rounded-md bg-white/[0.04] border border-white/5">
                  <span className="text-[10px] tabular-nums text-muted-foreground w-3">{idx + 1}</span>
                  <Icon className="w-3 h-3 text-gold" />
                  <span className="text-[11px] font-medium flex-1 truncate">{DIM_META[d].label}</span>
                  <button onClick={() => move(idx, -1)} disabled={idx === 0}
                    className="p-0.5 rounded hover:bg-white/10 disabled:opacity-20">
                    <ArrowUp className="w-3 h-3" />
                  </button>
                  <button onClick={() => move(idx, 1)} disabled={idx === hierarchy.length - 1}
                    className="p-0.5 rounded hover:bg-white/10 disabled:opacity-20">
                    <ArrowDown className="w-3 h-3" />
                  </button>
                  <button onClick={() => toggleDim(d)} className="p-0.5 rounded hover:bg-white/10 text-muted-foreground">
                    <Eye className="w-3 h-3" />
                  </button>
                </div>
              );
            })}
            {ALL_DIMS.filter(d => !hierarchy.includes(d)).map(d => {
              const Icon = DIM_META[d].icon;
              return (
                <div key={d} className="flex items-center gap-1 px-1.5 py-1 rounded-md opacity-50 hover:opacity-100 transition">
                  <span className="text-[10px] w-3" />
                  <Icon className="w-3 h-3" />
                  <span className="text-[11px] flex-1 truncate text-muted-foreground italic">{DIM_META[d].label}</span>
                  <button onClick={() => toggleDim(d)} className="p-0.5 rounded hover:bg-white/10 text-muted-foreground">
                    <EyeOff className="w-3 h-3" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* All */}
      <div className="p-3 pb-1">
        <button
          onClick={() => { setMultiSelected(new Set()); setActive("ALL", allIds); }}
          className={cn(
            "w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all border",
            multiSelected.size === 0
              ? "bg-gold/15 border-gold/40 text-gold"
              : "border-transparent text-muted-foreground hover:bg-white/[0.04] hover:text-foreground"
          )}
        >
          <Megaphone className="w-3.5 h-3.5" />
          <span>All creatives</span>
          <span className="ml-auto text-[10px] tabular-nums opacity-70">{allIds.length}</span>
        </button>
      </div>

      <div className="px-4 pt-1 pb-2 text-[11px] uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
        <PrimaryIcon className="w-3 h-3 text-gold/70" />
        {/* Clicking level 1 collapses everything — shows only primary groups */}
        <button
          onClick={() => setOpen(new Set())}
          className="hover:text-foreground transition-colors duration-150"
          title={`Show ${DIM_META[primary].label} level only`}
        >
          {DIM_META[primary].label}
        </button>
        {secondary && (
          <>
            <span className="opacity-30">›</span>
            {/* Clicking level 2 expands all primary groups to reveal secondary */}
            <button
              onClick={() => setOpen(new Set(groups.keys()))}
              className="hover:text-foreground transition-colors duration-150"
              title={`Expand all to show ${DIM_META[secondary].label}`}
            >
              {DIM_META[secondary].label}
            </button>
          </>
        )}
      </div>

      {/* Group list */}
      <div className="flex-1 overflow-y-auto px-2 pb-4 space-y-0.5">
        {Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([key, sub]) => {
          const groupIds = Array.from(sub.values()).flat().map(c => c.creative_id);
          const isOpen   = open.has(key);
          const active   = multiSelected.has(key);
          return (
            <div key={key}>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => toggle(key)}
                  className="p-1 rounded hover:bg-white/5 text-muted-foreground shrink-0"
                  aria-label="Toggle"
                >
                  {isOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                </button>
                {/* Clicking the pill toggles this group in/out of multi-selection */}
                <button
                  onClick={() => toggleGroupSelect(key)}
                  className={cn(
                    "flex-1 flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm transition-all",
                    active
                      ? "bg-gold/15 text-gold border border-gold/30"
                      : "border border-transparent hover:bg-white/[0.04]"
                  )}
                >
                  <PrimaryIcon className={cn("w-3.5 h-3.5 shrink-0", active ? "text-gold" : "text-muted-foreground")} />
                  <span className="font-display font-semibold tracking-wide truncate">{key}</span>
                  <span className="ml-auto flex items-center gap-1.5">
                    {active && <Check className="w-3 h-3" />}
                    <span className="text-[10px] tabular-nums text-muted-foreground">{groupIds.length}</span>
                  </span>
                </button>
              </div>

              {isOpen && secondary && SecondaryIcon && (
                <div className="ml-5 mt-0.5 mb-1 border-l border-white/5 pl-2 space-y-0.5">
                  {Array.from(sub.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([subLabel, list]) => {
                    const subKey = `${key}::${subLabel}`;
                    const ids = list.map(c => c.creative_id);
                    const active = activeKey === subKey;
                    return (
                      <button
                        key={subLabel}
                        onClick={() => setActive(subKey, ids)}
                        className={cn(
                          "w-full flex items-center gap-2 px-2 py-1 rounded-md text-[12px] transition-all",
                          active
                            ? "bg-gold/10 text-gold"
                            : "text-muted-foreground hover:bg-white/[0.04] hover:text-foreground"
                        )}
                      >
                        <SecondaryIcon className={cn("w-3 h-3 shrink-0", active ? "text-gold" : "text-muted-foreground/70")} />
                        <span className="truncate text-left">{subLabel}</span>
                        <span className="ml-auto text-[10px] tabular-nums opacity-70">{ids.length}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Row height control — pinned to sidebar bottom ── */}
      <div className="mt-auto border-t border-white/5 px-3 py-2.5 space-y-1.5 shrink-0">
        {/* Title + presets on one line */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1 text-[9px] uppercase tracking-widest text-muted-foreground font-medium">
            <Maximize2 className="w-3 h-3" />
            Row Height
          </div>
          <div className="flex items-center gap-1">
            {[64, 96, 150, 200].map(p => (
              <button
                key={p}
                type="button"
                onClick={() => setRowHeight(p)}
                className={cn(
                  "text-[9px] px-1.5 py-0.5 rounded border transition",
                  rowHeight === p
                    ? "border-gold/40 bg-gold/15 text-gold"
                    : "border-white/10 text-muted-foreground hover:text-foreground hover:bg-white/[0.06]",
                )}
              >
                {p}
              </button>
            ))}
          </div>
        </div>
        {/* Slider + live value on one line */}
        <div className="flex items-center gap-2">
          <input
            type="range" min={40} max={200} step={4} value={rowHeight}
            onChange={e => setRowHeight(Number(e.target.value))}
            className="flex-1 accent-[var(--gold)] cursor-pointer"
            aria-label="Creative row height"
          />
          <span className="text-[10px] tabular-nums text-muted-foreground w-8 text-right shrink-0">
            {rowHeight}px
          </span>
        </div>
      </div>
    </div>
  );
}
