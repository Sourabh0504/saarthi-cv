/**
 * frontend/src/components/DeckPreview.tsx
 * ==========================================
 * Renders a Business Review deck (from /api/account-report) as a readable,
 * in-app slide preview using Saarthi's own theme tokens.
 *
 * Deliberately NOT a port of ContentMaster's pixel-perfect 1080×1350 engine —
 * the backend only emits 5 block types (cover/kpi-grid/progress-bar/compare/
 * timeline), so this renders exactly those. Pixel-perfect ContentMaster
 * rendering + PDF/PNG export is an explicit later phase; this is the fast,
 * in-app preview + browser-print path.
 */

import type { DeckResponse, DeckSlide } from "@/lib/api";
import { BarChart3, Target, PieChart, History, TrendingUp } from "lucide-react";

const BADGE_ICONS: Record<string, typeof BarChart3> = {
  BarChart3, Target, PieChart, History, TrendingUp,
};

export function DeckPreview({ deck }: { deck: DeckResponse }) {
  return (
    <div className="flex flex-col gap-6">
      {deck.slides.map((slide, i) => (
        <SlideCard key={slide.id ?? i} slide={slide} index={i} total={deck.slides.length} />
      ))}
    </div>
  );
}

function SlideCard({ slide, index, total }: { slide: DeckSlide; index: number; total: number }) {
  const BadgeIcon = slide.badge.icon ? BADGE_ICONS[slide.badge.icon] : undefined;
  const isCover = slide.template === "cover";

  return (
    <div
      className={`deck-slide rounded-2xl border border-border bg-card/60 backdrop-blur-2xl shadow-card p-8 ${isCover ? "text-center" : ""}`}
    >
      <div className={`flex items-center gap-2 ${isCover ? "justify-center" : ""}`}>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-gold/30 bg-gold/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-widest text-gold">
          {BadgeIcon && <BadgeIcon className="w-3 h-3" />}
          {slide.badge.label}
        </span>
        <span className="ml-auto text-[10px] text-muted-foreground">{index + 1} / {total}</span>
      </div>

      <h2 className={`mt-3 text-2xl font-bold tracking-tight text-foreground ${isCover ? "text-3xl mt-6" : ""}`}>
        {slide.title.part1}{" "}
        {slide.title.part2 && <span className="text-gold">{slide.title.part2}</span>}
      </h2>

      <div className={`mt-5 ${isCover ? "flex justify-center" : ""}`}>
        {slide.blocks.map((block, bi) => (
          <BlockRenderer key={bi} block={block} />
        ))}
      </div>
    </div>
  );
}

function BlockRenderer({ block }: { block: Record<string, unknown> }) {
  const type = block.type as string;

  switch (type) {
    case "lead":
      return <p className="text-sm text-muted-foreground">{String(block.text ?? "")}</p>;

    case "kpi-grid": {
      const items = (block.items as Array<{ value: string; label: string }>) ?? [];
      return (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          {items.map((it, i) => (
            <div key={i} className="rounded-xl border border-border bg-background/40 p-4">
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{it.label}</div>
              <div className="mt-1 text-xl font-bold text-foreground">{it.value}</div>
            </div>
          ))}
        </div>
      );
    }

    case "progress-bar": {
      const items = (block.items as Array<{ label: string; percent: number; sublabel?: string }>) ?? [];
      return (
        <div className="flex flex-col gap-4">
          {items.map((it, i) => (
            <div key={i}>
              <div className="flex items-baseline justify-between text-sm">
                <span className="text-foreground font-medium">{it.label}</span>
                {it.sublabel && <span className="text-xs text-muted-foreground">{it.sublabel}</span>}
              </div>
              <div className="mt-1.5 h-2.5 rounded-full bg-muted overflow-hidden">
                <div className="h-full bg-gold-gradient transition-all" style={{ width: `${Math.min(100, it.percent)}%` }} />
              </div>
              <div className="mt-1 text-xs text-muted-foreground">{it.percent}% of target</div>
            </div>
          ))}
        </div>
      );
    }

    case "compare": {
      const left = block.left as { heading: string; items: string[] };
      const right = block.right as { heading: string; items: string[] };
      return (
        <div className="grid grid-cols-2 gap-4">
          {[left, right].map((panel, i) => (
            <div key={i} className="rounded-xl border border-border bg-background/40 p-4">
              <div className="font-semibold text-foreground">{panel.heading}</div>
              <ul className="mt-2 flex flex-col gap-1.5">
                {panel.items.map((line, j) => (
                  <li key={j} className="text-sm text-muted-foreground">{line}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      );
    }

    case "timeline": {
      const items = (block.items as Array<{ marker: string; label: string; description?: string }>) ?? [];
      return (
        <div className="flex flex-col gap-3">
          {items.map((it, i) => (
            <div key={i} className="flex gap-3">
              <div className="shrink-0 w-20 text-xs text-muted-foreground pt-0.5">{it.marker}</div>
              <div className="border-l border-border pl-3">
                <div className="text-sm font-medium text-foreground">{it.label}</div>
                {it.description && <div className="text-xs text-muted-foreground">{it.description}</div>}
              </div>
            </div>
          ))}
        </div>
      );
    }

    default:
      return (
        <div className="rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground">
          Unsupported block type "{type}" (preview only renders the Business Review block set).
        </div>
      );
  }
}
