import { ExternalLink, ImageOff } from "lucide-react";
import { useState } from "react";
import type { Creative } from "@/lib/api";
import { type ComputedMetrics, fmtINR, fmtNum, fmtPct, getYouTubeId } from "@/lib/metrics";
import { cn } from "@/lib/utils";

interface Props {
  creative: Creative;
  metrics: ComputedMetrics;
  selected: boolean;
  onToggle: () => void;
  visibleCols: Record<string, boolean>;
}

const colDefs: { key: keyof ComputedMetrics; label: string; fmt: (v: number) => string }[] = [
  { key: "impressions", label: "Impr.", fmt: fmtNum },
  { key: "clicks", label: "Clicks", fmt: fmtNum },
  { key: "cost", label: "Cost", fmt: fmtINR },
  { key: "conversions", label: "Conv.", fmt: (v) => v.toFixed(1) },
  { key: "ctr", label: "CTR", fmt: fmtPct },
  { key: "cpc", label: "CPC", fmt: fmtINR },
  { key: "cpm", label: "CPM", fmt: fmtINR },
  { key: "cr", label: "CR", fmt: fmtPct },
  { key: "cpa", label: "CPA", fmt: fmtINR },
];

export function CreativeCard({ creative, metrics, selected, onToggle, visibleCols }: Props) {
  const [imgError, setImgError] = useState(false);
  const ytId = creative.creative_type === "Video" ? getYouTubeId(creative.creative_url) : null;

  return (
    <div className={cn(
      "creative-card glass rounded-2xl overflow-hidden flex flex-col transition-all duration-300 group",
      "hover:shadow-gold hover:-translate-y-0.5 hover:border-gold/40",
      selected && "ring-1 ring-gold border-gold/50",
    )}>
      {/* Media */}
      <div className="relative aspect-video bg-muted/30 overflow-hidden">
        {creative.creative_type === "Image" && !imgError && (
          <img src={creative.creative_url} alt={creative.headline ?? creative.creative_id}
            onError={() => setImgError(true)}
            className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" />
        )}
        {creative.creative_type === "Image" && imgError && (
          <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground gap-2">
            <ImageOff className="w-8 h-8" />
            <span className="text-xs">Asset preview unavailable</span>
          </div>
        )}
        {creative.creative_type === "Video" && ytId && (
          <iframe className="w-full h-full" src={`https://www.youtube.com/embed/${ytId}`} title={creative.headline ?? ytId} allowFullScreen />
        )}
        {creative.creative_type === "Video" && !ytId && (
          <a href={creative.creative_url} className="w-full h-full flex items-center justify-center text-gold underline">Open video</a>
        )}
        {creative.creative_type === "Text" && (
          <div className="w-full h-full p-5 bg-white text-left flex flex-col gap-1 justify-center">
            <div className="text-[11px] text-[#202124] flex items-center gap-1">
              <span className="inline-block w-4 h-4 rounded-full bg-[#4285F4]" />
              <span>Ad · <span className="text-[#202124]/80">{new URL(creative.creative_url).hostname}</span></span>
            </div>
            <a href={creative.creative_url} className="text-[#1a0dab] text-lg leading-tight font-medium hover:underline">{creative.headline}</a>
            <p className="text-[13px] text-[#4d5156] leading-snug line-clamp-2">{creative.description}</p>
          </div>
        )}

        {/* Type badge + checkbox */}
        <div className="absolute top-2 left-2 flex items-center gap-1.5 no-print">
          <button onClick={onToggle}
            className={cn("w-5 h-5 rounded border flex items-center justify-center backdrop-blur-md transition",
              selected ? "bg-gold border-gold" : "bg-background/60 border-border hover:border-gold")}>
            {selected && <svg viewBox="0 0 16 16" className="w-3 h-3 text-primary-foreground"><path fill="currentColor" d="M6.5 11.5L3 8l1-1 2.5 2.5L12 4l1 1z"/></svg>}
          </button>
          <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded backdrop-blur-md bg-background/60 border border-border font-medium">
            {creative.creative_type}
          </span>
        </div>
        {creative.status === "Paused" && (
          <span className="absolute top-2 right-2 text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-destructive/20 text-destructive border border-destructive/30 backdrop-blur-md">Paused</span>
        )}
      </div>

      {/* Body */}
      <div className="p-4 flex flex-col gap-3 flex-1">
        <div>
          <h3 className="font-display font-semibold text-sm leading-snug line-clamp-1">{creative.headline ?? creative.campaign_name}</h3>
          <p className="text-[11px] text-muted-foreground mt-0.5 font-mono">{creative.campaign_name}</p>
        </div>

        <div className="flex flex-wrap gap-1">
          <Pill>{creative.city}</Pill>
          <Pill>{creative.category}</Pill>
          <Pill>{creative.age_group}</Pill>
          <Pill tone="gold">{creative.funnel}</Pill>
        </div>

        <div className="grid grid-cols-3 gap-2 mt-auto pt-3 border-t border-border">
          {colDefs.filter(c => visibleCols[c.key as string]).map(c => (
            <div key={c.key} className="text-left">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{c.label}</div>
              <div className="font-display font-semibold text-sm tabular-nums">{c.fmt(metrics[c.key])}</div>
            </div>
          ))}
        </div>

        <a href={creative.creative_url} target="_blank" rel="noreferrer"
          className="verify-link text-[11px] text-muted-foreground hover:text-gold inline-flex items-center gap-1 truncate">
          <ExternalLink className="w-3 h-3 shrink-0" />
          <span className="truncate">{creative.creative_url}</span>
        </a>
      </div>
    </div>
  );
}

function Pill({ children, tone }: { children: React.ReactNode; tone?: "gold" }) {
  return (
    <span className={cn(
      "text-[10px] px-2 py-0.5 rounded-full border",
      tone === "gold" ? "bg-gold/10 border-gold/30 text-gold" : "bg-muted/40 border-border text-muted-foreground"
    )}>{children}</span>
  );
}
