import { useMemo, useState } from "react";
import { ChevronRight, ChevronDown, Folder } from "lucide-react";
import type { Creative } from "@/data/mockData";
import { cn } from "@/lib/utils";

interface Props {
  creatives: Creative[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
}

type Tree = Record<string, Record<string, Record<string, Creative[]>>>;

function buildTree(items: Creative[]): Tree {
  const t: Tree = {};
  for (const c of items) {
    t[c.funnel] ??= {};
    t[c.funnel][c.campaign_type] ??= {};
    t[c.funnel][c.campaign_type][c.city] ??= [];
    t[c.funnel][c.campaign_type][c.city].push(c);
  }
  return t;
}

type CheckState = "checked" | "unchecked" | "indeterminate";

function TriCheckbox({ state, onClick }: { state: CheckState; onClick: () => void }) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className={cn(
        "w-4 h-4 rounded border flex items-center justify-center transition-all shrink-0",
        state === "checked" && "bg-gold border-gold",
        state === "indeterminate" && "bg-gold/40 border-gold",
        state === "unchecked" && "border-border hover:border-gold/60",
      )}
      aria-label={state}
    >
      {state === "checked" && <svg viewBox="0 0 16 16" className="w-3 h-3 text-primary-foreground"><path fill="currentColor" d="M6.5 11.5L3 8l1-1 2.5 2.5L12 4l1 1z"/></svg>}
      {state === "indeterminate" && <div className="w-2 h-0.5 bg-primary-foreground rounded" />}
    </button>
  );
}

export function CampaignTree({ creatives, selected, onChange }: Props) {
  const tree = useMemo(() => buildTree(creatives), [creatives]);
  const [openNodes, setOpenNodes] = useState<Set<string>>(() => {
    const s = new Set<string>();
    Object.keys(tree).forEach(f => s.add(f));
    return s;
  });

  const toggleOpen = (key: string) => {
    const next = new Set(openNodes);
    next.has(key) ? next.delete(key) : next.add(key);
    setOpenNodes(next);
  };

  const getState = (ids: string[]): CheckState => {
    const checked = ids.filter(id => selected.has(id)).length;
    if (checked === 0) return "unchecked";
    if (checked === ids.length) return "checked";
    return "indeterminate";
  };

  const toggleGroup = (ids: string[]) => {
    const state = getState(ids);
    const next = new Set(selected);
    if (state === "checked") ids.forEach(i => next.delete(i));
    else ids.forEach(i => next.add(i));
    onChange(next);
  };

  const toggleOne = (id: string) => {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    onChange(next);
  };

  return (
    <div className="space-y-1 text-sm">
      {Object.entries(tree).map(([funnel, types]) => {
        const funnelIds = Object.values(types).flatMap(c => Object.values(c).flat()).map(c => c.creative_id);
        const fKey = `f:${funnel}`;
        return (
          <div key={funnel}>
            <div className="flex items-center gap-2 py-1.5 px-2 rounded-md hover:bg-accent/50 cursor-pointer group" onClick={() => toggleOpen(fKey)}>
              {openNodes.has(fKey) ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />}
              <TriCheckbox state={getState(funnelIds)} onClick={() => toggleGroup(funnelIds)} />
              <span className="font-display font-semibold text-gold tracking-wide">{funnel}</span>
              <span className="ml-auto text-[10px] text-muted-foreground">{funnelIds.length}</span>
            </div>
            {openNodes.has(fKey) && Object.entries(types).map(([ct, cities]) => {
              const ctIds = Object.values(cities).flat().map(c => c.creative_id);
              const ctKey = `${fKey}:${ct}`;
              return (
                <div key={ct} className="ml-4">
                  <div className="flex items-center gap-2 py-1 px-2 rounded-md hover:bg-accent/50 cursor-pointer" onClick={() => toggleOpen(ctKey)}>
                    {openNodes.has(ctKey) ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />}
                    <TriCheckbox state={getState(ctIds)} onClick={() => toggleGroup(ctIds)} />
                    <Folder className="w-3.5 h-3.5 text-muted-foreground" />
                    <span>{ct}</span>
                  </div>
                  {openNodes.has(ctKey) && Object.entries(cities).map(([city, list]) => {
                    const cityIds = list.map(c => c.creative_id);
                    const cKey = `${ctKey}:${city}`;
                    return (
                      <div key={city} className="ml-4">
                        <div className="flex items-center gap-2 py-1 px-2 rounded-md hover:bg-accent/50 cursor-pointer" onClick={() => toggleOpen(cKey)}>
                          {openNodes.has(cKey) ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />}
                          <TriCheckbox state={getState(cityIds)} onClick={() => toggleGroup(cityIds)} />
                          <span className="text-muted-foreground">{city}</span>
                          <span className="ml-auto text-[10px] text-muted-foreground">{list.length}</span>
                        </div>
                        {openNodes.has(cKey) && list.map(cr => (
                          <div key={cr.creative_id} className="ml-6 flex items-center gap-2 py-1 px-2 rounded-md hover:bg-accent/50">
                            <TriCheckbox state={selected.has(cr.creative_id) ? "checked" : "unchecked"} onClick={() => toggleOne(cr.creative_id)} />
                            <span className={cn("text-xs truncate", cr.status === "Paused" && "opacity-50 line-through")} title={cr.headline}>
                              {cr.headline ?? cr.creative_id}
                            </span>
                            <span className={cn("ml-auto text-[10px] px-1.5 py-0.5 rounded",
                              cr.creative_type === "Image" && "bg-emerald-accent/15 text-emerald-accent",
                              cr.creative_type === "Video" && "bg-gold/15 text-gold",
                              cr.creative_type === "Text" && "bg-muted text-muted-foreground",
                            )}>{cr.creative_type[0]}</span>
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
