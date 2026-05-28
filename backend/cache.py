"""
backend/cache.py
================
In-memory TTL cache for Apps Script responses.

Strategy:
  - Cache key = "{start_date}_{end_date}"
  - TTL = 15 minutes (configurable via CACHE_TTL in .env)
  - Max 50 slots — prevents unbounded memory use
  - invalidate_all() called by POST /api/sync for on-demand refresh

Performance impact:
  - Cache MISS  → ~800ms–1.5s  (round-trip to Apps Script)
  - Cache HIT   → <5ms          (in-memory dict lookup)
  - 20 team members, same date range → Apps Script called ONCE
"""

from cachetools import TTLCache
from config import CACHE_TTL

# 50 unique (start, end) combinations cached simultaneously
# Each cached for CACHE_TTL seconds (default 900 = 15 min)
_cache: TTLCache = TTLCache(maxsize=50, ttl=CACHE_TTL)


def get_cached(key: str) -> dict | None:
    """Return cached data for key, or None if absent/expired."""
    return _cache.get(key)


def set_cached(key: str, value: dict) -> None:
    """Store value in cache under key."""
    _cache[key] = value


def invalidate_all() -> None:
    """Clear entire cache — called by POST /api/sync."""
    _cache.clear()


def cache_info() -> dict:
    """Return current cache stats for the /health endpoint."""
    return {
        "current_size": len(_cache),
        "max_size": _cache.maxsize,
        "ttl_seconds": _cache.ttl,
    }
