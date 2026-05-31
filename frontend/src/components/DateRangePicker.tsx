import { useState, useEffect, useMemo } from "react";
import { Calendar, ChevronLeft, ChevronRight, ChevronDown } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

// ── Date helpers ──────────────────────────────────────────────────────────────

function pad2(n: number) { return String(n).padStart(2, "0"); }
function toISO(y: number, m: number, d: number) { return `${y}-${pad2(m)}-${pad2(d)}`; }
function parseISO(s: string): [number, number, number] {
  const [y, m, d] = s.split("-").map(Number);
  return [y, m, d];
}
function daysInMonth(y: number, m: number) { return new Date(y, m, 0).getDate(); }
function firstDOW(y: number, m: number) { return new Date(y, m - 1, 1).getDay(); }
function addDays(iso: string, n: number) {
  const d = new Date(iso); d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}
function todayISO() { return new Date().toISOString().slice(0, 10); }

const MONTH_NAMES = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];
const SHORT_MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const DOW = ["Su","Mo","Tu","We","Th","Fr","Sa"];

function fmtDisplay(iso: string) {
  if (!iso) return "";
  const [y, m, d] = parseISO(iso);
  return `${SHORT_MONTHS[m - 1]} ${pad2(d)}, ${y}`;
}

// ── Presets ───────────────────────────────────────────────────────────────────

const PRESETS = [
  { id: "custom",     label: "Custom Range" },
  { id: "today",      label: "Today" },
  { id: "yesterday",  label: "Yesterday" },
  { id: "last7",      label: "Last 7 Days" },
  { id: "last30",     label: "Last 30 Days" },
  { id: "thisMonth",  label: "This Month" },
  { id: "lastMonth",  label: "Last Month" },
  { id: "thisYear",   label: "This Year" },
];

function getPresetRange(id: string): [string, string] {
  const t = todayISO();
  switch (id) {
    case "today":     return [t, t];
    case "yesterday": { const y = addDays(t, -1); return [y, y]; }
    case "last7":     return [addDays(t, -6), t];
    case "last30":    return [addDays(t, -29), t];
    case "thisMonth": {
      const [y, m] = parseISO(t);
      return [toISO(y, m, 1), t];
    }
    case "lastMonth": {
      const [y, m] = parseISO(t);
      const prevM = m === 1 ? 12 : m - 1;
      const prevY = m === 1 ? y - 1 : y;
      return [toISO(prevY, prevM, 1), toISO(prevY, prevM, daysInMonth(prevY, prevM))];
    }
    case "thisYear": {
      const [y] = parseISO(t);
      return [`${y}-01-01`, t];
    }
    default: return ["", ""];
  }
}

function detectPreset(start: string, end: string): string {
  for (const p of PRESETS) {
    if (p.id === "custom") continue;
    const [ps, pe] = getPresetRange(p.id);
    if (ps === start && pe === end) return p.id;
  }
  return "custom";
}

function comparePeriodLabel(start: string, end: string): string {
  if (!start || !end) return "";
  const n = Math.round((new Date(end).getTime() - new Date(start).getTime()) / 86400000) + 1;
  const cEnd = addDays(start, -1);
  const cStart = addDays(cEnd, -(n - 1));
  return `${fmtDisplay(cStart)} – ${fmtDisplay(cEnd)}`;
}

// ── Public types ──────────────────────────────────────────────────────────────

export interface DatePickerValue {
  startDate:   string;
  endDate:     string;
  compareMode: boolean;
}

interface Props {
  value:      DatePickerValue;
  onChange:   (v: DatePickerValue) => void;
  minDate?:   string;
  maxDate?:   string;
}

// ── DateRangePicker ───────────────────────────────────────────────────────────

