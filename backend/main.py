"""
backend/main.py
===============
FastAPI application — entry point, all routes, startup logic, CORS.

Run with:
    uvicorn backend.main:app --reload --port 8000
  OR (from inside the backend/ folder):
    uvicorn main:app --reload --port 8000

Multi-channel: every data route takes a required `channel_id` query param and
resolves it against org_data (org_structure.json / org_secrets.json / access_grants.json)
via org_access — the signed-in user must have a grant covering that channel or the
route returns 403. Fetching is lazy: nothing is pre-warmed on startup or on a timer;
the first request for a channel is what triggers its Apps Script call, and the
result is cached (namespaced by channel_id) for subsequent requests. This is what
lets a handful of servers serve hundreds of accounts/channels without needing to
eagerly refresh all of them on a schedule.

Routes:
  GET  /health                                                        → liveness check
  GET  /api/dimensions?channel_id=                                    → all creative metadata
  GET  /api/performance?channel_id=&start=&end=                       → enriched creatives for date range
  GET  /api/top-performers?channel_id=&start=&end=&metric=&type=&city=&n=  → top N by metric
  GET  /api/raw-performance?channel_id=                               → all daily rows (ETag/304)
  GET  /api/current-structure?channel_id=                             → current campaign structure
  POST /api/sync?channel_id=                                          → force-clear one channel's cache
  GET  /api/home                                                      → accounts/channels the user can see
"""

from __future__ import annotations

from contextlib import asynccontextmanager
import asyncio

import httpx
from fastapi import FastAPI, HTTPException, Query, Header, Response, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from pydantic import BaseModel

import cache as cache_module
import db as db_module
from apps_script_connector import (
    fetch_data, fetch_raw_data, fetch_current_structure, close_http_client,
    raw_daily_cache_key,
)
from calculator import top_performers as _top_performers_google
from calculator_meta import top_performers as _top_performers_meta
from config import origins
from auth import (
    verify_google_access_token, check_whitelist,
    create_session_token, require_user,
)
from org_access import (
    build_home_payload, get_channel_secrets, get_channel_platform, user_can_access_channel,
)


def require_channel_access(
    channel_id: str = Query(..., description="Channel id, e.g. ch_aukera_google_ads"),
    user: dict = Depends(require_user),
) -> str:
    """
    Shared dependency for every data route: hard-requires a valid session AND
    that the signed-in user's grants (from org_access) actually cover this
    channel_id. Returns the channel_id so routes can use it directly.
    """
    if not user_can_access_channel(user.get("email", ""), channel_id):
        raise HTTPException(status_code=403, detail="You do not have access to this channel.")
    return channel_id


