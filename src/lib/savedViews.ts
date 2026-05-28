import type { Filters } from "@/components/FilterPanel";
import type { Dim } from "@/lib/hierarchy";

export interface SavedView {
  id: string;
  name: string;
  createdAt: number;
  filters: Filters;
  hierarchy: Dim[];
  columns: Record<string, boolean>;
  activeKey: string;
  selectedIds: string[];
}

const KEY = "cv-saved-views";

export function loadViews(): SavedView[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    return JSON.parse(raw) as SavedView[];
  } catch {
    return [];
  }
}

export function persistViews(views: SavedView[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify(views));
}

export function saveView(v: Omit<SavedView, "id" | "createdAt">): SavedView[] {
  const all = loadViews();
  const next: SavedView = { ...v, id: `v_${Date.now().toString(36)}`, createdAt: Date.now() };
  const updated = [next, ...all].slice(0, 30);
  persistViews(updated);
  return updated;
}

export function deleteView(id: string): SavedView[] {
  const all = loadViews().filter(v => v.id !== id);
  persistViews(all);
  return all;
}
