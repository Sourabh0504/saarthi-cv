import { useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer, Legend, ReferenceLine } from "recharts";
import type { Creative, DailyRow } from "@/data/mockData";
import { computeMetrics, fmtINR, fmtNum, fmtPct, getYouTubeId } from "@/lib/metrics";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  creative: Creative | null;
  onClose: () => void;
  daily: DailyRow[];
  startDate: string;
  endDate: string;
  /** all visible creative ids to compute dataset average baseline */
  comparisonIds: string[];
}

interface SeriesPoint {
  date: string;
  ctr: number;
  cpa: number;
  cpc: number;
  cost: number;
  impressions: number;
  clicks: number;
  conversions: number;
  avgCtr: number;
  avgCpa: number;
}

function buildSeries(daily: DailyRow[], creativeId: string, comparisonIds: string[], start: string, end: string): SeriesPoint[] {
  const inRange = daily.filter(r => r.date >= start && r.date <= end);
  const dates = Array.from(new Set(inRange.map(r => r.date))).sort();

  const own = new Map<string, DailyRow>();
  inRange.filter(r => r.creative_id === creativeId).forEach(r => own.set(r.date, r));

  // Daily benchmark = average across comparisonIds (excluding self)
  const otherIds = new Set(comparisonIds.filter(id => id !== creativeId));
  const benchByDate = new Map<string, { ctr: number[]; cpa: number[] }>();
  for (const r of inRange) {
    if (!otherIds.has(r.creative_id)) continue;
    if (r.impressions === 0) continue;
    const e = benchByDate.get(r.date) ?? { ctr: [], cpa: [] };
    e.ctr.push((r.clicks / r.impressions) * 100);
    if (r.conversions > 0) e.cpa.push(r.cost / r.conversions);
    benchByDate.set(r.date, e);
  }

  return dates.map(date => {
    const r = own.get(date);
    const m = computeMetrics({
      impressions: r?.impressions ?? 0,
      clicks: r?.clicks ?? 0,
      cost: r?.cost ?? 0,
      conversions: r?.conversions ?? 0,
    });
    const b = benchByDate.get(date);
    const avgCtr = b && b.ctr.length ? +(b.ctr.reduce((a, x) => a + x, 0) / b.ctr.length).toFixed(2) : 0;
    const avgCpa = b && b.cpa.length ? +(b.cpa.reduce((a, x) => a + x, 0) / b.cpa.length).toFixed(0) : 0;
    return {
      date: date.slice(5),
      ctr: m.ctr, cpa: m.cpa, cpc: m.cpc, cost: m.cost,
      impressions: m.impressions, clicks: m.clicks, conversions: m.conversions,
      avgCtr, avgCpa,
    };
  });
}

function Delta({ value, suffix, invert }: { value: number; suffix?: string; invert?: boolean }) {
  const positive = invert ? value < 0 : value > 0;
  const neutral = Math.abs(value) < 0.5;
  const Icon = neutral ? Minus : positive ? TrendingUp : TrendingDown;
  return (
    <span className={cn("inline-flex items-center gap-1 text-xs font-medium",
      neutral ? "text-muted-foreground" : positive ? "text-emerald-accent" : "text-destructive")}>
      <Icon className="w-3 h-3" />{value > 0 ? "+" : ""}{value.toFixed(1)}{suffix ?? "%"}
    </span>
  );
}

