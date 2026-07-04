"""
backend/apps_script_connector.py
=================================
Async connector between FastAPI and the Apps Script Web App.

What changed vs. the original:
  1. Module-level persistent httpx.AsyncClient
       — Reuses TCP connections across requests. Saves ~200ms per cold call.
       — Closed gracefully in FastAPI lifespan (close_http_client()).
  2. Per-key asyncio.Lock (Isolation — prevents thundering herd)
       — If 10 requests arrive simultaneously with the same cache MISS,
         only ONE calls Apps Script. The other 9 wait, then read from cache.
       — Uses double-checked locking: cache is re-read inside the lock.
  3. Payload integrity validation (_validate_payload)
       — Rejects Apps Script responses with status != "ok".
       — Rejects empty dimensions/daily_rows (partial read detection).
       — Raises ValueError → caller returns HTTP 502.
  4. row_count passed to cache.set_cached()
       — Stored in SQLite for integrity auditing at the DB layer.

Multi-channel: every fetch function takes a channel_id and resolves its own
Apps Script URL via org_access.get_channel_secrets() (org_data/org_secrets.json)
instead of one hardcoded global URL. Cache keys are prefixed with "{channel_id}:"
so hundreds of accounts/channels can share this same cache table and lock
registry without colliding. Fetching is lazy — first request for a channel
triggers the Apps Script call; there is no eager pre-warm-everything on startup.

Flow (with cache tiers):
  1. Memory cache HIT  → return (<1ms)
  2. SQLite cache HIT  → backfill memory → return (~2ms)
  3. Acquire per-key asyncio.Lock (no thundering herd)
  4. Re-check cache inside lock (double-check locking)
  5. If still MISS → call this channel's Apps Script URL (800ms–90s cold-start)
  6. Validate integrity → raise ValueError if invalid
  7. Merge dimensions + performance → enrich metrics
  8. Write to SQLite + memory (atomic SQLite write)
  9. Return result
"""

from __future__ import annotations

import asyncio
from collections import defaultdict
from typing import Optional

import httpx

import cache as cache_module
from calculator import enrich_all as _enrich_google
from calculator_meta import enrich_all as _enrich_meta
from org_access import get_channel_secrets, get_channel_platform

# ── HTTP timeout ──────────────────────────────────────────────────────────────
_TIMEOUT = httpx.Timeout(connect=15.0, read=120.0, write=30.0, pool=15.0)

# ── Persistent HTTP client ────────────────────────────────────────────────────
# Module-level singleton. Reuses TCP connections — eliminates per-request
# TCP handshake (~200ms). Created on first use, closed in FastAPI lifespan.
_http_client: Optional[httpx.AsyncClient] = None
_client_lock: asyncio.Lock = asyncio.Lock()


async def _get_client() -> httpx.AsyncClient:
    """Return the shared AsyncClient, creating it lazily and thread-safely."""
    global _http_client
    async with _client_lock:
        if _http_client is None or _http_client.is_closed:
            _http_client = httpx.AsyncClient(
                timeout=_TIMEOUT,
                follow_redirects=True,   # Apps Script always issues a 302 redirect
            )
    return _http_client


async def close_http_client() -> None:
    """Gracefully close the shared client. Called by FastAPI lifespan on shutdown."""
    global _http_client
    if _http_client is not None and not _http_client.is_closed:
        await _http_client.aclose()
        _http_client = None


# ── Per-key fetch locks (Isolation — thundering herd prevention) ──────────────
# One lock per cache key. If 10 coroutines all miss the same key simultaneously,
# only 1 calls Apps Script. The other 9 wait and read from cache after it writes.
_fetch_locks: dict[str, asyncio.Lock] = defaultdict(asyncio.Lock)


# ── Integrity validation ──────────────────────────────────────────────────────

def _validate_payload(raw: dict, context: str = "") -> None:
    """
    Raise ValueError if the Apps Script response fails any integrity check.

    Checks:
      1. status == "ok"          — Apps Script did not return an error
      2. Non-empty top-level key  — no silent partial reads
    """
    if raw.get("status") != "ok":
        raise ValueError(
            f"Apps Script returned error ({context}): {raw.get('message', 'unknown')}"
        )


def _to_float(value) -> float:
    """Safely coerce a value to float — handles empty strings, None, etc."""
    try:
        return float(value) if value not in (None, "", " ") else 0.0
    except (TypeError, ValueError):
        return 0.0


