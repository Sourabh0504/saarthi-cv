import { useEffect, useState } from "react";
import { Bookmark, BookmarkPlus, Trash2, Check } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { loadViews, saveView, deleteView, type SavedView } from "@/lib/savedViews";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface Props {
  current: Omit<SavedView, "id" | "createdAt" | "name">;
  onLoad: (v: SavedView) => void;
}

export function SavedViewsMenu({ current, onLoad }: Props) {
  const [views, setViews] = useState<SavedView[]>([]);
  const [name, setName] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => { setViews(loadViews()); }, []);

  const handleSave = () => {
    const n = name.trim();
    if (!n) { toast.error("Name your view first"); return; }
    const updated = saveView({ name: n, ...current });
    setViews(updated);
    setActiveId(updated[0].id);
    setName("");
    toast.success(`Saved view “${n}”`);
  };

  const handleDelete = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setViews(deleteView(id));
    if (activeId === id) setActiveId(null);
  };

  const handleLoad = (v: SavedView) => {
    setActiveId(v.id);
    onLoad(v);
    toast.success(`Loaded “${v.name}”`);
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Bookmark className="w-4 h-4" /> Views
          {views.length > 0 && <span className="text-[10px] tabular-nums text-muted-foreground">({views.length})</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-3 space-y-3" align="end">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1.5">Save current view</div>
          <div className="flex items-center gap-1.5">
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleSave()}
              placeholder="e.g. Bridal · Bangalore · 30d"
              className="flex-1 text-sm bg-background/40 border border-border rounded-md px-2 py-1.5 outline-none focus:border-gold/50"
            />
            <Button size="icon" variant="outline" onClick={handleSave} className="shrink-0" aria-label="Save view">
              <BookmarkPlus className="w-4 h-4" />
            </Button>
          </div>
        </div>

        <div className="border-t border-border pt-2">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1.5">Saved</div>
          {views.length === 0 ? (
            <div className="text-xs text-muted-foreground py-3 text-center">No saved views yet.</div>
          ) : (
            <div className="space-y-0.5 max-h-64 overflow-y-auto -mx-1">
              {views.map(v => (
                <button
                  key={v.id}
                  onClick={() => handleLoad(v)}
                  className={cn(
                    "w-full text-left flex items-center gap-2 px-2 py-1.5 rounded-md transition group",
                    activeId === v.id ? "bg-gold/15 text-gold" : "hover:bg-accent/50"
                  )}
                >
                  {activeId === v.id ? <Check className="w-3 h-3 shrink-0" /> : <Bookmark className="w-3 h-3 shrink-0 opacity-60" />}
                  <div className="min-w-0 flex-1">
                    <div className="text-sm truncate">{v.name}</div>
                    <div className="text-[10px] text-muted-foreground truncate">
                      {v.filters.startDate} → {v.filters.endDate} · {v.selectedIds.length} creatives
                    </div>
                  </div>
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => handleDelete(v.id, e)}
                    className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-destructive/20 hover:text-destructive transition"
                    aria-label="Delete view"
                  >
                    <Trash2 className="w-3 h-3" />
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
