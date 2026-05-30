import { useState } from "react";
import { Search, Columns3, FileDown, FileText, Loader2, ChevronDown, Check } from "lucide-react";
import type { Creative } from "@/lib/api";
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

const controlBase =
  "h-8 px-3 flex items-center gap-2 rounded-md bg-background/40 border border-border " +
  "text-xs text-foreground/80 transition-colors duration-150 hover:border-white/20 shrink-0 cursor-pointer";

export function FilterPanel({
  filters, setFilters, minDate, maxDate,
  cities, campaignTypes, campaignNames, columns, setColumns,
  onExportPDF, onExportCSV, pdfLoading = false, rightSlot,
}: Props) {

  const update = <K extends keyof Filters>(k: K, v: Filters[K]) =>
    setFilters({ ...filters, [k]: v });

  return (
    <div className="filter-panel glass rounded-xl p-2 flex flex-nowrap items-center gap-2 overflow-x-auto no-print">

      {/* ── Date range ── */}
      <DateRangePicker
        value={{ startDate: filters.startDate, endDate: filters.endDate, compareMode: filters.compareMode }}
        onChange={v => setFilters({ ...filters, startDate: v.startDate, endDate: v.endDate, compareMode: v.compareMode })}
        minDate={minDate}
        maxDate={maxDate}
      />

      {/* ── Multi-select dropdowns ── */}
      <MultiDropdown
        value={filters.status}
        onChange={v => update("status", v)}
        options={[{ v: "Enabled", l: "Enabled" }, { v: "Paused", l: "Paused" }]}
        placeholder="All Status"
      />
      <MultiDropdown
        value={filters.city}
        onChange={v => update("city", v)}
        options={cities.map(c => ({ v: c, l: c }))}
        placeholder="All Cities"
      />
      <MultiDropdown
        value={filters.funnel}
        onChange={v => update("funnel", v)}
        options={[{ v: "TOFU", l: "TOFU" }, { v: "MOFU", l: "MOFU" }]}
        placeholder="All Funnels"
      />
      <MultiDropdown
        value={filters.campaign_type}
        onChange={v => update("campaign_type", v)}
        options={campaignTypes.map(t => ({ v: t, l: t }))}
        placeholder="All Types"
        searchable
      />
      <MultiDropdown
        value={filters.campaign_name}
        onChange={v => update("campaign_name", v)}
        options={campaignNames.map(n => ({ v: n, l: n }))}
        placeholder="All Campaigns"
        searchable
      />

      {/* ── Search ── */}
      <div className={cn(controlBase, "flex-1 min-w-[160px] max-w-[280px] cursor-text")}>
        <Search className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        <input
          placeholder="Search campaigns, ad groups, creatives…"
          value={filters.search}
          onChange={e => update("search", e.target.value)}
          className="bg-transparent outline-none flex-1 text-xs placeholder:text-muted-foreground/50"
        />
      </div>

      {/* ── Columns toggle ── */}
      <Popover>
        <PopoverTrigger asChild>
          <button type="button" className={controlBase}>
            <Columns3 className="w-3.5 h-3.5 text-muted-foreground" />
            <span>Columns</span>
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

      {/* ── CSV export ── */}
      <button type="button" onClick={onExportCSV} className={controlBase}>
        <FileDown className="w-3.5 h-3.5 text-muted-foreground" />
        <span>CSV</span>
      </button>

      {/* ── PDF export — gold CTA ── */}
      <button
        type="button"
        onClick={onExportPDF}
        disabled={pdfLoading}
        className="h-8 px-3 flex items-center gap-2 rounded-md text-xs font-semibold bg-gold-gradient text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-opacity shrink-0"
      >
        {pdfLoading
          ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Generating…</>
          : <><FileText className="w-3.5 h-3.5" /> Export PDF</>}
      </button>
    </div>
  );
}

// ── Multi-select dropdown ─────────────────────────────────────────────────────
function MultiDropdown({ value, onChange, options, placeholder, searchable }: {
  value:       string[];
  onChange:    (v: string[]) => void;
  options:     { v: string; l: string }[];
  placeholder: string;
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

  const label = value.length === 0
    ? placeholder
    : value.length === 1
    ? (options.find(o => o.v === value[0])?.l ?? value[0])
    : `${value.length} selected`;

  const hasFilter = value.length > 0;

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "h-8 px-3 flex items-center gap-1.5 rounded-md shrink-0 text-xs transition-colors duration-150",
            "bg-background/40 border",
            open
              ? "border-gold/50 text-foreground"
              : hasFilter
              ? "border-gold/30 text-gold"
              : "border-border text-foreground/80 hover:border-white/20",
          )}
        >
          <span className="whitespace-nowrap">{label}</span>
          <ChevronDown className={cn(
            "w-3 h-3 shrink-0 transition-transform duration-200",
            open ? "rotate-180 text-gold" : "text-muted-foreground",
          )} />
        </button>
      </PopoverTrigger>

      <PopoverContent align="start" sideOffset={4} className="p-1 min-w-[200px] w-auto max-h-72 flex flex-col">
        {/* Search input */}
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
          {/* "All" — only show when not actively searching */}
          {!query && (
            <button
              type="button"
              onClick={clearAll}
              className={cn(
                "w-full flex items-center gap-2.5 px-3 py-1.5 rounded-md text-sm transition-colors mb-0.5 border-b border-white/[0.06] pb-2",
                !hasFilter
                  ? "text-gold"
                  : "text-foreground/80 hover:bg-white/[0.06] hover:text-foreground",
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
                  checked
                    ? "text-gold"
                    : "text-foreground/80 hover:bg-white/[0.06] hover:text-foreground",
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
