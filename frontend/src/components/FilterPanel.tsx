import { useState, useMemo } from "react";
import { Search, Columns3, FileDown, FileText, Loader2, ChevronDown, Check, RotateCcw } from "lucide-react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DateRangePicker } from "@/components/DateRangePicker";
import { cn } from "@/lib/utils";

export interface Filters {
  startDate:     string;
  endDate:       string;
  compareMode:   boolean;
  status:        string[];   // [] = all
  city:          string[];   // [] = all
  funnel:        string[];   // [] = all
  campaign_type: string[];   // [] = all
  campaign_name: string[];   // [] = all
  search:        string;
}

interface Props {
  filters:        Filters;
  setFilters:     (f: Filters) => void;
  minDate?:       string;
  maxDate?:       string;
  cities:         string[];
  campaignTypes:  string[];
  campaignNames:  string[];
  columns:        Record<string, boolean>;
  setColumns:     (c: Record<string, boolean>) => void;
  onExportPDF:    () => void;
  onExportCSV:    () => void;
  pdfLoading?:    boolean;
  rightSlot?:     React.ReactNode;
}

const colOptions = [
  { key: "impressions", label: "Impressions" },
  { key: "clicks",      label: "Clicks" },
  { key: "cost",        label: "Cost" },
  { key: "conversions", label: "Conversions" },
  { key: "ctr",         label: "CTR" },
  { key: "cpc",         label: "CPC" },
  { key: "cpm",         label: "CPM" },
  { key: "cr",          label: "CR" },
  { key: "cpa",         label: "CPA" },
  { key: "share_pct",   label: "% Share" },
];

const utilityBtn =
  "h-9 px-2.5 flex items-center gap-1.5 rounded-md text-[11px] font-medium " +
  "text-foreground/70 hover:text-foreground bg-transparent hover:bg-white/[0.05] " +
  "border border-transparent hover:border-white/10 transition-all duration-200 shrink-0 cursor-pointer";