export function CreativeDetailModal({ creative, onClose, daily, startDate, endDate, comparisonIds }: Props) {
  const series = useMemo(() => {
    if (!creative) return [];
    return buildSeries(daily, creative.creative_id, comparisonIds, startDate, endDate);
  }, [creative, daily, comparisonIds, startDate, endDate]);

  const totals = useMemo(() => {
    if (!series.length) return null;
    const t = series.reduce((acc, s) => ({
      impressions: acc.impressions + s.impressions,
      clicks: acc.clicks + s.clicks,
      cost: acc.cost + s.cost,
      conversions: acc.conversions + s.conversions,
    }), { impressions: 0, clicks: 0, cost: 0, conversions: 0 });
    return computeMetrics(t);
  }, [series]);

  const avgs = useMemo(() => {
    if (!series.length) return { ctr: 0, cpa: 0 };
    const ctrs = series.filter(s => s.avgCtr > 0).map(s => s.avgCtr);
    const cpas = series.filter(s => s.avgCpa > 0).map(s => s.avgCpa);
    return {
      ctr: ctrs.length ? ctrs.reduce((a, x) => a + x, 0) / ctrs.length : 0,
      cpa: cpas.length ? cpas.reduce((a, x) => a + x, 0) / cpas.length : 0,
    };
  }, [series]);

  if (!creative || !totals) return null;

  const ytId = creative.creative_type === "Video" ? getYouTubeId(creative.creative_url) : null;
  const ctrDelta = avgs.ctr ? ((totals.ctr - avgs.ctr) / avgs.ctr) * 100 : 0;
  const cpaDelta = avgs.cpa && totals.cpa ? ((totals.cpa - avgs.cpa) / avgs.cpa) * 100 : 0;

  return (
    <Dialog open={!!creative} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display text-xl tracking-tight pr-8">
            {creative.headline ?? creative.creative_id}
          </DialogTitle>
          <div className="text-xs text-muted-foreground flex flex-wrap gap-1.5 pt-1">
            <span className="px-1.5 py-0.5 rounded bg-muted">{creative.creative_type}</span>
            <span className="px-1.5 py-0.5 rounded bg-muted">{creative.city}</span>
            <span className="px-1.5 py-0.5 rounded bg-muted">{creative.category}</span>
            <span className="px-1.5 py-0.5 rounded bg-gold/15 text-gold">{creative.funnel}</span>
            <span className="px-1.5 py-0.5 rounded bg-muted font-mono">{creative.campaign_name}</span>
          </div>
        </DialogHeader>

        <div className="grid md:grid-cols-[200px_1fr] gap-4 pt-2">
          {/* Preview */}
          <div className="aspect-square rounded-xl overflow-hidden border border-border bg-muted/40">
            {creative.creative_type === "Image" && (
              <img src={creative.creative_url} alt="" className="w-full h-full object-cover" />
            )}
            {ytId && (
              <img src={`https://i.ytimg.com/vi/${ytId}/hqdefault.jpg`} alt="" className="w-full h-full object-cover" />
            )}
            {creative.creative_type === "Text" && (
              <div className="w-full h-full p-3 bg-white text-[#202124] flex flex-col justify-center gap-1 text-xs">
                <div className="text-[#1a0dab] text-sm font-medium line-clamp-2">{creative.headline}</div>
                <p className="text-[#4d5156] line-clamp-4">{creative.description}</p>
              </div>
            )}
          </div>

          {/* KPI grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <Stat label="Impressions" value={fmtNum(totals.impressions)} />
            <Stat label="Clicks" value={fmtNum(totals.clicks)} />
            <Stat label="Spend" value={fmtINR(totals.cost)} accent />
            <Stat label="Conversions" value={totals.conversions.toFixed(1)} />
            <Stat label="CTR" value={fmtPct(totals.ctr)} delta={<Delta value={ctrDelta} />} sub={`avg ${fmtPct(avgs.ctr)}`} />
            <Stat label="CPC" value={fmtINR(totals.cpc)} />
            <Stat label="CR" value={fmtPct(totals.cr)} />
            <Stat label="CPA" value={fmtINR(totals.cpa)} delta={<Delta value={cpaDelta} invert />} sub={`avg ${fmtINR(avgs.cpa)}`} />
          </div>
        </div>

        {/* Charts */}
        <div className="grid lg:grid-cols-2 gap-4 pt-2">
          <ChartCard title="CTR vs. dataset avg" suffix="%">
            <LineChart data={series}>
              <CartesianGrid strokeDasharray="3 3" stroke="oklch(1 0 0 / 0.06)" />
              <XAxis dataKey="date" stroke="oklch(0.7 0.02 260)" fontSize={10} />
              <YAxis stroke="oklch(0.7 0.02 260)" fontSize={10} />
              <Tooltip contentStyle={tooltipStyle} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Line type="monotone" dataKey="ctr" name="This creative" stroke="var(--gold)" strokeWidth={2.5} dot={false} />
              <Line type="monotone" dataKey="avgCtr" name="Dataset avg" stroke="oklch(0.62 0.11 175)" strokeWidth={1.5} strokeDasharray="4 4" dot={false} />
            </LineChart>
          </ChartCard>

          <ChartCard title="CPA vs. dataset avg" suffix="₹">
            <LineChart data={series}>
              <CartesianGrid strokeDasharray="3 3" stroke="oklch(1 0 0 / 0.06)" />
              <XAxis dataKey="date" stroke="oklch(0.7 0.02 260)" fontSize={10} />
              <YAxis stroke="oklch(0.7 0.02 260)" fontSize={10} />
              <Tooltip contentStyle={tooltipStyle} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Line type="monotone" dataKey="cpa" name="This creative" stroke="var(--gold)" strokeWidth={2.5} dot={false} />
              <Line type="monotone" dataKey="avgCpa" name="Dataset avg" stroke="oklch(0.62 0.11 175)" strokeWidth={1.5} strokeDasharray="4 4" dot={false} />
              {avgs.cpa > 0 && <ReferenceLine y={avgs.cpa} stroke="oklch(0.62 0.11 175 / 0.3)" />}
            </LineChart>
          </ChartCard>

          <ChartCard title="Spend (₹)">
            <LineChart data={series}>
              <CartesianGrid strokeDasharray="3 3" stroke="oklch(1 0 0 / 0.06)" />
              <XAxis dataKey="date" stroke="oklch(0.7 0.02 260)" fontSize={10} />
              <YAxis stroke="oklch(0.7 0.02 260)" fontSize={10} />
              <Tooltip contentStyle={tooltipStyle} />
              <Line type="monotone" dataKey="cost" stroke="var(--gold)" strokeWidth={2} dot={false} />
            </LineChart>
          </ChartCard>

          <ChartCard title="Impressions & Clicks">
            <LineChart data={series}>
              <CartesianGrid strokeDasharray="3 3" stroke="oklch(1 0 0 / 0.06)" />
              <XAxis dataKey="date" stroke="oklch(0.7 0.02 260)" fontSize={10} />
              <YAxis yAxisId="l" stroke="oklch(0.7 0.02 260)" fontSize={10} />
              <YAxis yAxisId="r" orientation="right" stroke="oklch(0.7 0.02 260)" fontSize={10} />
              <Tooltip contentStyle={tooltipStyle} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Line yAxisId="l" type="monotone" dataKey="impressions" name="Impressions" stroke="var(--gold)" strokeWidth={2} dot={false} />
              <Line yAxisId="r" type="monotone" dataKey="clicks" name="Clicks" stroke="oklch(0.62 0.11 175)" strokeWidth={2} dot={false} />
            </LineChart>
          </ChartCard>
        </div>
      </DialogContent>
    </Dialog>
  );
}