export function DateRangePicker({ value, onChange, minDate, maxDate }: Props) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState({ start: value.startDate, end: value.endDate, compare: value.compareMode });
  const [stage, setStage]     = useState<"start" | "end">("start");
  const [hovered, setHovered] = useState<string | null>(null);

  // Left calendar view: year + month
  const initParts = value.startDate ? parseISO(value.startDate) : (() => { const n = new Date(); return [n.getFullYear(), n.getMonth() + 1, 1] as [number,number,number]; })();
  const [viewYear, setViewYear]   = useState<number>(initParts[0]);
  const [viewMonth, setViewMonth] = useState<number>(initParts[1]);

  // Right calendar = viewMonth + 1 (wraps year)
  const rightMonth = viewMonth === 12 ? 1  : viewMonth + 1;
  const rightYear  = viewMonth === 12 ? viewYear + 1 : viewYear;

  useEffect(() => {
    if (!open) return;
    setPending({ start: value.startDate, end: value.endDate, compare: value.compareMode });
    setStage("start");
    setHovered(null);
    if (value.startDate) {
      const [y, m] = parseISO(value.startDate);
      setViewYear(y); setViewMonth(m);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const activePreset = useMemo(() => detectPreset(pending.start, pending.end), [pending.start, pending.end]);

  const prevMonths = () => {
    if (viewMonth === 1) { setViewYear(y => y - 1); setViewMonth(12); }
    else setViewMonth(m => m - 1);
  };
  const nextMonths = () => {
    if (viewMonth === 12) { setViewYear(y => y + 1); setViewMonth(1); }
    else setViewMonth(m => m + 1);
  };

  const handleDay = (iso: string) => {
    if (stage === "start") {
      setPending(p => ({ ...p, start: iso, end: "" }));
      setStage("end");
    } else {
      if (iso < pending.start) {
        setPending(p => ({ ...p, start: iso, end: "" }));
        setStage("end");
      } else {
        setPending(p => ({ ...p, end: iso }));
        setStage("start");
      }
    }
  };

  const handlePreset = (id: string) => {
    if (id === "custom") return;
    const [s, e] = getPresetRange(id);
    setPending(p => ({ ...p, start: s, end: e }));
    setStage("start");
  };

  const handleApply = () => {
    if (!pending.start || !pending.end) return;
    onChange({ startDate: pending.start, endDate: pending.end, compareMode: pending.compare });
    setOpen(false);
  };

  // Effective end date: uses hover preview while picking end
  const displayEnd = stage === "end" && hovered && hovered >= pending.start ? hovered : pending.end;

  // Trigger label
  const triggerLabel = value.startDate && value.endDate
    ? `${fmtDisplay(value.startDate)} – ${fmtDisplay(value.endDate)}`
    : "Select date range";

  const cmpLabel = value.compareMode && value.startDate && value.endDate
    ? comparePeriodLabel(value.startDate, value.endDate)
    : null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "group/btn h-11 flex items-center gap-2.5 pl-2 pr-3 rounded-lg shrink-0",
            "border border-transparent transition-all duration-200",
            "hover:bg-white/[0.04] hover:border-[var(--gold)]/20",
            "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--gold)]/40",
            open && "bg-white/[0.04] border-[var(--gold)]/30",
          )}
        >
          <span className="flex items-center justify-center w-7 h-7 rounded-md bg-[var(--gold)]/10 border border-[var(--gold)]/15 shrink-0">
            <Calendar className="w-3.5 h-3.5 text-gold" />
          </span>
          <span className="flex flex-col items-start leading-tight">
            <span className="text-[9px] uppercase tracking-[0.18em] text-muted-foreground/70 font-semibold">Period</span>
            <span className="text-[12px] font-medium text-foreground whitespace-nowrap">{triggerLabel}</span>
          </span>
          {cmpLabel && (
            <span className="text-[10px] text-muted-foreground whitespace-nowrap hidden md:inline ml-1">
              vs {cmpLabel}
            </span>
          )}
          <ChevronDown className={cn(
            "w-3 h-3 ml-0.5 transition-all duration-200 shrink-0 text-muted-foreground/60",
            "group-hover/btn:text-gold",
            open && "rotate-180 text-gold",
          )} />
        </button>
      </PopoverTrigger>

      <PopoverContent
        align="start"
        sideOffset={6}
        className="p-0 w-auto shadow-2xl border border-white/10 overflow-hidden"
      >
        {/* ── Top bar: inputs + Apply ── */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-white/[0.07]">
          <DateInputBtn
            label={fmtDisplay(pending.start) || "Start date"}
            active={stage === "start"}
            onClick={() => setStage("start")}
          />
          <span className="text-muted-foreground text-xs">→</span>
          <DateInputBtn
            label={fmtDisplay(pending.end) || "End date"}
            active={stage === "end"}
            onClick={() => setStage("end")}
          />
          <div className="flex-1" />
          <button
            type="button"
            onClick={handleApply}
            disabled={!pending.start || !pending.end}
            className="px-4 py-1.5 rounded-md text-sm font-semibold bg-blue-600 hover:bg-blue-500 text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Apply
          </button>
        </div>

        {/* ── Body: sidebar + calendars ── */}
        <div className="flex">
          {/* Sidebar */}
          <div className="w-44 border-r border-white/[0.07] py-2 flex flex-col shrink-0">
            {PRESETS.map(p => (
              <button
                key={p.id}
                type="button"
                onClick={() => handlePreset(p.id)}
                className={cn(
                  "flex items-center gap-2.5 px-4 py-2 text-sm text-left transition-colors",
                  activePreset === p.id
                    ? "bg-blue-600/15 text-blue-400 font-medium"
                    : "text-muted-foreground hover:bg-white/5 hover:text-foreground",
                )}
              >
                <span className={cn(
                  "w-1.5 h-1.5 rounded-full shrink-0 transition-colors",
                  activePreset === p.id ? "bg-blue-500" : "bg-transparent",
                )} />
                {p.label}
              </button>
            ))}

            <div className="mx-4 my-2 border-t border-white/[0.07]" />

            {/* Compare toggle */}
            <div className="flex items-center justify-between px-4 py-2">
              <span className="text-sm text-muted-foreground">Compare</span>
              <button
                type="button"
                role="switch"
                aria-checked={pending.compare}
                onClick={() => setPending(p => ({ ...p, compare: !p.compare }))}
                className={cn(
                  "relative inline-flex h-5 w-9 items-center rounded-full transition-colors duration-200",
                  pending.compare ? "bg-blue-600" : "bg-white/15",
                )}
              >
                <span className={cn(
                  "inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform duration-200",
                  pending.compare ? "translate-x-[18px]" : "translate-x-[2px]",
                )} />
              </button>
            </div>

            {pending.compare && pending.start && pending.end && (
              <p className="px-4 pb-2 text-[10px] text-muted-foreground leading-relaxed">
                vs {comparePeriodLabel(pending.start, pending.end)}
              </p>
            )}

          </div>

          {/* Dual calendars + warnings stacked in a column */}
          <div className="flex flex-col">
            <div className="flex divide-x divide-white/[0.07]">
              <MonthGrid
                year={viewYear} month={viewMonth}
                start={pending.start} end={displayEnd}
                stage={stage}
                minDate={minDate} maxDate={maxDate}
                showPrev onPrev={prevMonths}
                onDayClick={handleDay}
                onHover={setHovered}
              />
              <MonthGrid
                year={rightYear} month={rightMonth}
                start={pending.start} end={displayEnd}
                stage={stage}
                minDate={minDate} maxDate={maxDate}
                showNext onNext={nextMonths}
                onDayClick={handleDay}
                onHover={setHovered}
              />
            </div>

            {/* ── Warnings below the calendar in red ── */}
            {(() => {
              const rangeOutside = pending.start && pending.end && (
                (minDate && pending.start < minDate) ||
                (maxDate && pending.end   > maxDate)
              );

              const cmpOutside = (() => {
                if (!pending.compare || !pending.start || !pending.end || !minDate) return null;
                const n      = Math.round((new Date(pending.end).getTime() - new Date(pending.start).getTime()) / 86_400_000) + 1;
                const cEnd   = addDays(pending.start, -1);
                const cStart = addDays(cEnd, -(n - 1));
                return cStart < minDate ? { cStart, cEnd } : null;
              })();

              if (!rangeOutside && !cmpOutside) return null;

              return (
                <div className="border-t border-white/[0.07] px-4 py-3 space-y-2">
                  {rangeOutside && (
                    <div className="flex items-start gap-2 px-3 py-2.5 rounded-md bg-red-500/10 border border-red-500/25">
                      <span className="text-red-400 shrink-0 mt-px text-sm leading-none">✕</span>
                      <p className="text-[11px] text-red-400 leading-relaxed">
                        <span className="font-semibold">No data available for this date range.</span>
                        {minDate && maxDate && (
                          <> Available data runs from <span className="font-medium">{fmtDisplay(minDate)}</span> to{" "}
                          <span className="font-medium">{fmtDisplay(maxDate)}</span>. Please try a different date.</>
                        )}
                      </p>
                    </div>
                  )}
                  {cmpOutside && (
                    <div className="flex items-start gap-2 px-3 py-2.5 rounded-md bg-red-500/10 border border-red-500/25">
                      <span className="text-red-400 shrink-0 mt-px text-sm leading-none">✕</span>
                      <p className="text-[11px] text-red-400 leading-relaxed">
                        <span className="font-semibold">Comparison period has insufficient data.</span>
                        {" "}The comparison window ({fmtDisplay(cmpOutside.cStart)} – {fmtDisplay(cmpOutside.cEnd)}) starts
                        before the earliest available data ({fmtDisplay(minDate!)}). The comparison will not be accurate.
                      </p>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ── DateInputBtn ──────────────────────────────────────────────────────────────

function DateInputBtn({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 px-3 py-1.5 rounded-md border text-sm transition-colors min-w-[130px]",
        active
          ? "border-blue-500 bg-blue-600/10 text-foreground"
          : "border-white/10 bg-white/[0.03] text-muted-foreground hover:border-white/20 hover:text-foreground",
      )}
    >
      <Calendar className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
      <span className="flex-1 text-left text-xs">{label}</span>
    </button>
  );
}

// ── MonthGrid ─────────────────────────────────────────────────────────────────

interface MonthGridProps {
  year: number; month: number;
  start: string; end: string;
  stage: "start" | "end";
  minDate?: string; maxDate?: string;
  showPrev?: boolean; onPrev?: () => void;
  showNext?: boolean; onNext?: () => void;
  onDayClick: (iso: string) => void;
  onHover:    (iso: string | null) => void;
}

function MonthGrid({ year, month, start, end, minDate, maxDate, showPrev, onPrev, showNext, onNext, onDayClick, onHover }: MonthGridProps) {
  const today = todayISO();

  // Build 42-cell grid (6 rows × 7 cols)
  const cells: Array<{ iso: string; current: boolean }> = [];

  const fdow    = firstDOW(year, month);
  const dim     = daysInMonth(year, month);
  const prevY   = month === 1 ? year - 1 : year;
  const prevM   = month === 1 ? 12 : month - 1;
  const dimPrev = daysInMonth(prevY, prevM);
  const nextY   = month === 12 ? year + 1 : year;
  const nextM   = month === 12 ? 1 : month + 1;

  // Leading prev-month days
  for (let i = fdow - 1; i >= 0; i--) {
    cells.push({ iso: toISO(prevY, prevM, dimPrev - i), current: false });
  }
  // Current month
  for (let d = 1; d <= dim; d++) {
    cells.push({ iso: toISO(year, month, d), current: true });
  }
  // Trailing next-month days
  for (let d = 1; cells.length < 42; d++) {
    cells.push({ iso: toISO(nextY, nextM, d), current: false });
  }

  return (
    <div className="p-4 select-none" style={{ width: 252 }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3 h-7">
        <button
          type="button"
          onClick={onPrev}
          className={cn(
            "p-1 rounded hover:bg-white/10 transition-colors text-muted-foreground",
            !showPrev && "invisible",
          )}
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span className="text-sm font-semibold text-foreground tracking-tight">
          {MONTH_NAMES[month - 1]} {year}
        </span>
        <button
          type="button"
          onClick={onNext}
          className={cn(
            "p-1 rounded hover:bg-white/10 transition-colors text-muted-foreground",
            !showNext && "invisible",
          )}
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Day-of-week labels */}
      <div className="grid grid-cols-7 mb-1">
        {DOW.map(d => (
          <div key={d} className="text-[10px] font-medium text-muted-foreground text-center py-1">
            {d}
          </div>
        ))}
      </div>

      {/* Day cells */}
      <div className="grid grid-cols-7">
        {cells.map(({ iso, current }) => {
          const disabled = !current
            || (!!minDate && iso < minDate)
            || (!!maxDate && iso > maxDate);
          const isStart     = iso === start;
          const isEnd       = iso === end;
          const isToday     = iso === today;
          const rangeActive = start && end && start !== end;
          const inRange     = !!rangeActive && iso > start && iso < end;
          const isStartEdge = !!rangeActive && isStart;
          const isEndEdge   = !!rangeActive && isEnd;

          return (
            <div
              key={iso}
              className="relative h-8 flex items-center justify-center"
              onMouseEnter={() => !disabled && onHover(iso)}
              onMouseLeave={() => onHover(null)}
            >
              {/* Range strip (fills full cell width) */}
              {inRange && (
                <div className="absolute inset-0 bg-blue-600/10" />
              )}
              {/* Half-strip at start: right half only */}
              {isStartEdge && (
                <div className="absolute top-0 bottom-0 right-0 w-1/2 bg-blue-600/10" />
              )}
              {/* Half-strip at end: left half only */}
              {isEndEdge && (
                <div className="absolute top-0 bottom-0 left-0 w-1/2 bg-blue-600/10" />
              )}

              {/* Day number circle */}
              <button
                type="button"
                disabled={disabled}
                onClick={() => !disabled && onDayClick(iso)}
                className={cn(
                  "relative z-10 w-7 h-7 rounded-full flex items-center justify-center text-xs transition-colors",
                  (isStart || isEnd)
                    ? "bg-blue-600 text-white font-semibold"
                    : isToday
                    ? "ring-1 ring-white/30 text-foreground"
                    : current && !disabled
                    ? "text-foreground hover:bg-white/10"
                    : "text-muted-foreground/40 cursor-default",
                )}
              >
                {String(parseInt(iso.slice(-2))).replace(/^0/, "")}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
