import { Calendar, Search, Columns3, FileDown, FileText } from "lucide-react";
import type { Funnel, Status } from "@/data/mockData";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export interface Filters {
  startDate: string;
  endDate: string;
  status: "All" | Status;
  city: string;
  funnel: "All" | Funnel;
  search: string;
}

interface Props {
  filters: Filters;
  setFilters: (f: Filters) => void;
  cities: string[];
  columns: Record<string, boolean>;
  setColumns: (c: Record<string, boolean>) => void;
  onExportPDF: () => void;
  onExportCSV: () => void;
  rightSlot?: React.ReactNode;
}


const colOptions = [
  { key: "impressions", label: "Impressions" },
  { key: "clicks", label: "Clicks" },
  { key: "cost", label: "Cost" },
  { key: "conversions", label: "Conversions" },
  { key: "ctr", label: "CTR" },
  { key: "cpc", label: "CPC" },
  { key: "cpm", label: "CPM" },
  { key: "cr", label: "CR" },
  { key: "cpa", label: "CPA" },
];

export function FilterPanel({ filters, setFilters, cities, columns, setColumns, onExportPDF, onExportCSV, rightSlot }: Props) {

  const update = <K extends keyof Filters>(k: K, v: Filters[K]) => setFilters({ ...filters, [k]: v });

  return (
    <div className="filter-panel glass rounded-2xl p-4 flex flex-wrap items-center gap-3 no-print">
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-background/40 border border-border">
        <Calendar className="w-4 h-4 text-muted-foreground" />
        <input type="date" value={filters.startDate} onChange={e => update("startDate", e.target.value)}
          className="bg-transparent text-sm outline-none [color-scheme:dark]" />
        <span className="text-muted-foreground text-xs">→</span>
        <input type="date" value={filters.endDate} onChange={e => update("endDate", e.target.value)}
          className="bg-transparent text-sm outline-none [color-scheme:dark]" />
      </div>

      <Select value={filters.status} onChange={v => update("status", v as Filters["status"])}
        options={[{ v: "All", l: "All status" }, { v: "Enabled", l: "Enabled" }, { v: "Paused", l: "Paused" }]} />
      <Select value={filters.city} onChange={v => update("city", v)}
        options={[{ v: "All", l: "All cities" }, ...cities.map(c => ({ v: c, l: c }))]} />
      <Select value={filters.funnel} onChange={v => update("funnel", v as Filters["funnel"])}
        options={[{ v: "All", l: "All funnels" }, { v: "TOFU", l: "TOFU" }, { v: "MOFU", l: "MOFU" }]} />

      <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-background/40 border border-border flex-1 min-w-[180px]">
        <Search className="w-4 h-4 text-muted-foreground" />
        <input placeholder="Search creatives, campaigns, cities..." value={filters.search}
          onChange={e => update("search", e.target.value)}
          className="bg-transparent text-sm outline-none flex-1" />
      </div>

      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="gap-2"><Columns3 className="w-4 h-4" /> Columns</Button>
        </PopoverTrigger>
        <PopoverContent className="w-56">
          <div className="space-y-1.5">
            {colOptions.map(o => (
              <label key={o.key} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-accent/50 px-2 py-1 rounded">
                <input type="checkbox" checked={columns[o.key]} onChange={e => setColumns({ ...columns, [o.key]: e.target.checked })} className="accent-[var(--gold)]" />
                {o.label}
              </label>
            ))}
          </div>
        </PopoverContent>
      </Popover>

      {rightSlot}
      <Button variant="outline" size="sm" onClick={onExportCSV} className="gap-2"><FileDown className="w-4 h-4" /> CSV</Button>
      <Button size="sm" onClick={onExportPDF} className="gap-2 bg-gold-gradient text-primary-foreground hover:opacity-90">
        <FileText className="w-4 h-4" /> Export PDF
      </Button>
    </div>
  );
}

  );
}

function Select({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: { v: string; l: string }[] }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)}
      className="px-3 py-1.5 rounded-lg bg-background/40 border border-border text-sm outline-none hover:border-gold/50 cursor-pointer">
      {options.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
    </select>
  );
}
