import { useMemo } from "react";
import { Trophy, Medal, Award, FileText } from "lucide-react";
import { copyText } from "@/lib/utils";
import type { Creative } from "@/lib/api";
import { type ComputedMetrics, fmtINR, fmtNum, fmtPct, getYouTubeId } from "@/lib/metrics";

interface Row { creative: Creative; metrics: ComputedMetrics; }

interface Props {
  rows: Row[];
  metric: "ctr" | "conversions" | "cpc" | "cpa";
}

const metricLabel: Record<Props["metric"], string> = {
  ctr: "CTR", conversions: "Conversions", cpc: "CPC", cpa: "CPA"
};
const metricFmt: Record<Props["metric"], (v: number) => string> = {
  ctr: fmtPct, conversions: (v) => v.toFixed(1), cpc: fmtINR, cpa: fmtINR,
};
const ascending = (m: Props["metric"]) => m === "cpc" || m === "cpa";

function rank(rows: Row[], metric: Props["metric"]) {
  const sorted = [...rows].sort((a, b) => {
    const av = a.metrics[metric]; const bv = b.metrics[metric];
    return ascending(metric) ? av - bv : bv - av;
  });
  // exclude 0 for ascending (CPC/CPA = 0 means no data)
  const filtered = ascending(metric) ? sorted.filter(r => r.metrics[metric] > 0) : sorted;
  return filtered.slice(0, 5);
}

const medals = [
  { icon: Trophy, color: "text-gold", bg: "bg-gold/15", label: "1st" },
  { icon: Medal,  color: "text-[#c0c0c0]", bg: "bg-white/10", label: "2nd" },
  { icon: Award,  color: "text-[#cd7f32]", bg: "bg-[#cd7f32]/15", label: "3rd" },
];

export function TopPerformers({ rows, metric }: Props) {
  const { images, videos } = useMemo(() => ({
    images: rank(rows.filter(r => r.creative.creative_type === "Image"), metric),
    videos: rank(rows.filter(r => r.creative.creative_type === "Video"), metric),
  }), [rows, metric]);

  return (
    <div className="grid lg:grid-cols-2 gap-6">
      <RankColumn title="Top Image Creatives" rows={images} metric={metric} />
      <RankColumn title="Top Video Creatives" rows={videos} metric={metric} />
    </div>
  );
}

function RankColumn({ title, rows, metric }: { title: string; rows: Row[]; metric: Props["metric"] }) {
  return (
    <div className="glass rounded-2xl p-5">
      <h3 className="font-display font-semibold text-lg mb-4 flex items-center gap-2">
        <span className="w-1 h-5 bg-gold-gradient rounded-full" />
        {title}
        <span className="ml-auto text-xs text-muted-foreground">by {metricLabel[metric]}</span>
      </h3>
      {rows.length === 0 && <div className="text-sm text-muted-foreground py-8 text-center">No creatives in this range.</div>}
      <div className="space-y-3">
        {rows.map((r, idx) => {
          const m = medals[idx] ?? { icon: Award, color: "text-muted-foreground", bg: "bg-muted", label: `${idx + 1}` };
          const Icon = m.icon;
          const ytId = r.creative.creative_type === "Video" ? getYouTubeId(r.creative.creative_url) : null;
          return (
            <div key={r.creative.creative_id} className="flex gap-3 p-3 rounded-xl bg-accent/30 hover:bg-accent/60 transition border border-transparent hover:border-gold/30">
              <div className={`shrink-0 w-12 h-12 rounded-lg ${m.bg} flex items-center justify-center`}>
                <Icon className={`w-5 h-5 ${m.color}`} />
              </div>
              <div className="shrink-0 w-20 h-12 rounded-lg overflow-hidden bg-muted">
                {r.creative.creative_type === "Image" && r.creative.creative_url && (
                  <img src={r.creative.creative_url} alt="" className="w-full h-full object-cover" />
                )}
                {ytId && <img src={`https://img.youtube.com/vi/${ytId}/mqdefault.jpg`} alt="" className="w-full h-full object-cover" />}
                {!r.creative.creative_url && !ytId && (
                  <div className="w-full h-full flex items-center justify-center">
                    <FileText className="w-4 h-4 text-muted-foreground" />
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-display font-semibold text-sm truncate">{r.creative.headline}</div>
                <div className="text-[11px] text-muted-foreground truncate">{r.creative.city} · {r.creative.category} · {r.creative.funnel}</div>
              </div>
              <div className="text-right">
                <button
                  type="button"
                  onClick={() => { void copyText(metricFmt[metric](r.metrics[metric])); }}
                  className="font-display font-bold text-gold tabular-nums cursor-copy"
                  title="Click to copy"
                >
                  {metricFmt[metric](r.metrics[metric])}
                </button>
                <button
                  type="button"
                  onClick={() => { void copyText(fmtNum(r.metrics.impressions)); }}
                  className="text-[10px] text-muted-foreground cursor-copy"
                  title="Click to copy"
                >
                  Impr {fmtNum(r.metrics.impressions)}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
