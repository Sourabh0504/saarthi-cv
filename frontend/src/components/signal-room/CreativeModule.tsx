import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle, ArrowDown, ArrowUp, Film, ImageIcon, Sparkles, TrendingDown, TrendingUp, Type as TypeIcon,
} from "lucide-react";
import { fetchRawPerformance, type HomeChannel, type RawPerformanceResponse } from "@/lib/api";
import { computeMetrics, safeDiv } from "@/lib/metrics";
import { fmtINR0, fmtNum } from "@/lib/metrics";
import { getYouTubeId } from "@/lib/metrics";
import { PageHeader } from "@/components/signal-room/PageHeader";
import { ChannelSelector } from "@/components/signal-room/ChannelSelector";
import { ErrorState, Skeleton, EmptyState } from "@/components/signal-room/StateViews";
import { cn } from "@/lib/utils";

type Format = "Image" | "Video" | "Text";
type Fatigue = "fresh" | "aging" | "fatigued";
type SortKey = "cpa" | "spend" | "ctr" | "impressions";

const FORMAT_ICON: Record<Format, typeof ImageIcon> = { Image: ImageIcon, Video: Film, Text: TypeIcon };
const FATIGUE_TONE: Record<Fatigue, "success" | "warning" | "danger"> = { fresh: "success", aging: "warning", fatigued: "danger" };
const SORT_LABEL: Record<SortKey, string> = { cpa: "CPA", spend: "Spend", ctr: "CTR", impressions: "Impressions" };

interface CreativeAgg {
  id: string;
  name: string;
  format: Format;
  thumbnailUrl: string;
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  ctr: number;
  cpa: number;
  fatigue: Fatigue;
  hue: number;
}

function seededHue(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 360;
  return h;
}

/** Real thumbnail if we have one (YouTube frame, or the creative's own image URL) — never a fake stock photo. */
function realThumbnail(url: string, format: Format): string | null {
  if (format === "Video") {
    const yt = getYouTubeId(url);
    if (yt) return `https://img.youtube.com/vi/${yt}/hqdefault.jpg`;
    return null;
  }
  if (format === "Image" && url) return url;
  return null;
}

function buildCreativeAggs(raw: RawPerformanceResponse): CreativeAgg[] {
  const byCreative = new Map<string, { impressions: number; clicks: number; cost: number; conversions: number; rows: { date: string; impressions: number; clicks: number }[] }>();
  for (const r of raw.daily_rows) {
    const entry = byCreative.get(r.creative_id) ?? { impressions: 0, clicks: 0, cost: 0, conversions: 0, rows: [] };
    entry.impressions += r.impressions;
    entry.clicks += r.clicks;
    entry.cost += r.cost;
    entry.conversions += r.conversions;
    entry.rows.push({ date: r.date, impressions: r.impressions, clicks: r.clicks });
    byCreative.set(r.creative_id, entry);
  }

  const out: CreativeAgg[] = [];
  for (const [creativeId, agg] of byCreative) {
    if (agg.impressions <= 0) continue; // no real activity — nothing to show
    const dim = raw.dimensions[creativeId];
    if (!dim || dim.status !== "Enabled") continue; // only active creatives, matching Lovable's "active creatives" framing
    const format: Format = dim.creative_type === "Video" ? "Video" : dim.creative_type === "Text" ? "Text" : "Image";
    const m = computeMetrics(agg);

    // Real fatigue signal: split this creative's own rows chronologically in
    // half and compare CTR — a genuine decay check, not a random label.
    const sorted = [...agg.rows].sort((a, b) => a.date.localeCompare(b.date));
    const mid = Math.floor(sorted.length / 2);
    const first = sorted.slice(0, mid);
    const second = sorted.slice(mid);
    const ctrOf = (rows: typeof sorted) => safeDiv(rows.reduce((s, r) => s + r.clicks, 0), rows.reduce((s, r) => s + r.impressions, 0)) * 100;
    let fatigue: Fatigue = "fresh";
    if (first.length >= 2 && second.length >= 2) {
      const ctrFirst = ctrOf(first);
      const ctrSecond = ctrOf(second);
      if (ctrFirst > 0) {
        const decayPct = ((ctrFirst - ctrSecond) / ctrFirst) * 100;
        if (decayPct >= 30) fatigue = "fatigued";
        else if (decayPct >= 12) fatigue = "aging";
      }
    }

    const thumb = realThumbnail(dim.creative_url, format);
    out.push({
      id: creativeId,
      name: dim.ad_name || `${dim.campaign_name} — ${dim.ad_group}`,
      format,
      thumbnailUrl: thumb ?? "",
      spend: agg.cost,
      impressions: agg.impressions,
      clicks: agg.clicks,
      conversions: agg.conversions,
      ctr: m.ctr,
      cpa: m.cpa,
      fatigue,
      hue: seededHue(creativeId),
    });
  }
  return out;
}

