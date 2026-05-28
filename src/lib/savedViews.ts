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

export type SharedView = Omit<SavedView, "id" | "createdAt" | "name"> & { name?: string };


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

export function importViews(json: string): SavedView[] {
  const parsed = JSON.parse(json);
  const arr: SavedView[] = Array.isArray(parsed) ? parsed : [parsed];
  const valid = arr.filter(v => v && v.filters && v.hierarchy && v.columns);
  if (!valid.length) throw new Error("No valid views in file");
  const existing = loadViews();
  const merged = [
    ...valid.map(v => ({
      ...v,
      id: `v_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`,
      createdAt: v.createdAt ?? Date.now(),
    })),
    ...existing,
  ].slice(0, 30);
  persistViews(merged);
  return merged;
}

export function exportViewsJSON(views: SavedView[]): string {
  return JSON.stringify(views, null, 2);
}

// ---- Share token (base64url JSON) ----
function b64urlEncode(s: string): string {
  const b = typeof btoa !== "undefined" ? btoa(unescape(encodeURIComponent(s))) : Buffer.from(s).toString("base64");
  return b.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64urlDecode(s: string): string {
  const pad = s.length % 4 ? "=".repeat(4 - (s.length % 4)) : "";
  const b = s.replace(/-/g, "+").replace(/_/g, "/") + pad;
  return typeof atob !== "undefined" ? decodeURIComponent(escape(atob(b))) : Buffer.from(b, "base64").toString("utf8");
}

export function encodeShareToken(v: SharedView): string {
  return b64urlEncode(JSON.stringify(v));
}

export function decodeShareToken(token: string): SharedView | null {
  try {
    const v = JSON.parse(b64urlDecode(token));
    if (!v?.filters || !v?.hierarchy || !v?.columns) return null;
    return v as SharedView;
  } catch {
    return null;
  }
}

export function buildShareUrl(v: SharedView): string {
  if (typeof window === "undefined") return "";
  const { origin, pathname } = window.location;
  return `${origin}${pathname}#view=${encodeShareToken(v)}`;
}

export function readSharedViewFromHash(): SharedView | null {
  if (typeof window === "undefined") return null;
  const h = window.location.hash;
  const m = h.match(/[#&]view=([^&]+)/);
  if (!m) return null;
  return decodeShareToken(m[1]);
}

export function clearShareHash() {
  if (typeof window === "undefined") return;
  if (window.location.hash.includes("view=")) {
    history.replaceState(null, "", window.location.pathname + window.location.search);
  }
}
