"""
backend/main.py
===============
FastAPI application — entry point, all routes, startup logic, CORS.

Run with:
    uvicorn backend.main:app --reload --port 8000
  OR (from inside the backend/ folder):
    uvicorn main:app --reload --port 8000

Routes:
  GET  /health                                          → liveness check
  GET  /api/dimensions                                  → all creative metadata
  GET  /api/performance?start=&end=                     → enriched creatives for date range
  GET  /api/top-performers?start=&end=&metric=&type=&city=&n=  → top N by metric
  POST /api/sync                                        → force-clear cache
"""

from __future__ import annotations

from contextlib import asynccontextmanager
import asyncio

from fastapi import FastAPI, HTTPException, Query, Header, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware

import cache as cache_module
import db as db_module
from apps_script_connector import (
    fetch_data, fetch_raw_data, fetch_current_structure, close_http_client
)
from calculator import top_performers
from config import origins, get_apps_script_url


# ── Lifespan: init DB, pre-warm cache, periodic refresh, clean shutdown ──────
@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Startup:
      1. Initialize SQLite schema (idempotent — safe on every restart).
      2. Pre-fetch raw daily data in the background (warm the two-tier cache).
         If SQLite already has valid data, this returns instantly from disk.
         If SQLite is cold (first ever run), this calls Apps Script (~30–90s)
         in the background — the server is already accepting requests.
      3. Launch a background loop that re-warms the cache every 18 minutes.
      4. Launch a background loop that purges expired SQLite rows every 30 minutes.

    Shutdown:
      5. Close the shared httpx.AsyncClient gracefully.
    """
    # ── Startup ────────────────────────────────────────────────────────────────
    # 1. Init SQLite (creates cv_cache.db + table if they don't exist)
    db_module.init_db()
    print("[startup] SQLite persistent cache initialized")

    async def _warm_cache() -> None:
        """Warm both data endpoints in parallel. Non-fatal."""
        try:
            await asyncio.gather(
                fetch_data(),
                fetch_raw_data(),
                return_exceptions=True,
            )
            print("[startup] Cache pre-warmed: auto range + raw daily (parallel)")
        except Exception as exc:
            print(f"[startup] Pre-warm failed (non-fatal): {exc}")

    async def _periodic_warm() -> None:
        """Re-warm the auto range + raw daily every 18 min (before AS 20-min TTL)."""
        INTERVAL = 18 * 60
        while True:
            await asyncio.sleep(INTERVAL)
            try:
                cache_module.invalidate_key("auto_all")
                cache_module.invalidate_key("raw_daily")
                await fetch_data()
                await fetch_raw_data()
                print("[periodic] Cache re-warmed: auto range + raw daily")
            except Exception as exc:
                print(f"[periodic] Re-warm failed (non-fatal): {exc}")

    async def _periodic_purge() -> None:
        """Delete expired SQLite rows every 30 minutes to keep the DB small."""
        INTERVAL = 30 * 60
        while True:
            await asyncio.sleep(INTERVAL)
            try:
                removed = db_module.db_purge_expired()
                if removed > 0:
                    print(f"[purge] Removed {removed} expired SQLite cache entries")
            except Exception as exc:
                print(f"[purge] SQLite purge failed (non-fatal): {exc}")

    asyncio.create_task(_warm_cache())
    asyncio.create_task(_periodic_warm())
    asyncio.create_task(_periodic_purge())

    yield  # ← Server is running here

    # ── Shutdown ───────────────────────────────────────────────────────────────
    await close_http_client()
    print("[shutdown] httpx client closed cleanly")


# ── App instance ──────────────────────────────────────────────────────────────
app = FastAPI(
    title="CreativeVisibility API",
    description="Backend for the CreativeVisibility portal — serves enriched Google Ads creative data.",
    version="1.0.0",
    lifespan=lifespan,
)

# ── CORS ──────────────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)
# Compress JSON responses — saves 60-80% transfer size on large raw daily payloads
app.add_middleware(GZipMiddleware, minimum_size=500)


# ─────────────────────────────────────────────────────────────────────────────
# Routes
# ─────────────────────────────────────────────────────────────────────────────

@app.get("/health", tags=["System"])
async def health():
    """
    Liveness check.
    Returns server status and current cache stats.
    """
    return {
        "status": "ok",
        "cache": cache_module.cache_info(),
    }


@app.get("/api/dimensions", tags=["Data"])
async def get_dimensions():
    """
    Return all creative metadata from the creative_dimensions Sheet tab.
    Uses last-30-day default range (performance zeros are fine — we just need dimensions).
    Result is cached.
    """
    try:
        data = await fetch_data()
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Apps Script fetch failed: {exc}")

    return {
        "status": "ok",
        "served_from_cache": data["served_from_cache"],
        "dimensions_count":  data["dimensions_count"],
        "dimensions":        [
            {k: v for k, v in c.items() if k in (
                "creative_id", "creative_url", "creative_type",
                "campaign_name", "funnel", "campaign_type", "ad_group",
                "city", "age_group", "category", "headline", "description", "status"
            )}
            for c in data["creatives"]
        ],
        "filter_options": data["filter_options"],
    }


@app.get("/api/performance", tags=["Data"])
async def get_performance(
    start: str | None = Query(None, description="Start date (YYYY-MM-DD)", example="2026-05-01"),
    end:   str | None = Query(None, description="End date (YYYY-MM-DD)",   example="2026-05-28"),
    status: str | None = Query(None, description="Status filter: Enabled | Paused | All", example="Enabled"),
):
    """
    Return all creatives with aggregated performance metrics for the given date range.

    Response includes computed: ctr, cpc, cpm, cr, cpa
    Also includes filter_options (cities etc.) for the frontend to build dropdowns.
    """
    status_norm = status.strip().title() if status else None
    if status_norm == "All":
        status_norm = None
    if status_norm and status_norm not in {"Enabled", "Paused"}:
        raise HTTPException(status_code=400, detail="Invalid status. Use Enabled, Paused, or All.")
    if (start and not end) or (end and not start):
        raise HTTPException(status_code=400, detail="Provide both start and end, or omit both to use auto range.")
    if start and end:
        _validate_dates(start, end)

    try:
        data = await fetch_data(start, end, status_norm)
    except ValueError as exc:
        raise HTTPException(status_code=502, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Apps Script fetch failed: {exc}")

    return {
        "status":              "ok",
        "served_from_cache":   data["served_from_cache"],
        "date_range":          data["date_range"],
        "available_date_range": data.get("available_date_range", {}),
        "dimensions_count":    data["dimensions_count"],
        "performance_count":   data["performance_count"],
        "creatives":           data["creatives"],
        "filter_options":      data["filter_options"],
    }


@app.get("/api/top-performers", tags=["Data"])
async def get_top_performers(
    start:  str       = Query(...,      description="Start date (YYYY-MM-DD)"),
    end:    str       = Query(...,      description="End date (YYYY-MM-DD)"),
    metric: str       = Query("ctr",   description="Metric to rank by: ctr | conversions | cpc | cpa | impressions | clicks | cost"),
    type:   str | None = Query(None,   description="Filter by creative_type: Image | Video | Text"),
    city:   str | None = Query(None,   description="Filter by city (exact, case-sensitive)"),
    n:      int       = Query(5,       description="Number of results", ge=1, le=20),
):
    """
    Return the top N creatives for a given metric and optional type/city filters.

    For cost-efficiency metrics (cpc, cpa): lower = better → sorted ascending.
    For all others (ctr, conversions, impressions): higher = better → sorted descending.
    """
    VALID_METRICS = {"ctr", "cpc", "cpm", "cr", "cpa", "impressions", "clicks", "cost", "conversions"}
    if metric not in VALID_METRICS:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid metric '{metric}'. Choose from: {', '.join(sorted(VALID_METRICS))}"
        )

    _validate_dates(start, end)

    try:
        data = await fetch_data(start, end)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Apps Script fetch failed: {exc}")

    results = top_performers(
        creatives=data["creatives"],
        metric=metric,
        creative_type=type,
        city=city,
        n=n,
    )

    return {
        "status":      "ok",
        "date_range":  data["date_range"],
        "metric":      metric,
        "filters":     {"type": type, "city": city},
        "count":       len(results),
        "results":     results,
    }


@app.get("/api/raw-performance", tags=["Data"])
async def get_raw_performance(
    response: Response,
    if_none_match: str | None = Header(None, alias="if-none-match"),
):
    """
    Return ALL daily rows for ALL dates in the sheet.

    Unlike /api/performance (which aggregates server-side for a given date range),
    this endpoint returns raw per-creative-per-day data so the frontend can
    aggregate any date range client-side — making date picker changes instant.

    ETag / 304 support:
      - Returns an ETag header (SHA-256 checksum of the cached payload).
      - If the client sends If-None-Match matching the current ETag,
        returns 304 Not Modified with no body — zero transfer overhead.
      - The frontend stores the ETag in IndexedDB and sends it on every revisit.

    Response shape:
      dimensions  : { creative_id: { creative_url, creative_type, ... } }
      daily_rows  : [ { creative_id, date, impressions, clicks, cost, conversions } ]
      filter_options, available_date_range, dimensions_count, daily_rows_count
    """
    # ── ETag check: return 304 if client already has current data ─────────────
    # The ETag is the SHA-256 checksum stored in SQLite when the data was cached.
    # Reading it is a single lightweight SELECT — no re-computation.
    current_etag = cache_module.get_etag("raw_daily")
    if current_etag and if_none_match and if_none_match.strip('"') == current_etag:
        return Response(status_code=304)

    try:
        data = await fetch_raw_data()
    except ValueError as exc:
        raise HTTPException(status_code=502, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Apps Script fetch failed: {exc}")

    # Attach ETag to response so client can cache it
    new_etag = cache_module.get_etag("raw_daily")
    if new_etag:
        response.headers["ETag"]          = f'"{new_etag}"'
        response.headers["Cache-Control"] = "private, no-cache"

    return {
        "status":               "ok",
        "served_from_cache":    data["served_from_cache"],
        "data_fetched_at":      data["data_fetched_at"],
        "available_date_range": data["available_date_range"],
        "dimensions_count":     data["dimensions_count"],
        "daily_rows_count":     data["daily_rows_count"],
        "dimensions":           data["dimensions"],
        "daily_rows":           data["daily_rows"],
        "filter_options":       data["filter_options"],
    }


@app.get("/api/current-structure", tags=["Data"])
async def get_current_structure():
    """
    Return the current live campaign structure from Current_Pmax + Current_Dgen Sheet tabs.

    No performance data — this shows every video creative currently configured
    in the campaigns, regardless of whether it has run yet.
    Result is cached (10 min TTL on the Apps Script side; 15 min on the Python side).
    """
    try:
        data = await fetch_current_structure()
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Apps Script fetch failed: {exc}")

    return {
        "status":            "ok",
        "served_from_cache": data["served_from_cache"],
        "count":             data["count"],
        "creatives":         data["creatives"],
        "filter_options":    data["filter_options"],
    }


@app.post("/api/sync", tags=["System"])
async def sync():
    """
    Force-clear the entire cache (Python TTLCache + Apps Script ScriptProperties)
    and immediately pre-fetch the default date range.
    Use this after manually updating the Google Sheet or after a new creative is added.
    """
    # 1. Clear Python in-memory cache
    cache_module.invalidate_all()

    # 2. Clear Apps Script ScriptProperties persistent cache
    try:
        async with __import__("httpx").AsyncClient(timeout=15.0) as client:
            await client.get(
                get_apps_script_url(),
                params={"action": "invalidate"},
                follow_redirects=True,
            )
    except Exception as exc:
        print(f"[sync] ScriptProperties invalidation failed (non-fatal): {exc}")

    # 3. Pre-warm Python cache with fresh data from Apps Script
    try:
        await fetch_data()
    except Exception as exc:
        return {
            "status":  "partial",
            "message": f"Cache cleared but pre-fetch failed: {exc}",
        }

    return {
        "status":  "ok",
        "message": "All caches cleared (Python + Apps Script) and pre-warmed successfully.",
        "pre_warmed_range": "auto range (sheet min/max)",
    }


# ─────────────────────────────────────────────────────────────────────────────
# Internal helpers
# ─────────────────────────────────────────────────────────────────────────────

def _validate_dates(start: str, end: str) -> None:
    """Raise 400 if date strings are malformed or start > end."""
    import re
    pattern = r"^\d{4}-\d{2}-\d{2}$"
    if not re.match(pattern, start) or not re.match(pattern, end):
        raise HTTPException(status_code=400, detail="Dates must be in YYYY-MM-DD format.")
    if start > end:
        raise HTTPException(status_code=400, detail="start date must be <= end date.")
