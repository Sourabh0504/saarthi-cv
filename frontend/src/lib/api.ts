/**
 * frontend/src/lib/api.ts
 * ========================
 * All HTTP calls to the FastAPI backend live here.
 * Import these functions instead of using fetch() directly anywhere.
 *
 * Base URL is controlled by VITE_API_URL in .env.local.
 * Falls back to http://localhost:8000 for local dev.
 *
 * ETag / IndexedDB:
 *   fetchRawPerformance() implements stale-while-revalidate using IndexedDB
 *   and HTTP ETag / If-None-Match. On return visits where data hasn't changed,
 *   the backend returns 304 Not Modified (no body). The function returns the
 *   IndexedDB entry instantly — zero network transfer overhead.
 */

import { idbGet, idbSet, idbClear, type CvCacheEntry } from "@/lib/idb";

const BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? "http://localhost:8000";

// ─────────────────────────────────────────────────────────────────────────────
// Shared types (mirrors backend response shapes)
// ─────────────────────────────────────────────────────────────────────────────

export interface Creative {
  creative_id:    string;
  creative_url:   string;
  creative_type:  "Image" | "Video" | "Text";
  campaign_name:  string;
  funnel:         "TOFU" | "MOFU";
  campaign_type:  string;
  ad_group:       string;
  city:           string;
  age_group:      string;
  category:       string;
  headline?:      string;
  description?:   string;
  status:         "Enabled" | "Paused";
  // Which sheet this creative came from (present on /api/current-structure)
  source_sheet?:  "Current_Pmax" | "Current_Dgen";
  // Performance (present on /api/performance responses)
  impressions?:   number;
  clicks?:        number;
  cost?:          number;
  conversions?:   number;
  // Computed metrics (also present on /api/performance)
  ctr?:           number;
  cpc?:           number;
  cpm?:           number;
  cr?:            number;
  cpa?:           number;
}

/**
 * Filter options — derived dynamically from sheet data.
 * Never hardcoded. Expands automatically as new cities, types, etc. are added.
 */
export interface FilterOptions {
  cities:          string[];
  campaign_types:  string[];
  campaign_names:  string[];
  categories:      string[];
  age_groups:      string[];
  funnels:         string[];
  statuses:        string[];
}

/**
 * A single daily performance row — used by CreativeDetailModal for charts.
 * In the current phase this is synthesised from aggregated data (one row per creative).
 * Future phase: dedicated /api/daily-detail endpoint for per-day granularity.
 */
export interface DailyRow {
  date:        string;
  creative_id: string;
  impressions: number;
  clicks:      number;
  cost:        number;
  conversions: number;
}

export interface PerformanceResponse {
  status:              "ok";
  served_from_cache:   boolean;
  date_range:          { start: string; end: string };
  /** Actual min/max dates of all visual rows in Daily_dump — used to auto-set date pickers */
  available_date_range?: { min: string; max: string };
  dimensions_count:    number;
  performance_count:   number;
  creatives:           Creative[];
  filter_options:      FilterOptions;
}

export interface TopPerformersResponse {
  status:     "ok";
  date_range: { start: string; end: string };
  metric:     string;
  filters:    { type: string | null; city: string | null };
  count:      number;
  results:    Creative[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal fetch helper
// ─────────────────────────────────────────────────────────────────────────────

async function apiFetch<T>(path: string, params?: Record<string, string>): Promise<T> {
  const url = new URL(`${BASE}${path}`);
  if (params) {
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== "") url.searchParams.set(k, v);
    });
  }

  const res = await fetch(url.toString(), {
    headers: { "Accept": "application/json" },
  });

  if (!res.ok) {
    const detail = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(detail?.detail ?? `API error ${res.status}`);
  }

  return res.json() as Promise<T>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetch all creative metadata + performance metrics for a date range.
 * This is the main data source for the portal.
 * Also returns filter_options (cities, campaign_types, etc.) — always dynamic.
 */
export async function fetchPerformance(start?: string, end?: string, status?: string): Promise<PerformanceResponse> {
  return apiFetch<PerformanceResponse>("/api/performance", {
    start: start ?? "",
    end: end ?? "",
    status: status ?? "",
  });
}

/**
 * Force-clear the backend cache and pre-warm last 30 days.
 * Call this after manually updating the Google Sheet.
 */
