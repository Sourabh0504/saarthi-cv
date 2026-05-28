"""
backend/apps_script_connector.py
=================================
Async connector between FastAPI and the Apps Script Web App.

Data source: Apps Script reads Daily_dump (Google Ads export) exclusively.
  - creative_id   = Asset URL + "|" + Location + "|" + Campaign_Type (composite key)
  - creative_url  = raw Asset URL (image/video URL for display)
  - All metadata (city, funnel, campaign_type, etc.) comes from Daily_dump columns
  - Current_Pmax and Current_Dgen are NOT referenced anywhere in the pipeline

Flow:
  1. Check TTL cache for (start, end) key
  2. If HIT  → return cached data (<5ms)
  3. If MISS → call Apps Script via httpx (800ms–1.5s)
  4. Store response in cache
  5. Merge dimensions + performance → list of enriched creative dicts
  6. Return merged data + filter_options to caller

Note on redirects:
  Apps Script Web App URLs redirect once (HTTP 302) before serving JSON.
  httpx must follow_redirects=True or it returns an empty 302 response.
"""

from __future__ import annotations

import httpx

import cache as cache_module
from calculator import enrich_all
from config import get_apps_script_url


async def fetch_data(start: str | None = None, end: str | None = None, status: str | None = None) -> dict:
    """
    Fetch and return enriched creative data for the given date range.

    Returns a dict with shape:
    {
      "served_from_cache": bool,
      "date_range": {"start": str, "end": str},
      "creatives": [...],         ← merged dimensions + performance, with computed metrics
      "filter_options": {...},    ← cities, campaign_types, etc. — all dynamic from Sheet
      "dimensions_count": int,
      "performance_count": int,
    }
    """
    use_auto = not start or not end
    status_key = (status or "").strip().lower() or "all"
    cache_key = ("auto" if use_auto else f"{start}_{end}") + f"_{status_key}"

    # ── Cache HIT ────────────────────────────────────────────────────────────
    cached = cache_module.get_cached(cache_key)
    if cached is not None:
        return {**cached, "served_from_cache": True}

    # ── Cache MISS → call Apps Script ────────────────────────────────────────
    # Timeout is 120s: Apps Script cold-start on large sheets can take 60-90s.
    # After the first call, Apps Script's CacheService returns instantly,
    # and FastAPI's TTLCache (15-min) means Apps Script is rarely called at all.
    async with httpx.AsyncClient(timeout=120.0) as client:

        params = None if use_auto else {"start": start, "end": end}
        if status:
            params = params or {}
            params["status"] = status
        resp = await client.get(
            get_apps_script_url(),
            params=params,
            follow_redirects=True,   # Apps Script always issues a 302 first
        )

        resp.raise_for_status()
        raw = resp.json()

    if raw.get("status") != "ok":
        raise ValueError(f"Apps Script returned error: {raw.get('message', 'unknown')}")

    # ── Merge dimensions + performance ────────────────────────────────────────
    # Build a lookup: creative_id → performance row
    perf_lookup: dict[str, dict] = {
        row["creative_id"]: row
        for row in raw.get("performance", [])
        if row.get("creative_id")
    }

    # Attach performance columns to each dimension row
    merged: list[dict] = []
    for dim in raw.get("dimensions", []):
        cid = dim.get("creative_id")
        perf = perf_lookup.get(cid, {})
        merged.append({
            **dim,
            "impressions": _to_float(perf.get("impressions", 0)),
            "clicks":      _to_float(perf.get("clicks", 0)),
            "cost":        _to_float(perf.get("cost", 0)),
            "conversions": _to_float(perf.get("conversions", 0)),
        })

    # Compute CTR, CPC, CPM, CR, CPA for every creative
    enriched = enrich_all(merged)

    # Drop creatives with 0 impressions — they are useless for analysis,
    # skew KPI averages, and should never appear on the dashboard.
    enriched = [c for c in enriched if c.get("impressions", 0) > 0]

    result = {
        "served_from_cache":   False,
        "date_range":          raw.get("date_range", {"start": start or "", "end": end or ""}),
        "available_date_range": raw.get("available_date_range", {}),
        "creatives":           enriched,
        "filter_options":      raw.get("filter_options", {}),
        "dimensions_count":    raw.get("dimensions_count", 0),
        "performance_count":   raw.get("performance_count", 0),
    }

    cache_module.set_cached(cache_key, result)
    return result


def _to_float(value) -> float:
    """Safely coerce a value to float — handles empty strings, None, etc."""
    try:
        return float(value) if value not in (None, "", " ") else 0.0
    except (TypeError, ValueError):
        return 0.0


async def fetch_current_structure() -> dict:
    """
    Fetch the current live campaign structure from Current_Pmax + Current_Dgen Sheet tabs.

    Calls Apps Script with ?tab=current_structure.  No performance data is
    returned — this is a purely structural / planning view.

    Returns a dict with shape:
    {
      "served_from_cache": bool,
      "creatives": [...],      ← one entry per Video ID per sheet row
      "filter_options": {...}, ← dynamic from sheet data
      "count": int,
    }
    """
    cache_key = "current_structure"

    cached = cache_module.get_cached(cache_key)
    if cached is not None:
        return {**cached, "served_from_cache": True}

    async with httpx.AsyncClient(timeout=60.0) as client:
        resp = await client.get(
            get_apps_script_url(),
            params={"tab": "current_structure"},
            follow_redirects=True,
        )
        resp.raise_for_status()
        raw = resp.json()

    if raw.get("status") != "ok":
        raise ValueError(f"Apps Script returned error: {raw.get('message', 'unknown')}")

    result = {
        "served_from_cache": False,
        "creatives":         raw.get("creatives", []),
        "filter_options":    raw.get("filter_options", {}),
        "count":             raw.get("count", 0),
    }

    cache_module.set_cached(cache_key, result)
    return result