def _apps_script_url_for(channel_id: str) -> str:
    """Look up a channel's Apps Script Web App URL from org_secrets.json."""
    url = get_channel_secrets(channel_id).get("apps_script_url")
    if not url:
        raise ValueError(f"No Apps Script URL configured for channel '{channel_id}'.")
    return url


def raw_daily_cache_key(channel_id: str) -> str:
    """Cache key for a channel's raw-daily dataset — shared with main.py's ETag lookup."""
    return f"{channel_id}:raw_daily"


# Fields beyond the core 4 (impressions/clicks/cost/conversions) that some
# platforms' Apps Script already aggregates server-side (e.g. Meta's
# hook_rate/thruplays) — carried through untouched if the platform's response
# includes them, ignored otherwise.
_OPTIONAL_PERF_FIELDS = ("landing_page_views", "thruplays", "hook_rate", "video_avg_watch_time")


def _enrich_for(channel_id: str, merged: list[dict]) -> list[dict]:
    """Dispatch to the right calculator module based on the channel's platform."""
    platform = get_channel_platform(channel_id)
    if platform == "meta_ads":
        return _enrich_meta(merged)
    return _enrich_google(merged)


# ─────────────────────────────────────────────────────────────────────────────
# fetch_data — Aggregated performance for a date range
# ─────────────────────────────────────────────────────────────────────────────

async def fetch_data(
    channel_id: str,
    start: str | None = None,
    end:   str | None = None,
    status: str | None = None,
) -> dict:
    """
    Fetch and return enriched creative data for the given channel + date range.

    Returns a dict with shape:
    {
      "served_from_cache": bool,
      "date_range":        {"start": str, "end": str},
      "creatives":         [...],          ← merged dimensions + performance + computed metrics
      "filter_options":    {...},          ← cities, campaign_types, etc. — always dynamic
      "dimensions_count":  int,
      "performance_count": int,
    }
    """
    use_auto   = not start or not end
    status_key = (status or "").strip().lower() or "all"
    cache_key  = f"{channel_id}:" + ("auto" if use_auto else f"{start}_{end}") + f"_{status_key}"

    # ── Tier 1+2: Cache HIT (no lock needed — fast path) ─────────────────────
    cached = cache_module.get_cached(cache_key)
    if cached is not None:
        return {**cached, "served_from_cache": True}

    # ── Isolation: acquire per-key lock ──────────────────────────────────────
    async with _fetch_locks[cache_key]:
        # Double-check locking: re-read cache inside the lock.
        # The first waiter may have populated it while we were waiting.
        cached = cache_module.get_cached(cache_key)
        if cached is not None:
            return {**cached, "served_from_cache": True}

        # ── Cache MISS → call Apps Script ─────────────────────────────────────
        client = await _get_client()
        params: dict | None = None if use_auto else {"start": start, "end": end}
        if status:
            params = params or {}
            params["status"] = status

        resp = await client.get(_apps_script_url_for(channel_id), params=params)
        resp.raise_for_status()
        raw: dict = resp.json()

    # Validate outside the lock — non-critical-section work
    _validate_payload(raw, context="fetch_data")

    # ── Merge dimensions + performance ────────────────────────────────────────
    perf_lookup: dict[str, dict] = {
        row["creative_id"]: row
        for row in raw.get("performance", [])
        if row.get("creative_id")
    }

    merged: list[dict] = []
    for dim in raw.get("dimensions", []):
        cid  = dim.get("creative_id")
        perf = perf_lookup.get(cid, {})
        row = {
            **dim,
            "impressions": _to_float(perf.get("impressions", 0)),
            "clicks":      _to_float(perf.get("clicks", 0)),
            "cost":        _to_float(perf.get("cost", 0)),
            "conversions": _to_float(perf.get("conversions", 0)),
        }
        # Carry through platform-specific extras (e.g. Meta's hook_rate) if present.
        for field in _OPTIONAL_PERF_FIELDS:
            if field in perf:
                row[field] = perf[field]
        merged.append(row)

    # Compute metrics with the calculator matching this channel's platform
    # (Google: ctr/cpc/cpm/cr/cpa — Meta: ctr/cpc/cpm/cvr/cpl)
    enriched = _enrich_for(channel_id, merged)
    # Drop creatives with 0 impressions — useless for analysis
    enriched = [c for c in enriched if c.get("impressions", 0) > 0]

    result = {
        "served_from_cache":    False,
        "date_range":           raw.get("date_range", {"start": start or "", "end": end or ""}),
        "available_date_range": raw.get("available_date_range", {}),
        "creatives":            enriched,
        "filter_options":       raw.get("filter_options", {}),
        "dimensions_count":     raw.get("dimensions_count", 0),
        "performance_count":    raw.get("performance_count", 0),
    }

    cache_module.set_cached(cache_key, result, row_count=len(enriched))
    return result