export async function syncCache(): Promise<{ status: string; message: string }> {
  const res = await fetch(`${BASE}/api/sync`, { method: "POST" });
  if (!res.ok) throw new Error(`Sync failed: ${res.statusText}`);
  return res.json();
}

/**
 * Health check — verifies the backend is reachable.
 */
export async function healthCheck(): Promise<{ status: string }> {
  return apiFetch<{ status: string }>("/health");
}

// ────────────────────────────────────────────────────────────────────────────────
// Current Structure
// ────────────────────────────────────────────────────────────────────────────────

export interface CurrentStructureResponse {
  status:            "ok";
  served_from_cache: boolean;
  count:             number;
  creatives:         Creative[];
  filter_options:    FilterOptions;
}

/**
 * Fetch the current live campaign structure from Current_Pmax + Current_Dgen sheets.
 * Returns Video creatives with no performance metrics.
 * Uses a separate cache key from the performance data.
 */
export async function fetchCurrentStructure(): Promise<CurrentStructureResponse> {
  return apiFetch<CurrentStructureResponse>("/api/current-structure");
}

// ─────────────────────────────────────────────────────────────────────────────
// Raw Performance (client-side aggregation model)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * One row of daily performance for one creative on one day.
 * Returned by /api/raw-performance; aggregated client-side in aggregator.ts.
 */
export interface RawDailyRow {
  creative_id: string;
  date:        string;   // "YYYY-MM-DD"
  impressions: number;
  clicks:      number;
  cost:        number;
  conversions: number;
}

/** Dimension fields keyed by creative_id (no performance, no duplication). */
export interface CreativeDimensionMap {
  [creative_id: string]: {
    creative_url:  string;
    creative_type: "Image" | "Video" | "Text";
    campaign_name: string;
    campaign_type: string;
    city:          string;
    funnel:        string;
    ad_group:      string;
    status:        "Enabled" | "Paused";
  };
}

export interface RawPerformanceResponse {
  status:              "ok";
  served_from_cache:   boolean;
  data_fetched_at:     string;
  available_date_range: { min: string; max: string };
  dimensions_count:    number;
  daily_rows_count:    number;
  dimensions:          CreativeDimensionMap;
  daily_rows:          RawDailyRow[];
  filter_options:      FilterOptions;
}

/**
 * Fetch ALL daily rows for ALL dates.
 * The frontend aggregates by date range client-side — no re-fetch needed
 * when the user changes the date picker.
 *
 * ETag + IndexedDB flow:
 *   1. Read IndexedDB for a cached entry (non-blocking, <5ms).
 *   2. If found: send If-None-Match header with stored ETag.
 *      → Backend returns 304 (data unchanged) → return IDB entry instantly.
 *      → Backend returns 200 (data changed)  → update IDB, return new data.
 *   3. If not found: normal fetch, store result in IDB.
 */
export async function fetchRawPerformance(): Promise<RawPerformanceResponse> {
  const IDB_KEY  = "raw_daily";
  const cached   = await idbGet(IDB_KEY);
  const headers: Record<string, string> = { Accept: "application/json" };

  if (cached?.etag) {
    headers["If-None-Match"] = `"${cached.etag}"`;
  }

  const url = `${BASE}/api/raw-performance`;
  const res = await fetch(url, { headers });

  // ── 304 Not Modified — data unchanged, use IndexedDB ───────────────────────
  if (res.status === 304 && cached) {
    return {
      ...cached.payload as RawPerformanceResponse,
      served_from_cache: true,
    };
  }

  if (!res.ok) {
    const detail = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(detail?.detail ?? `API error ${res.status}`);
  }

  // ── 200 OK — fresh data from backend ─────────────────────────────────
  const data = await res.json() as RawPerformanceResponse;

  // Extract ETag from response header (strip surrounding quotes if present)
  const rawEtag = res.headers.get("etag") ?? "";
  const etag    = rawEtag.replace(/^"|"$/g, "");

  // Persist to IndexedDB — atomic transaction, replaces any previous entry
  if (etag) {
    const entry: CvCacheEntry = {
      key:       IDB_KEY,
      payload:   data,
      etag,
      row_count: data.daily_rows_count ?? 0,
      stored_at: Date.now(),
    };
    await idbSet(entry);
  }

  return data;
}