const tooltipStyle: React.CSSProperties = {
  background: "oklch(0.18 0.012 260)",
  border: "1px solid oklch(1 0 0 / 0.1)",
  borderRadius: 8,
  fontSize: 11,
};

function Stat({ label, value, sub, delta, accent }: { label: string; value: string; sub?: string; delta?: React.ReactNode; accent?: boolean }) {
  return (
    <div className={cn("rounded-lg border border-border bg-background/40 p-2.5", accent && "border-gold/30 bg-gold/5")}>
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className="font-display font-bold text-base tabular-nums leading-tight mt-0.5">{value}</div>
      {(sub || delta) && (
        <div className="flex items-center justify-between gap-1 mt-1">
          {sub && <span className="text-[10px] text-muted-foreground">{sub}</span>}
          {delta}
        </div>
      )}
    </div>
  );
}

function ChartCard({ title, children, suffix }: { title: string; children: React.ReactElement; suffix?: string }) {
  return (
    <div className="rounded-xl border border-border bg-background/40 p-3">
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-xs font-display font-semibold uppercase tracking-widest text-muted-foreground">{title}</h4>
        {suffix && <span className="text-[10px] text-muted-foreground">{suffix}</span>}
      </div>
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">{children}</ResponsiveContainer>
      </div>
    </div>
  );
}
