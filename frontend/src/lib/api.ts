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

import { idbGet, idbSet, type CvCacheEntry } from "@/lib/idb";
import { getStoredToken } from "@/lib/auth";

const BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? "http://localhost:8000";

// ─────────────────────────────────────────────────────────────────────────────
// Shared types (mirrors backend response shapes)
// ─────────────────────────────────────────────────────────────────────────────

export interface Creative {
  creative_id:    string;
  creative_url:   string;
  creative_type:  "Image" | "Video" | "Text";
  campaign_name:  string;
  // Google emits strictly "TOFU" | "MOFU"; Meta emits its own funnel-stage
  // strings (Awareness / Traffic / Conversions / ...). Widened to `string`
  // so one Creative type serves both platforms — narrow at the call site
  // (e.g. `creative.funnel === "MOFU"`) where Google-specific logic needs it.
  funnel:         string;
  campaign_type:  string;
  ad_group:       string;
  city:           string;
  age_group:      string;
  category:       string;
  headline?:      string;
  description?:   string;
  status:         "Enabled" | "Paused";
  // Which sheet this creative came from (present on /api/current-structure) — Google only.
  source_sheet?:  "Current_Pmax" | "Current_Dgen";
  // Meta "Ad name" — the human-readable creative name (Meta only; absent for Google).
  ad_name?:       string;
  // Performance (present on /api/performance responses)
  impressions?:   number;
  clicks?:        number;
  cost?:          number;
  conversions?:   number;
  // Computed metrics (also present on /api/performance)
  ctr?:           number;
  cpc?:           number;
  cpm?:           number;
  cr?:            number;   // Google: conversion rate
  cpa?:           number;   // Google: cost per acquisition
  cvr?:           number;   // Meta: conversion rate (leads / clicks) — same value as cr
  cpl?:           number;   // Meta: cost per lead (cost / leads) — same value as cpa
  // Extra Meta-only metrics — always optional, absent on Google creatives.
  landing_page_views?:   number;
  thruplays?:            number;
  hook_rate?:            number;
  video_avg_watch_time?: number;
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