function Thumbnail({ c, className }: { c: CreativeAgg; className?: string }) {
  const Icon = FORMAT_ICON[c.format];
  if (c.thumbnailUrl) {
    return (
      <div className={cn("relative overflow-hidden bg-sr-muted", className)}>
        <img src={c.thumbnailUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />
        <div className="absolute left-3 top-3 rounded-md border border-white/20 bg-black/35 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-white/90 backdrop-blur">
          {c.format}
        </div>
      </div>
    );
  }
  // No real image available (e.g. Text creative, or non-YouTube video) — a
  // deterministic gradient placeholder, not a fabricated stock photo.
  return (
    <div
      className={cn("relative overflow-hidden", className)}
      style={{ background: `linear-gradient(135deg, hsl(${c.hue} 72% 42%), hsl(${(c.hue + 55) % 360} 60% 30%))` }}
    >
      <div className="absolute inset-0 flex items-center justify-center"><Icon className="h-10 w-10 text-white/90" /></div>
      <div className="absolute left-3 top-3 rounded-md border border-white/20 bg-black/35 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-white/90 backdrop-blur">
        {c.format}
      </div>
    </div>
  );
}

function Pill({ tone, children }: { tone: "success" | "warning" | "danger"; children: React.ReactNode }) {
  const cls = { success: "border-sr-success/30 bg-sr-success/10 text-sr-success", warning: "border-sr-warning/30 bg-sr-warning/10 text-sr-warning", danger: "border-sr-destructive/30 bg-sr-destructive/10 text-sr-destructive" }[tone];
  return <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium capitalize", cls)}>{children}</span>;
}

function MiniBar({ value, max, tone }: { value: number; max: number; tone: "success" | "warning" | "danger" | "primary" }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  const bar = { primary: "bg-sr-primary", success: "bg-sr-success", warning: "bg-sr-warning", danger: "bg-sr-destructive" }[tone];
  return <div className="h-1.5 w-full overflow-hidden rounded-full bg-sr-muted"><div className={cn("h-full rounded-full", bar)} style={{ width: `${pct}%` }} /></div>;
}

function KpiTile({ label, value, hint, icon: Icon, tone = "default" }: { label: string; value: string; hint?: string; icon?: typeof Sparkles; tone?: "default" | "success" | "danger" }) {
  const toneCls = tone === "success" ? "text-sr-success" : tone === "danger" ? "text-sr-destructive" : "text-sr-foreground";
  return (
    <div className="card-hover-sr rounded-2xl border border-sr-border bg-sr-card/60 backdrop-blur-2xl p-4">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-sr-muted-foreground">{label}</p>
        {Icon && <Icon className="h-3.5 w-3.5 text-sr-muted-foreground" aria-hidden="true" />}
      </div>
      <p className={cn("mt-2 text-2xl font-semibold tracking-tight", toneCls)}>{value}</p>
      {hint && <p className="mt-1 text-xs text-sr-muted-foreground">{hint}</p>}
    </div>
  );
}

function SegmentedGroup<T extends string>({ label, value, onChange, options }: { label?: string; value: T; onChange: (v: T) => void; options: { value: T; label: string }[] }) {
  return (
    <div className="flex items-center gap-1" role="group" aria-label={label}>
      {label && <span className="px-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-sr-muted-foreground">{label}</span>}
      <div className="flex items-center rounded-xl border border-sr-border bg-sr-background/60 p-0.5">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            aria-pressed={o.value === value}
            className={cn("rounded-lg px-3 py-1.5 text-xs font-medium transition-colors", o.value === value ? "bg-sr-primary text-sr-primary-foreground" : "text-sr-muted-foreground hover:bg-sr-muted hover:text-sr-foreground")}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * Real-data port of Lovable's Creative Workspace module. ROAS is replaced
 * with CPA throughout (no revenue/conversion-value field exists anywhere in
 * this pipeline — see the earlier Overview/Media honest-reductions), fatigue
 * is a real CTR-decay computation rather than a mock label, and thumbnails
 * are the creative's own real image/YouTube frame where available.
 */
export function CreativeModule({ channels }: { channels: HomeChannel[] }) {
  const [channelId, setChannelId] = useState(channels[0]?.id ?? "");
  const [raw, setRaw] = useState<RawPerformanceResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [formatFilter, setFormatFilter] = useState<"all" | Format>("all");
  const [fatigueFilter, setFatigueFilter] = useState<"all" | Fatigue>("all");
  const [sortKey, setSortKey] = useState<SortKey>("cpa");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc"); // CPA: lower is better, so ascending = best-first by default

  useEffect(() => {
    if (!channelId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchRawPerformance(channelId)
      .then((data) => { if (!cancelled) setRaw(data); })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load creatives."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [channelId]);

  const data = useMemo(() => (raw ? buildCreativeAggs(raw) : null), [raw]);

  const stats = useMemo(() => {
    if (!data?.length) return null;
    const totalSpend = data.reduce((s, c) => s + c.spend, 0);
    const totalConversions = data.reduce((s, c) => s + c.conversions, 0);
    const blendedCpa = safeDiv(totalSpend, totalConversions);
    const avgCtr = data.reduce((s, c) => s + c.ctr, 0) / data.length;
    const fresh = data.filter((c) => c.fatigue === "fresh").length;
    const fatigued = data.filter((c) => c.fatigue === "fatigued").length;
    const withConversions = data.filter((c) => c.conversions > 0);
    const best = (withConversions.length ? withConversions : data).slice().sort((a, b) => (withConversions.length ? a.cpa - b.cpa : b.ctr - a.ctr))[0];
    return { totalSpend, blendedCpa, avgCtr, fresh, fatigued, best };
  }, [data]);

  const filteredSorted = useMemo(() => {
    if (!data) return [];
    const rows = data.filter((c) => (formatFilter === "all" || c.format === formatFilter) && (fatigueFilter === "all" || c.fatigue === fatigueFilter));
    rows.sort((a, b) => (sortDir === "desc" ? b[sortKey] - a[sortKey] : a[sortKey] - b[sortKey]));
    return rows;
  }, [data, formatFilter, fatigueFilter, sortKey, sortDir]);

  const spotlight = stats?.best;
  const leaderboard = filteredSorted.filter((c) => c.id !== spotlight?.id);
  const maxSpend = Math.max(1, ...(data?.map((c) => c.spend) ?? [1]));
  const fatigueRisk = data?.filter((c) => c.fatigue !== "fresh") ?? [];
  const spendAtRisk = fatigueRisk.reduce((s, c) => s + c.spend, 0);

  return (
    <div>
      <PageHeader
        eyebrow="Creative Intelligence"
        title="Creative Workspace"
        subtitle={data ? `Ranking ${data.length} active creatives by ${SORT_LABEL[sortKey].toLowerCase()} — spotlight surfaces the top performer.` : "Which creatives drive results — and which are fatiguing"}
        actions={<ChannelSelector channels={channels.map((c) => ({ id: c.id, name: c.name }))} value={channelId} onChange={setChannelId} />}
      />

      {error && <ErrorState message={error} />}

      {stats && (
        <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <KpiTile label="Total spend" value={fmtINR0(stats.totalSpend)} hint={`${data!.length} active creatives`} />
          <KpiTile label="Blended CPA" value={fmtINR0(stats.blendedCpa)} hint="Spend / conversions" icon={TrendingUp} tone="success" />
          <KpiTile label="Avg CTR" value={`${stats.avgCtr.toFixed(2)}%`} hint="Across all formats" />
          <KpiTile label="Fresh creatives" value={`${stats.fresh}`} hint={`${data!.length - stats.fresh} need attention`} tone="success" />
          <KpiTile label="Fatigued" value={`${stats.fatigued}`} hint="Rotate or refresh soon" icon={TrendingDown} tone={stats.fatigued > 0 ? "danger" : "default"} />
        </div>
      )}

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-sr-border bg-sr-card/60 p-2 backdrop-blur-2xl">
        <div className="flex flex-wrap items-center gap-1.5">
          <SegmentedGroup label="Format" value={formatFilter} onChange={setFormatFilter} options={[{ value: "all", label: "All" }, { value: "Video", label: "Video" }, { value: "Image", label: "Image" }, { value: "Text", label: "Text" }]} />
          <div className="mx-1 h-6 w-px bg-sr-border" aria-hidden />
          <SegmentedGroup label="Fatigue" value={fatigueFilter} onChange={setFatigueFilter} options={[{ value: "all", label: "All" }, { value: "fresh", label: "Fresh" }, { value: "aging", label: "Aging" }, { value: "fatigued", label: "Fatigued" }]} />
        </div>
        <div className="flex items-center gap-1.5">
          <span className="px-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-sr-muted-foreground">Sort</span>
          <SegmentedGroup value={sortKey} onChange={setSortKey} options={(Object.keys(SORT_LABEL) as SortKey[]).map((k) => ({ value: k, label: SORT_LABEL[k] }))} />
          <button
            type="button"
            aria-label={`Sort ${sortDir === "desc" ? "descending" : "ascending"} — click to toggle`}
            onClick={() => setSortDir((d) => (d === "desc" ? "asc" : "desc"))}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-sr-muted-foreground hover:bg-sr-accent/50 hover:text-sr-foreground"
          >
            {sortDir === "desc" ? <ArrowDown className="h-4 w-4" /> : <ArrowUp className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {loading || !data ? (
        <div className="grid gap-4 lg:grid-cols-3">
          <Skeleton className="h-[420px] rounded-3xl lg:col-span-2" />
          <Skeleton className="h-[420px] rounded-3xl" />
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-48 rounded-2xl" />)}
        </div>
      ) : filteredSorted.length === 0 ? (
        <EmptyState title="No creatives match these filters" hint="Try clearing format or fatigue filters." />
      ) : (
        <div className="grid gap-4 lg:grid-cols-3">
          {spotlight && (
            <article className="group relative overflow-hidden rounded-3xl border border-sr-primary/40 bg-sr-card/60 backdrop-blur-2xl shadow-[var(--sr-shadow-md)] lg:col-span-2" aria-label={`Top performer: ${spotlight.name}`}>
              <div className="absolute left-4 top-4 z-10 inline-flex items-center gap-1.5 rounded-full bg-sr-primary px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-sr-primary-foreground shadow-lg">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-sr-primary-foreground" />
                Top Performer · #1
              </div>
              <Thumbnail c={spotlight} className="h-64 w-full" />
              <div className="space-y-5 p-6">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-xl font-semibold tracking-tight text-sr-foreground">{spotlight.name}</h2>
                    <p className="mt-0.5 text-sm text-sr-muted-foreground">{spotlight.format} · {fmtNum(spotlight.impressions)} impressions</p>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold text-sr-foreground">{fmtINR0(spotlight.spend)}</p>
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-sr-muted-foreground">Total Spend</p>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3 rounded-2xl border border-sr-border bg-sr-muted/40 p-4">
                  <div><p className="text-[10px] font-semibold uppercase tracking-widest text-sr-muted-foreground">CPA</p><p className="mt-1 text-lg font-bold text-sr-primary">{fmtINR0(spotlight.cpa)}</p></div>
                  <div><p className="text-[10px] font-semibold uppercase tracking-widest text-sr-muted-foreground">CTR</p><p className="mt-1 text-lg font-bold text-sr-primary">{spotlight.ctr}%</p></div>
                  <div><p className="text-[10px] font-semibold uppercase tracking-widest text-sr-muted-foreground">Status</p><Pill tone={FATIGUE_TONE[spotlight.fatigue]}>{spotlight.fatigue}</Pill></div>
                </div>
              </div>
            </article>
          )}

          <aside className="flex flex-col justify-between rounded-3xl border border-sr-border bg-sr-card/60 backdrop-blur-2xl p-6" aria-label="Fatigue watchlist">
            <div>
              <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-sr-warning/30 bg-sr-warning/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-sr-warning">
                <AlertTriangle className="h-3 w-3" aria-hidden="true" /> Fatigue Watchlist
              </div>
              <h3 className="text-lg font-semibold tracking-tight text-sr-foreground">{fatigueRisk.length} creatives need attention</h3>
              <p className="mt-1 text-sm text-sr-muted-foreground">{fmtINR0(spendAtRisk)} in spend is on aging or fatigued assets — refresh before CPA rises further.</p>
            </div>
            <ul className="mt-5 space-y-2.5">
              {fatigueRisk.slice(0, 4).map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-3 rounded-xl border border-sr-border/60 bg-sr-background/40 px-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-sr-foreground">{c.name}</p>
                    <p className="text-xs text-sr-muted-foreground">{fmtINR0(c.spend)} · {fmtINR0(c.cpa)} CPA</p>
                  </div>
                  <Pill tone={FATIGUE_TONE[c.fatigue]}>{c.fatigue}</Pill>
                </li>
              ))}
              {fatigueRisk.length === 0 && (
                <li className="rounded-xl border border-dashed border-sr-border px-3 py-4 text-center text-sm text-sr-muted-foreground">Portfolio is fresh — nothing to rotate.</li>
              )}
            </ul>
          </aside>

          {leaderboard.map((c, idx) => {
            const rank = idx + 2;
            return (
              <article key={c.id} className="group relative overflow-hidden rounded-3xl border border-sr-border bg-sr-card/60 backdrop-blur-2xl transition-all duration-300 hover:-translate-y-0.5 hover:border-sr-primary/40" aria-label={`Rank ${rank}: ${c.name}`}>
                <Thumbnail c={c} className="h-40 w-full" />
                <div className="absolute right-3 top-3"><Pill tone={FATIGUE_TONE[c.fatigue]}>{c.fatigue}</Pill></div>
                <div className="absolute -top-3 left-4 flex h-9 min-w-9 items-center justify-center rounded-xl border border-sr-border bg-sr-background px-2 text-sm font-bold tabular-nums text-sr-foreground shadow-md">#{rank}</div>
                <div className="space-y-3 p-5 pt-4">
                  <div className="min-w-0">
                    <h3 className="truncate font-semibold text-sr-foreground">{c.name}</h3>
                    <p className="mt-0.5 text-xs text-sr-muted-foreground">{c.format} · {fmtNum(c.impressions)} impr</p>
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs"><span className="text-sr-muted-foreground">Spend</span><span className="font-semibold tabular-nums text-sr-foreground">{fmtINR0(c.spend)}</span></div>
                    <MiniBar value={c.spend} max={maxSpend} tone={c.fatigue === "fatigued" ? "danger" : c.fatigue === "aging" ? "warning" : "primary"} />
                  </div>
                  <div className="grid grid-cols-2 gap-3 border-t border-sr-border/70 pt-3">
                    <div><p className="text-[10px] font-semibold uppercase tracking-widest text-sr-muted-foreground">CPA</p><p className="mt-0.5 text-base font-semibold text-sr-primary">{fmtINR0(c.cpa)}</p></div>
                    <div className="text-right"><p className="text-[10px] font-semibold uppercase tracking-widest text-sr-muted-foreground">CTR</p><p className="mt-0.5 text-base font-semibold text-sr-foreground">{c.ctr}%</p></div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