# ── Lifespan: init DB, periodic purge, clean shutdown ────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Startup:
      1. Initialize SQLite schema (idempotent — safe on every restart).
      2. Launch a background loop that purges expired SQLite rows every 30 minutes.
         (No cache pre-warming here — with potentially hundreds of channels,
         warming all of them on a timer doesn't scale. Each channel's data is
         fetched lazily on its first request and cached from then on.)

    Shutdown:
      3. Close the shared httpx.AsyncClient gracefully.
    """
    # ── Startup ────────────────────────────────────────────────────────────────
    db_module.init_db()
    print("[startup] SQLite persistent cache initialized")

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
async def get_dimensions(channel_id: str = Depends(require_channel_access)):
    """
    Return all creative metadata from the creative_dimensions Sheet tab.
    Uses last-30-day default range (performance zeros are fine — we just need dimensions).
    Result is cached.
    """
    try:
        data = await fetch_data(channel_id)
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
    channel_id: str = Depends(require_channel_access),
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
        data = await fetch_data(channel_id, start, end, status_norm)
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
    channel_id: str = Depends(require_channel_access),
    start:  str       = Query(...,      description="Start date (YYYY-MM-DD)"),
    end:    str       = Query(...,      description="End date (YYYY-MM-DD)"),
    metric: str       = Query("ctr",   description="Metric to rank by: ctr | conversions | cpc | cpa | impressions | clicks | cost"),
    type:   str | None = Query(None,   description="Filter by creative_type: Image | Video | Text"),
    city:   str | None = Query(None,   description="Filter by city (exact, case-sensitive)"),
    n:      int       = Query(5,       description="Number of results", ge=1, le=20),
):
    """
    Return the top N creatives for a given metric and optional type/city filters.

    Ranking logic (which metrics are "lower is better") depends on the
    channel's platform: Google uses cpc/cpa, Meta uses cpc/cpl.
    """
    VALID_METRICS = {
        "ctr", "cpc", "cpm", "cr", "cpa", "cvr", "cpl",
        "impressions", "clicks", "cost", "conversions",
    }
    if metric not in VALID_METRICS:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid metric '{metric}'. Choose from: {', '.join(sorted(VALID_METRICS))}"
        )

    _validate_dates(start, end)

    try:
        data = await fetch_data(channel_id, start, end)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Apps Script fetch failed: {exc}")

    top_performers_fn = (
        _top_performers_meta if get_channel_platform(channel_id) == "meta_ads" else _top_performers_google
    )
    results = top_performers_fn(
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
    channel_id: str = Depends(require_channel_access),
    if_none_match: str | None = Header(None, alias="if-none-match"),
):
    """
    Return ALL daily rows for ALL dates in the sheet, for one channel.

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
    cache_key = raw_daily_cache_key(channel_id)
    current_etag = cache_module.get_etag(cache_key)
    if current_etag and if_none_match and if_none_match.strip('"') == current_etag:
        return Response(status_code=304)

    try:
        data = await fetch_raw_data(channel_id)
    except ValueError as exc:
        raise HTTPException(status_code=502, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Apps Script fetch failed: {exc}")

    # Attach ETag to response so client can cache it
    new_etag = cache_module.get_etag(cache_key)
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
async def get_current_structure(channel_id: str = Depends(require_channel_access)):
    """
    Return the current live campaign structure from Current_Pmax + Current_Dgen Sheet tabs.

    No performance data — this shows every video creative currently configured
    in the campaigns, regardless of whether it has run yet.
    Result is cached (10 min TTL on the Apps Script side; 15 min on the Python side).
    """
    try:
        data = await fetch_current_structure(channel_id)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Apps Script fetch failed: {exc}")

    return {
        "status":            "ok",
        "served_from_cache": data["served_from_cache"],
        "count":             data["count"],
        "creatives":         data["creatives"],
        "filter_options":    data["filter_options"],
    }


@app.get("/api/home", tags=["Org"])
async def get_home(user: dict = Depends(require_user)):
    """
    Return the signed-in user's access summary + every account/channel they
    can see (grouped by account, enriched with team/cluster names), for the
    home/landing screen.

    Access is resolved from org_data/access_grants.json via org_access —
    a user sees an account/channel if any of their grants (super_admin,
    cluster_head, team_head, or account_head — they can hold several) covers it.
    """
    return build_home_payload(user.get("email", ""))


@app.post("/api/sync", tags=["System"])
async def sync(channel_id: str = Depends(require_channel_access)):
    """
    Force-clear one channel's cache (Python TTLCache + SQLite + Apps Script
    ScriptProperties) and immediately pre-fetch its default date range.
    Use this after manually updating that channel's Google Sheet.

    Scoped to this channel only — does not touch any other account/channel's
    cached data.
    """
    # 1. Clear this channel's Python cache (memory + SQLite), leave others untouched
    cache_module.invalidate_prefix(f"{channel_id}:")

    # 2. Clear this channel's Apps Script ScriptProperties persistent cache
    try:
        apps_script_url = get_channel_secrets(channel_id).get("apps_script_url")
        if apps_script_url:
            async with httpx.AsyncClient(timeout=15.0) as client:
                await client.get(
                    apps_script_url,
                    params={"action": "invalidate"},
                    follow_redirects=True,
                )
    except Exception as exc:
        print(f"[sync] ScriptProperties invalidation failed (non-fatal): {exc}")

    # 3. Pre-warm this channel's cache with fresh data from Apps Script
    try:
        await fetch_data(channel_id)
    except Exception as exc:
        return {
            "status":  "partial",
            "message": f"Cache cleared but pre-fetch failed: {exc}",
        }

    return {
        "status":  "ok",
        "message": "Channel cache cleared (Python + Apps Script) and pre-warmed successfully.",
        "channel_id": channel_id,
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


# ─────────────────────────────────────────────────────────────────────────────
# Auth routes
# ─────────────────────────────────────────────────────────────────────────────

class GoogleAuthRequest(BaseModel):
    access_token: str


@app.post("/auth/google", tags=["Auth"])
async def auth_google(body: GoogleAuthRequest):
    """
    Exchange a Google access token for a CreativeVisibility session JWT.

    Flow:
      1. Frontend calls Google OAuth (via @react-oauth/google)
      2. Frontend receives access_token and POSTs it here
      3. We verify with Google's userinfo endpoint
      4. We check the email against the whitelist
      5. We return a signed JWT + user profile
    """
    # 1. Verify with Google
    profile = await verify_google_access_token(body.access_token)

    # 2. Check whitelist
    email = profile.get("email", "")
    if not email:
        raise HTTPException(status_code=401, detail="Could not retrieve email from Google.")
    check_whitelist(email)

    # 3. Build clean user object
    user = {
        "sub":            profile.get("sub", ""),
        "email":          email,
        "name":           profile.get("name", ""),
        "picture":        profile.get("picture", ""),
        "email_verified": profile.get("email_verified", False),
    }

    # 4. Issue JWT
    token = create_session_token(user)
    return {"token": token, "user": user}


@app.get("/auth/me", tags=["Auth"])
async def auth_me(user: dict = Depends(require_user)):
    """Return the currently authenticated user (validates the JWT)."""
    return {"user": user}
