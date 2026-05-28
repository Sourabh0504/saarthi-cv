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

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

import cache as cache_module
from apps_script_connector import fetch_data, fetch_current_structure
from calculator import top_performers
from config import ALLOWED_ORIGINS


# ── Lifespan: pre-warm cache on startup ──────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Runs once when the server starts.
    Pre-fetches last 30 days so the first user gets instant data.
    Failure is non-fatal — the server still starts.
    """
    async def _warm_cache() -> None:
        try:
            await fetch_data()
            print("[startup] Cache pre-warmed: auto range (sheet min/max)")
        except Exception as exc:
            print(f"[startup] Pre-warm failed (non-fatal): {exc}")

    asyncio.create_task(_warm_cache())
    yield  # Server runs here


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
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


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
    Force-clear the entire cache and immediately pre-fetch last 30 days.
    Use this after manually updating the Google Sheet or after a new creative is added.
    """
    cache_module.invalidate_all()

    try:
        await fetch_data()
    except Exception as exc:
        return {
            "status":  "partial",
            "message": f"Cache cleared but pre-fetch failed: {exc}",
        }

    return {
        "status":  "ok",
        "message": "Cache cleared and pre-warmed successfully.",
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