# ─────────────────────────────────────────────────────────────────────────────
# fetch_raw_data — All daily rows for client-side aggregation
# ─────────────────────────────────────────────────────────────────────────────

async def fetch_raw_data(channel_id: str) -> dict:
    """
    Fetch ALL daily rows (one row per creative per day) for ALL dates, for one channel.

    The frontend uses this to aggregate any date range client-side, making
    date range changes instant — no round-trip to Apps Script or backend.

    Returns a dict with shape:
    {
      "served_from_cache":   bool,
      "data_fetched_at":     str,
      "available_date_range": {"min": str, "max": str},
      "dimensions":          {creative_id: {creative_url, creative_type, ...}},
      "daily_rows":          [{creative_id, date, impressions, clicks, cost, conversions}],
      "filter_options":      {...},
      "dimensions_count":    int,
      "daily_rows_count":    int,
    }
    """
    cache_key = raw_daily_cache_key(channel_id)

    # ── Cache HIT ─────────────────────────────────────────────────────────────
    cached = cache_module.get_cached(cache_key)
    if cached is not None:
        return {**cached, "served_from_cache": True}

    # ── Isolation: per-key lock ────────────────────────────────────────────────
    async with _fetch_locks[cache_key]:
        cached = cache_module.get_cached(cache_key)
        if cached is not None:
            return {**cached, "served_from_cache": True}

        client = await _get_client()
        resp   = await client.get(_apps_script_url_for(channel_id), params={"tab": "raw_daily"})
        resp.raise_for_status()
        raw: dict = resp.json()

    _validate_payload(raw, context="fetch_raw_data")

    daily_rows = raw.get("daily_rows", [])

    result = {
        "served_from_cache":    False,
        "data_fetched_at":      raw.get("data_fetched_at", ""),
        "available_date_range": raw.get("available_date_range", {}),
        "dimensions":           raw.get("dimensions", {}),
        "daily_rows":           daily_rows,
        "filter_options":       raw.get("filter_options", {}),
        "dimensions_count":     raw.get("dimensions_count", 0),
        "daily_rows_count":     raw.get("daily_rows_count", 0),
    }

    cache_module.set_cached(cache_key, result, row_count=len(daily_rows))
    return result


# ─────────────────────────────────────────────────────────────────────────────
# fetch_current_structure — Current campaign structure (no performance)
# ─────────────────────────────────────────────────────────────────────────────

async def fetch_current_structure(channel_id: str) -> dict:
    """
    Fetch the current live campaign structure from Current_Pmax + Current_Dgen Sheet tabs.
    No performance data — purely structural.

    Returns a dict with shape:
    {
      "served_from_cache": bool,
      "creatives":         [...],
      "filter_options":    {...},
      "count":             int,
    }
    """
    cache_key = f"{channel_id}:current_structure"

    # ── Cache HIT ─────────────────────────────────────────────────────────────
    cached = cache_module.get_cached(cache_key)
    if cached is not None:
        return {**cached, "served_from_cache": True}

    # ── Isolation: per-key lock ────────────────────────────────────────────────
    async with _fetch_locks[cache_key]:
        cached = cache_module.get_cached(cache_key)
        if cached is not None:
            return {**cached, "served_from_cache": True}

        client = await _get_client()
        resp   = await client.get(
            _apps_script_url_for(channel_id),
            params={"tab": "current_structure"},
        )
        resp.raise_for_status()
        raw: dict = resp.json()

    _validate_payload(raw, context="fetch_current_structure")

    creatives = raw.get("creatives", [])
    result = {
        "served_from_cache": False,
        "creatives":         creatives,
        "filter_options":    raw.get("filter_options", {}),
        "count":             raw.get("count", 0),
    }

    cache_module.set_cached(cache_key, result, row_count=len(creatives))
    return result
