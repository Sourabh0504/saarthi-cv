import { useState } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { TrendPoint } from "@/lib/signalRoomData";
import { fmtINR0, fmtNum } from "@/lib/metrics";
import { cn } from "@/lib/utils";

type Metric = "cost" | "clicks" | "conversions" | "impressions";
const METRICS: { key: Metric; label: string }[] = [
  { key: "cost", label: "Spend" },
  { key: "clicks", label: "Clicks" },
  { key: "conversions", label: "Conversions" },
  { key: "impressions", label: "Impressions" },
];

function fmtShortDate(iso: string): string {
  return new Date(iso + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

export function TrendChart({ data }: { data: TrendPoint[] }) {
  const [metric, setMetric] = useState<Metric>("cost");
  const chartData = data.map((p) => ({ date: fmtShortDate(p.date), value: p[metric] }));
  const fmt = metric === "cost" ? fmtINR0 : fmtNum;

  return (
    <div className="card-hover-sr rounded-xl border border-sr-border bg-sr-card/60 p-5 backdrop-blur-2xl shadow-[var(--sr-shadow-xs)]">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-sr-foreground">Daily trend</h3>
          <p className="text-xs text-sr-muted-foreground">{METRICS.find((m) => m.key === metric)?.label} over time</p>
        </div>
        <div className="flex flex-wrap gap-0.5 rounded-lg border border-sr-border bg-sr-muted/40 p-0.5">
          {METRICS.map((m) => (
            <button
              key={m.key}
              onClick={() => setMetric(m.key)}
              className={cn(
                "rounded-md px-2.5 py-1 text-xs font-medium transition-all active:scale-95",
                metric === m.key ? "bg-sr-card text-sr-foreground shadow-[var(--sr-shadow-xs)]" : "text-sr-muted-foreground hover:text-sr-foreground",
              )}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>
      <div className="h-72 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 5, right: 8, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="srTrendFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(var(--sr-primary))" stopOpacity={0.28} />
                <stop offset="100%" stopColor="hsl(var(--sr-primary))" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="4 4" stroke="hsl(var(--sr-border))" vertical={false} />
            <XAxis dataKey="date" tick={{ fontSize: 11, fill: "hsl(var(--sr-muted-foreground))" }} tickLine={false} axisLine={false} minTickGap={24} />
            <YAxis tick={{ fontSize: 11, fill: "hsl(var(--sr-muted-foreground))" }} tickLine={false} axisLine={false} width={52} tickFormatter={(v) => fmt(v)} />
            <Tooltip
              cursor={{ stroke: "hsl(var(--sr-primary))", strokeWidth: 1, strokeDasharray: "4 4" }}
              contentStyle={{ background: "hsl(var(--sr-popover))", border: "1px solid hsl(var(--sr-border))", borderRadius: "0.6rem", color: "hsl(var(--sr-popover-foreground))", fontSize: "12px" }}
              formatter={(v: number) => [fmt(v), METRICS.find((m) => m.key === metric)?.label]}
            />
            <Area type="monotone" dataKey="value" stroke="hsl(var(--sr-primary))" strokeWidth={2.5} fill="url(#srTrendFill)" dot={false} activeDot={{ r: 4, fill: "hsl(var(--sr-primary))", stroke: "hsl(var(--sr-card))", strokeWidth: 2 }} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
