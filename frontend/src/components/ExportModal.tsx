import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sun, Moon } from "lucide-react";

export interface ExportContext {
  modeLabel: string;
  dateRange: string;
  filters: { status: string; city: string; funnel: string; search: string };
  hierarchyLabel: string;
  selectionLabel: string;
  selectedCount: number;
  totalCount: number;
  sortLabel: string;
  rankMetric?: string;
  columnsLabel: string;
  rowHeight: number;
}

export interface ExportPick {
  theme: "light" | "dark";
  scope: "current" | "all";
  hierarchyId: string;
  rowHeight: number | null;
}

interface HierarchyOption {
  id: string;
  label: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onPick: (opts: ExportPick) => void;
  context: ExportContext;
  hierarchyOptions: HierarchyOption[];
  canScopeAll: boolean;
}

const densityOptions: Array<{ label: string; value: number | null }> = [
  { label: "Current (as shown)", value: null },
  { label: "Compact (64px)", value: 64 },
  { label: "Comfortable (96px)", value: 96 },
  { label: "Spacious (160px)", value: 160 },
];

export function ExportModal({ open, onClose, onPick, context, hierarchyOptions, canScopeAll }: Props) {
  const [scope, setScope] = useState<"current" | "all">("current");
  const [hierarchyId, setHierarchyId] = useState<string>("current");
  const [rowHeight, setRowHeight] = useState<number | null>(null);

  useEffect(() => {
    if (!open) return;
    setScope("current");
    setHierarchyId("current");
    setRowHeight(null);
  }, [open]);

  const summary = useMemo(() => {
    const filterBits = [
      context.filters.status !== "All" ? `Status: ${context.filters.status}` : "Status: All",
      context.filters.city !== "All" ? `City: ${context.filters.city}` : "City: All",
      context.filters.funnel !== "All" ? `Funnel: ${context.filters.funnel}` : "Funnel: All",
      context.filters.search ? `Search: ${context.filters.search}` : "Search: None",
    ];
    return [
      { label: "Date range", value: context.dateRange },
      { label: "Mode", value: context.modeLabel },
      { label: "Selection", value: context.selectionLabel },
      { label: "Creatives", value: `${context.selectedCount} / ${context.totalCount}` },
      { label: "Hierarchy", value: context.hierarchyLabel },
      { label: "Sorting", value: context.sortLabel },
      { label: "Columns", value: context.columnsLabel },
      ...(context.rankMetric ? [{ label: "Top metric", value: context.rankMetric.toUpperCase() }] : []),
      { label: "Filters", value: filterBits.join(" | ") },
    ];
  }, [context]);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="font-display">Export PDF (synced with current view)</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          This export is preloaded with your current dashboard state. Adjust optional settings below, then choose a theme.
        </p>

        <div className="rounded-xl border border-border bg-background/40 p-3">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">Current dashboard context</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {summary.map(item => (
              <div key={item.label} className="rounded-lg border border-border/60 bg-background/60 px-2.5 py-2">
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{item.label}</div>
                <div className="text-xs font-medium mt-0.5 truncate" title={item.value}>{item.value}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-[10px] uppercase tracking-widest text-muted-foreground">Export scope</label>
            <select
              value={scope}
              onChange={e => setScope(e.target.value as "current" | "all")}
              className="w-full px-3 py-2 rounded-lg bg-background/40 border border-border text-sm outline-none hover:border-gold/50 cursor-pointer"
            >
              <option value="current">Current selection</option>
              <option value="all" disabled={!canScopeAll}>All creatives</option>
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-[10px] uppercase tracking-widest text-muted-foreground">Hierarchy for export</label>
            <select
              value={hierarchyId}
              onChange={e => setHierarchyId(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-background/40 border border-border text-sm outline-none hover:border-gold/50 cursor-pointer"
            >
              {hierarchyOptions.map(o => (
                <option key={o.id} value={o.id}>{o.label}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-[10px] uppercase tracking-widest text-muted-foreground">Report density</label>
            <select
              value={String(rowHeight ?? "current")}
              onChange={e => setRowHeight(e.target.value === "current" ? null : Number(e.target.value))}
              className="w-full px-3 py-2 rounded-lg bg-background/40 border border-border text-sm outline-none hover:border-gold/50 cursor-pointer"
            >
              {densityOptions.map(o => (
                <option key={String(o.value ?? "current")} value={String(o.value ?? "current")}>{o.label}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-[10px] uppercase tracking-widest text-muted-foreground">Current row height</label>
            <div className="w-full px-3 py-2 rounded-lg bg-background/40 border border-border text-sm">
              {context.rowHeight}px
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 pt-2">
          <button
            onClick={() => onPick({ theme: "light", scope, hierarchyId, rowHeight })}
            className="group rounded-xl border border-border p-6 bg-white text-gray-900 hover:border-gold transition"
          >
            <Sun className="w-8 h-8 mx-auto mb-3 text-amber-500" />
            <div className="font-display font-semibold">Plain White</div>
            <div className="text-xs text-gray-500 mt-1">Classic client-ready report</div>
          </button>
          <button
            onClick={() => onPick({ theme: "dark", scope, hierarchyId, rowHeight })}
            className="group rounded-xl border border-border p-6 bg-[#0a0c10] text-gray-100 hover:border-gold transition"
          >
            <Moon className="w-8 h-8 mx-auto mb-3 text-gold" />
            <div className="font-display font-semibold">Luxury Dark</div>
            <div className="text-xs text-gray-400 mt-1">Premium brand presentation</div>
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