export function FilterPanel({
  filters, setFilters, minDate, maxDate,
  cities, campaignTypes, campaignNames, columns, setColumns,
  onExportPDF, onExportCSV, pdfLoading = false, rightSlot,
}: Props) {

  const update = <K extends keyof Filters>(k: K, v: Filters[K]) =>
    setFilters({ ...filters, [k]: v });

  const activeCount = useMemo(() => {
    let n = 0;
    if (filters.status.length) n++;
    if (filters.city.length) n++;
    if (filters.funnel.length) n++;
    if (filters.campaign_type.length) n++;
    if (filters.campaign_name.length) n++;
    if (filters.search.trim()) n++;
    return n;
  }, [filters]);

  const resetAll = () => setFilters({
    ...filters,
    status: [], city: [], funnel: [], campaign_type: [], campaign_name: [], search: "",
  });

  return (
    <div className="filter-panel relative group/bar no-print">
      {/* outer ambient gold glow */}
      <div
        aria-hidden
        className="absolute -inset-px rounded-xl blur-sm opacity-40 group-hover/bar:opacity-70 transition-opacity duration-700 pointer-events-none"
        style={{
          background:
            "linear-gradient(90deg, oklch(0.78 0.15 85 / 0.18), oklch(0.78 0.15 85 / 0.06) 40%, transparent)",
        }}
      />

      {/* main console */}
      <div className="relative flex items-center gap-1 p-1.5 rounded-xl bg-[oklch(0.12_0.005_260)] border border-white/[0.06] shadow-[0_10px_40px_-15px_oklch(0_0_0/0.7)] backdrop-blur-xl overflow-x-auto no-scrollbar">

        {/* ── Date range (custom-styled trigger) ── */}
        <DateRangePicker
          value={{ startDate: filters.startDate, endDate: filters.endDate, compareMode: filters.compareMode }}
          onChange={v => setFilters({ ...filters, startDate: v.startDate, endDate: v.endDate, compareMode: v.compareMode })}
          minDate={minDate}
          maxDate={maxDate}
        />

        <Divider />

        {/* ── Filter dimension dropdowns ── */}
        <div className="flex items-center gap-1 shrink-0">
          <SegmentDropdown
            label="Status"
            value={filters.status}
            onChange={v => update("status", v)}
            options={[{ v: "Enabled", l: "Enabled" }, { v: "Paused", l: "Paused" }]}
            allLabel="All Status"
          />
          <SegmentDropdown
            label="Cities"
            value={filters.city}
            onChange={v => update("city", v)}
            options={cities.map(c => ({ v: c, l: c }))}
            allLabel="All Cities"
            searchable
          />
          <SegmentDropdown
            label="Funnels"
            value={filters.funnel}
            onChange={v => update("funnel", v)}
            options={[{ v: "TOFU", l: "TOFU" }, { v: "MOFU", l: "MOFU" }]}
            allLabel="All Funnels"
          />
          <SegmentDropdown
            label="Types"
            value={filters.campaign_type}
            onChange={v => update("campaign_type", v)}
            options={campaignTypes.map(t => ({ v: t, l: t }))}
            allLabel="All Types"
            searchable
          />
          <SegmentDropdown
            label="Campaigns"
            value={filters.campaign_name}
            onChange={v => update("campaign_name", v)}
            options={campaignNames.map(n => ({ v: n, l: n }))}
            allLabel="All Campaigns"
            searchable
          />
        </div>

        <Divider />

        {/* ── Search ── */}
        <div className="flex items-center gap-1.5 h-9 px-2.5 rounded-md bg-white/[0.03] border border-white/[0.06] focus-within:border-[var(--gold)]/30 transition-colors min-w-[140px] max-w-[220px] flex-1">
          <Search className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          <input
            placeholder="Search…"
            value={filters.search}
            onChange={e => update("search", e.target.value)}
            className="bg-transparent outline-none flex-1 text-xs placeholder:text-muted-foreground/40"
          />
        </div>

        <Divider />

        {/* ── Utility actions ── */}
        <Popover>
          <PopoverTrigger asChild>
            <button type="button" className={utilityBtn} title="Toggle columns">
              <Columns3 className="w-3.5 h-3.5" />
              <span className="hidden md:inline">Columns</span>
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-52">
            <div className="space-y-0.5">
              {colOptions.map(o => (
                <label key={o.key} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-accent/50 px-2 py-1.5 rounded">
                  <input
                    type="checkbox"
                    checked={columns[o.key]}
                    onChange={e => setColumns({ ...columns, [o.key]: e.target.checked })}
                    className="accent-[var(--gold)]"
                  />
                  {o.label}
                </label>
              ))}
            </div>
          </PopoverContent>
        </Popover>

        {rightSlot}

        <button type="button" onClick={onExportCSV} className={utilityBtn} title="Export CSV">
          <FileDown className="w-3.5 h-3.5" />
          <span className="hidden md:inline">CSV</span>
        </button>

        {/* Reset */}
        <button
          type="button"
          onClick={resetAll}
          disabled={activeCount === 0}
          className={cn(
            "group/reset relative h-9 w-9 flex items-center justify-center rounded-md transition-all shrink-0",
            "border border-transparent",
            activeCount === 0
              ? "text-muted-foreground/30 cursor-not-allowed"
              : "text-foreground/70 hover:text-gold hover:bg-white/[0.05] hover:border-[var(--gold)]/20 cursor-pointer active:scale-95",
          )}
          title={activeCount ? `Reset ${activeCount} filter${activeCount > 1 ? "s" : ""}` : "No active filters"}
        >
          <RotateCcw className={cn("w-3.5 h-3.5 transition-transform duration-500", activeCount > 0 && "group-hover/reset:-rotate-180")} />
          {activeCount > 0 && (
            <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-gold-gradient text-[9px] font-bold text-primary-foreground flex items-center justify-center border border-[oklch(0.12_0.005_260)] shadow-[0_0_8px_oklch(0.78_0.15_85/0.4)]">
              {activeCount}
            </span>
          )}
        </button>

        {/* PDF gold CTA */}
        <button
          type="button"
          onClick={onExportPDF}
          disabled={pdfLoading}
          className={cn(
            "h-9 px-3.5 flex items-center gap-1.5 rounded-md text-[11px] font-bold uppercase tracking-widest shrink-0",
            "bg-gold-gradient text-primary-foreground transition-all",
            "shadow-[0_0_20px_-6px_oklch(0.78_0.15_85/0.5)] hover:shadow-[0_0_24px_-3px_oklch(0.78_0.15_85/0.7)]",
            "active:translate-y-px disabled:opacity-50 disabled:cursor-not-allowed",
          )}
        >
          {pdfLoading
            ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> <span className="hidden md:inline">Generating…</span></>
            : <><FileText className="w-3.5 h-3.5" /> <span className="hidden md:inline">PDF</span></>}
        </button>
      </div>

      {/* bottom accent hairline */}
      <div
        aria-hidden
        className="h-px mt-px mx-4 rounded-full"
        style={{
          background:
            "linear-gradient(90deg, transparent, oklch(0.78 0.15 85 / 0.35), transparent)",
        }}
      />
    </div>
  );
}

// ── Vertical divider between segments ────────────────────────────────────────
function Divider() {
  return <div aria-hidden className="w-px h-7 bg-white/[0.06] mx-0.5 shrink-0" />;
}

