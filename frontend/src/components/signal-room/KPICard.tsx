import { ArrowDown, ArrowRight, ArrowUp } from "lucide-react";
import { Area, AreaChart, ResponsiveContainer } from "recharts";
import type { KPIValue } from "@/lib/metrics";
import { cn } from "@/lib/utils";
import { Skeleton } from "./StateViews";

export function KPICard({
  label,
  kpi,
  loading,
  sparkline,
  style,
}: {
  label: string;
  kpi?: KPIValue | null;
  loading?: boolean;
  /** Optional real per-day values for this metric — renders a tiny trend line. Omit rather than fabricate when no daily series exists. */
  sparkline?: number[];
  style?: React.CSSProperties;
}) {
  if (loading || !kpi) {
    return (
      <div className="rounded-xl border border-sr-border bg-sr-card/60 p-4 backdrop-blur-2xl shadow-[var(--sr-shadow-xs)]">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="mt-3.5 h-7 w-24" />
        <Skeleton className="mt-3.5 h-5 w-16" />
      </div>
    );
  }

  const good = kpi.isBetter === true;
  const bad = kpi.isBetter === false;
  const Icon = kpi.direction === "up" ? ArrowUp : kpi.direction === "down" ? ArrowDown : ArrowRight;
  const sparkColor = good ? "hsl(var(--sr-success))" : bad ? "hsl(var(--sr-destructive))" : "hsl(var(--sr-primary))";
  const sparkData = sparkline?.map((v, i) => ({ i, v }));

  return (
    <div
      className="animate-sr-in group relative overflow-hidden rounded-xl border border-sr-border bg-sr-card/60 p-4 backdrop-blur-2xl shadow-[var(--sr-shadow-xs)] transition-all duration-200 hover:-translate-y-0.5 hover:border-sr-primary/30 hover:shadow-[var(--sr-shadow-md)]"
      style={style}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-sr-muted-foreground">{label}</p>
        {sparkData && sparkData.length > 1 && (
          <div className="h-8 w-16 shrink-0 opacity-80">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={sparkData} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id={`spark-${label.replace(/\s+/g, "")}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={sparkColor} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={sparkColor} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <Area type="monotone" dataKey="v" stroke={sparkColor} strokeWidth={1.75} fill={`url(#spark-${label.replace(/\s+/g, "")})`} dot={false} isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
      <p className="font-sr-num mt-2 text-[1.65rem] font-semibold leading-none text-sr-foreground">{kpi.formatted}</p>
      {kpi.pctChange !== null && (
        <div
          className={cn(
            "mt-3 inline-flex items-center gap-1 text-xs font-bold",
            good && "text-sr-success",
            bad && "text-sr-destructive",
            !good && !bad && "text-sr-muted-foreground",
          )}
        >
          <Icon className="h-3 w-3" strokeWidth={3} />
          <span className="font-sr-num">{Math.abs(kpi.pctChange).toFixed(1)}%</span>
        </div>
      )}
      <span
        aria-hidden="true"
        className="absolute bottom-0 left-0 h-0.5 w-full origin-left scale-x-0 bg-sr-primary/60 transition-transform duration-300 group-hover:scale-x-100"
      />
    </div>
  );
}
