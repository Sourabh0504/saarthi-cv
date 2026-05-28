import { useEffect, useRef, useState } from "react";
import { Bookmark, BookmarkPlus, Trash2, Check, Link2, Download, Upload } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import {
  loadViews,
  saveView,
  deleteView,
  importViews,
  exportViewsJSON,
  buildShareUrl,
  type SavedView,
  type SharedView,
} from "@/lib/savedViews";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface Props {
  current: SharedView;
  onLoad: (v: SharedView) => void;
}

export function SavedViewsMenu({ current, onLoad }: Props) {
  const [views, setViews] = useState<SavedView[]>([]);
  const [name, setName] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

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

  const copyShareLink = async (v: SavedView, e: React.MouseEvent) => {
    e.stopPropagation();
    const url = buildShareUrl(v);
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Share link copied", { description: "Paste to a teammate — link encodes the full view." });
    } catch {
      toast.error("Could not copy link");
    }
  };

  const copyCurrentLink = async () => {
    const url = buildShareUrl(current);
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Share link copied", { description: "Encodes filters, hierarchy, columns & selection." });
    } catch {
      toast.error("Could not copy link");
    }
  };

  const handleExport = () => {
    if (!views.length) { toast.error("Nothing to export"); return; }
    const blob = new Blob([exportViewsJSON(views)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `creativevisibility_views_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${views.length} view${views.length === 1 ? "" : "s"}`);
  };

  const handleImport = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const updated = importViews(String(reader.result));
        setViews(updated);
        toast.success("Views imported");
      } catch (err) {
        toast.error("Import failed", { description: err instanceof Error ? err.message : "Invalid file" });
      }
    };
    reader.readAsText(file);
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Bookmark className="w-4 h-4" /> Views
          {views.length > 0 && <span className="text-[10px] tabular-nums text-muted-foreground">({views.length})</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-3 space-y-3" align="end">
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
          <div className="flex items-center gap-1.5 mt-2">
            <Button size="sm" variant="outline" onClick={copyCurrentLink} className="flex-1 gap-1.5 justify-center">
              <Link2 className="w-3.5 h-3.5" /> Share current
            </Button>
          </div>
        </div>

        <div className="border-t border-border pt-2">
          <div className="flex items-center justify-between mb-1.5">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Saved</div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => fileRef.current?.click()}
                className="text-[10px] uppercase tracking-widest text-muted-foreground hover:text-gold transition flex items-center gap-1"
                title="Import JSON"
              >
                <Upload className="w-3 h-3" /> Import
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleImport(f);
                  e.target.value = "";
                }}
              />
              <span className="text-muted-foreground/40">·</span>
              <button
                onClick={handleExport}
                className="text-[10px] uppercase tracking-widest text-muted-foreground hover:text-gold transition flex items-center gap-1"
                title="Export all as JSON"
              >
                <Download className="w-3 h-3" /> Export
              </button>
            </div>
          </div>
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
                    onClick={(e) => copyShareLink(v, e)}
                    className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-gold/20 hover:text-gold transition"
                    aria-label="Copy share link"
                    title="Copy share link"
                  >
                    <Link2 className="w-3 h-3" />
                  </span>
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