  const token = getStoredToken();
  const res = await fetch(url.toString(), {
    headers: {
      "Accept": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  if (!res.ok) {
    const detail = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(detail?.detail ?? `API error ${res.status}`);
  }

  return res.json() as Promise<T>;
}

/** IndexedDB cache key for a channel's raw-daily dataset — every channel gets its own entry. */
export function rawPerformanceIdbKey(channelId: string): string {
  return `raw_daily_${channelId}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetch all creative metadata + performance metrics for a date range, for one channel.
 * Also returns filter_options (cities, campaign_types, etc.) — always dynamic.
 */
export async function fetchPerformance(channelId: string, start?: string, end?: string, status?: string): Promise<PerformanceResponse> {
  return apiFetch<PerformanceResponse>("/api/performance", {
    channel_id: channelId,
    start: start ?? "",
    end: end ?? "",
    status: status ?? "",
  });
}

/**
 * Force-clear one channel's backend cache and pre-warm its default range.
 * Call this after manually updating that channel's Google Sheet.
 */
export async function syncCache(channelId: string): Promise<{ status: string; message: string }> {
  const token = getStoredToken();
  const url = new URL(`${BASE}/api/sync`);
  url.searchParams.set("channel_id", channelId);
  const res = await fetch(url.toString(), {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(detail?.detail ?? `Sync failed: ${res.statusText}`);
  }
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
 * Fetch the current live campaign structure from Current_Pmax + Current_Dgen sheets, for one channel.
 * Returns Video creatives with no performance metrics.
 * Uses a separate cache key from the performance data.
 */
export async function fetchCurrentStructure(channelId: string): Promise<CurrentStructureResponse> {
  return apiFetch<CurrentStructureResponse>("/api/current-structure", { channel_id: channelId });
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
  // Extra Meta-only per-day metrics (carried through; Google rows never set these).
  landing_page_views?:   number;
  thruplays?:            number;
  hook_rate?:            number; // per-day fraction/percentage
  video_avg_watch_time?: number; // per-day seconds
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
    // Meta "Ad name" — absent for Google.
    ad_name?:      string;
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
 * Fetch ALL daily rows for ALL dates, for one channel.
 * The frontend aggregates by date range client-side — no re-fetch needed
 * when the user changes the date picker.
 *
 * ETag + IndexedDB flow:
 *   1. Read IndexedDB for a cached entry (non-blocking, <5ms).
 *   2. If found: send If-None-Match header with stored ETag.
 *      → Backend returns 304 (data unchanged) → return IDB entry instantly.
 *      → Backend returns 200 (data changed)  → update IDB, return new data.
 *   3. If not found: normal fetch, store result in IDB.
 *
 * IDB entries are keyed per channel (rawPerformanceIdbKey) so switching
 * between channels never serves one channel's cached data as another's.
 */
export async function fetchRawPerformance(channelId: string): Promise<RawPerformanceResponse> {
  const IDB_KEY  = rawPerformanceIdbKey(channelId);
  const cached   = await idbGet(IDB_KEY);
  const token    = getStoredToken();
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  if (cached?.etag) {
    headers["If-None-Match"] = `"${cached.etag}"`;
  }

  const url = new URL(`${BASE}/api/raw-performance`);
  url.searchParams.set("channel_id", channelId);
  const res = await fetch(url.toString(), { headers });

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

// ─────────────────────────────────────────────────────────────────────────────
// Home (accounts + channels the signed-in user can access)
// ─────────────────────────────────────────────────────────────────────────────

export interface HomeChannel {
  id:       string;
  name:     string;
  logo_url: string;
  platform: string; // "google_ads" | "meta_ads" | ... — drives icon + which dashboard route to open
}

export interface HomeAccount {
  id:           string;
  name:         string;
  logo_url:     string;
  team_name:    string;
  cluster_name: string;
  channels:     HomeChannel[];
}

export interface AccessGrant {
  role:       string;
  scope_type: string;
  scope_name: string;
}

export interface UserAccessSummary {
  is_super_admin: boolean;
  grants:         AccessGrant[];
}

export const ROLE_LABELS: Record<string, string> = {
  super_admin:  "Super Admin",
  cluster_head: "Cluster Head",
  team_head:    "Team Head",
  account_head: "Account Head",
};

/** One-line human summary of a user's access, for display in the profile. */
export function summarizeAccess(access: UserAccessSummary | null): string | null {
  if (!access) return null;
  if (access.is_super_admin) return "Super Admin (Full Access)";
  if (access.grants.length === 0) return null;
  const [first, ...rest] = access.grants;
  const label = `${ROLE_LABELS[first.role] ?? first.role} · ${first.scope_name}`;
  return rest.length > 0 ? `${label} +${rest.length} more` : label;
}

export interface HomeResponse {
  status:   "ok";
  user:     UserAccessSummary;
  accounts: HomeAccount[];
}

/**
 * Fetch the accounts + channels the current user has access to.
 * Requires auth — sends the stored JWT as a Bearer token.
 */
export async function fetchHomeData(): Promise<HomeResponse> {
  const token = getStoredToken();
  const res = await fetch(`${BASE}/api/home`, {
    headers: {
      "Accept": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  if (!res.ok) {
    const detail = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(detail?.detail ?? `API error ${res.status}`);
  }

  return res.json() as Promise<HomeResponse>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Account Overview (combined KPIs, targets, change log — across an account's channels)
// ─────────────────────────────────────────────────────────────────────────────

export interface AccountChannelBreakdown {
  channel_id:         string;
  channel_name:       string;
  platform:           string;
  impressions?:       number;
  clicks?:            number;
  cost?:              number;
  conversions?:       number;
  served_from_cache?: boolean;
  error?:             string;
}

export interface AccountSummaryTotals {
  impressions:         number;
  clicks:              number;
  cost:                number;
  conversions:         number;
  ctr:                 number;
  cpc:                 number;
  cpm:                 number;
  cost_per_conversion: number;
}

export interface AccountSummaryResponse {
  status:     "ok";
  partial:    boolean;
  date_range: { start: string; end: string };
  totals:     AccountSummaryTotals;
  channels:   AccountChannelBreakdown[];
}

/** Combined performance across every channel under one account, for a date range (defaults to the current month). */
export async function fetchAccountSummary(accountId: string, start?: string, end?: string): Promise<AccountSummaryResponse> {
  return apiFetch<AccountSummaryResponse>("/api/account-summary", {
    account_id: accountId,
    start: start ?? "",
    end: end ?? "",
  });
}

export interface AccountTargetResponse {
  found:         boolean;
  configured:    boolean;
  account_id?:   string;
  month?:        string;
  target_leads?: number;
  target_spend?: number;
}

/** This account's target for a given month ("YYYY-MM"). found=false if none set — not an error. */
export async function fetchAccountTarget(accountId: string, month: string): Promise<AccountTargetResponse> {
  return apiFetch<AccountTargetResponse>("/api/account-targets", { account_id: accountId, month });
}

export interface ChangeRecord {
  change_id:        string;
  timestamp:        string;
  account_id:        string;
  account_name:      string;
  change_category:   string;
  change_type:       string;
  previous_value?:   string;
  new_value?:        string;
  reason:            string;
  expected_impact?:  string;
  performed_by:      string;
  notes?:            string;
  priority:          string;
  approval_status:   string;
}

export interface ChangesResponse {
  configured: boolean;
  changes:    ChangeRecord[];
  error?:     string;
}

/** Most recent documented changes for an account. configured=false means the Change History sheet isn't deployed yet. */
export async function fetchRecentChanges(accountId: string, limit = 20): Promise<ChangesResponse> {
  return apiFetch<ChangesResponse>("/api/changes", { account_id: accountId, limit: String(limit) });
}

export interface NewChangeEntry {
  account_id:       string;
  change_category:  string;
  change_type:      string;
  previous_value?:  string;
  new_value?:       string;
  reason:           string;
  expected_impact?: string;
  notes?:           string;
  priority?:        string;
}

/** Document a new change. Throws if Change History isn't configured yet (503) or the request is invalid. */
export async function logChange(entry: NewChangeEntry): Promise<{ status: string; change_id: string; timestamp: string }> {
  const token = getStoredToken();
  const res = await fetch(`${BASE}/api/changes`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(entry),
  });

  if (!res.ok) {
    const detail = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(detail?.detail ?? `API error ${res.status}`);
  }

  return res.json();
}