// ── Two-row segment dropdown trigger (label + value, with active count badge) ─
function SegmentDropdown({ label, value, onChange, options, allLabel, searchable }: {
  label:       string;
  value:       string[];
  onChange:    (v: string[]) => void;
  options:     { v: string; l: string }[];
  allLabel:    string;
  searchable?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) setQuery("");
  };

  const toggle = (v: string) => {
    onChange(value.includes(v) ? value.filter(x => x !== v) : [...value, v]);
  };
  const clearAll = () => onChange([]);

  const filtered = searchable && query.trim()
    ? options.filter(o => o.l.toLowerCase().includes(query.toLowerCase()))
    : options;

  const hasFilter = value.length > 0;
  const valueLabel = !hasFilter
    ? allLabel
    : value.length === 1
    ? (options.find(o => o.v === value[0])?.l ?? value[0])
    : `${value.length} selected`;

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "group/seg relative h-11 px-3 flex items-center gap-2 rounded-lg shrink-0 transition-all duration-200",
            "border",
            hasFilter
              ? "bg-[var(--gold)]/[0.06] border-[var(--gold)]/30 hover:bg-[var(--gold)]/[0.10]"
              : "border-transparent hover:bg-white/[0.04] hover:border-white/10",
            open && !hasFilter && "bg-white/[0.04] border-[var(--gold)]/25",
            open && hasFilter && "bg-[var(--gold)]/[0.12] border-[var(--gold)]/40",
          )}
        >
          <span className="flex flex-col items-start leading-tight">
            <span className={cn(
              "text-[9px] uppercase tracking-[0.18em] font-semibold transition-colors",
              hasFilter ? "text-[var(--gold)]/80" : "text-muted-foreground/70",
            )}>
              {label}
            </span>
            <span className={cn(
              "text-[12px] font-medium whitespace-nowrap transition-colors",
              hasFilter ? "text-gold" : "text-foreground/85 group-hover/seg:text-foreground",
            )}>
              {valueLabel}
            </span>
          </span>
          {!hasFilter && (
            <ChevronDown className={cn(
              "w-3 h-3 shrink-0 transition-all duration-200 text-muted-foreground/50 group-hover/seg:text-muted-foreground",
              open && "rotate-180",
            )} />
          )}
          {hasFilter && value.length > 1 && (
            <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-gold-gradient text-[9px] font-bold text-primary-foreground flex items-center justify-center border border-[oklch(0.12_0.005_260)] shadow-[0_0_8px_oklch(0.78_0.15_85/0.5)]">
              {value.length}
            </span>
          )}
          {hasFilter && value.length === 1 && (
            <span className="w-1.5 h-1.5 rounded-full bg-gold shadow-[0_0_6px_oklch(0.78_0.15_85/0.7)] animate-pulse shrink-0" />
          )}
        </button>
      </PopoverTrigger>

      <PopoverContent align="start" sideOffset={6} className="p-1 min-w-[220px] w-auto max-h-72 flex flex-col">
        {searchable && (
          <div className="px-2 pb-1 pt-0.5 border-b border-white/[0.06] mb-1">
            <div className="flex items-center gap-1.5 h-7 px-2 rounded bg-white/[0.05] border border-white/10">
              <Search className="w-3 h-3 text-muted-foreground shrink-0" />
              <input
                autoFocus
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Search…"
                className="bg-transparent outline-none flex-1 text-xs placeholder:text-muted-foreground/50"
              />
            </div>
          </div>
        )}

        <div className="overflow-y-auto flex-1">
          {!query && (
            <button
              type="button"
              onClick={clearAll}
              className={cn(
                "w-full flex items-center gap-2.5 px-3 py-1.5 rounded-md text-sm transition-colors mb-0.5 border-b border-white/[0.06] pb-2",
                !hasFilter ? "text-gold" : "text-foreground/80 hover:bg-white/[0.06] hover:text-foreground",
              )}
            >
              <span className={cn(
                "w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors",
                !hasFilter ? "bg-gold/20 border-gold/60" : "border-white/20",
              )}>
                {!hasFilter && <Check className="w-2.5 h-2.5 text-gold" />}
              </span>
              <span className="flex-1 text-left">All</span>
            </button>
          )}

          {filtered.length === 0 && (
            <p className="px-3 py-3 text-xs text-muted-foreground text-center">No results</p>
          )}

          {filtered.map(o => {
            const checked = value.includes(o.v);
            return (
              <button
                key={o.v}
                type="button"
                onClick={() => toggle(o.v)}
                className={cn(
                  "w-full flex items-center gap-2.5 px-3 py-1.5 rounded-md text-sm transition-colors",
                  checked ? "text-gold" : "text-foreground/80 hover:bg-white/[0.06] hover:text-foreground",
                )}
              >
                <span className={cn(
                  "w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors",
                  checked ? "bg-gold/20 border-gold/60" : "border-white/20",
                )}>
                  {checked && <Check className="w-2.5 h-2.5 text-gold" />}
                </span>
                <span className="flex-1 text-left">{o.l}</span>
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
