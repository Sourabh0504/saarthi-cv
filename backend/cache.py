"""
backend/cache.py
================
Two-tier cache: in-memory TTLCache (fast) + SQLite on disk (durable).

Tier 1 — In-memory TTLCache  (~0ms access, lost on restart)
Tier 2 — SQLite WAL           (~2ms access, persists across restarts)

Read path:
  1. Memory HIT  → return immediately
  2. SQLite HIT  → backfill memory → return
  3. Both miss   → caller fetches from Apps Script

Write path:
  1. Write SQLite first  (durable — commit before returning)
  2. Write memory        (fast path for next request)

This gives us:
  Durability  — SQLite WAL survives process crashes and server restarts.
                Server restart = instant warm start from disk, not a 90s cold call.
  Atomicity   — All SQLite writes use BEGIN IMMEDIATE / COMMIT / ROLLBACK via db.py.
  Consistency — SHA-256 checksum verified on every SQLite read; corrupt rows deleted.
  Isolation   — Concurrent requests handled by asyncio.Lock in apps_script_connector.py.
"""

from __future__ import annotations

from cachetools import TTLCache
from config import CACHE_TTL
import db as db_module

# ── Tier 1: In-memory ─────────────────────────────────────────────────────────
# Survives within a single server session (lost on restart).
# 50 slots × 1800s TTL. Serves the vast majority of requests in <1ms.
_cache: TTLCache = TTLCache(maxsize=50, ttl=CACHE_TTL)


def get_cached(key: str) -> dict | None:
    """
    Two-tier read: memory first, then SQLite.

    Backfills memory from SQLite on a SQLite hit, so the next request
    for the same key is served from memory (sub-millisecond).
    Returns None only if both tiers miss.
    """
    # ── Tier 1: memory ────────────────────────────────────────────────────────
    result = _cache.get(key)
    if result is not None:
        return result

    # ── Tier 2: SQLite (survives restarts) ────────────────────────────────────
    try:
        result = db_module.db_get(key)
        if result is not None:
            # Backfill memory so subsequent requests are sub-millisecond.
            _cache[key] = result
            return result
    except Exception as exc:
        # SQLite errors are non-fatal — fall through to Apps Script on miss.
        print(f"[cache] SQLite read error (non-fatal): {exc}")

    return None


def set_cached(key: str, value: dict, row_count: int = 0) -> None:
    """
    Two-tier write: SQLite first (durable), then memory (fast path).

    SQLite write is atomic (BEGIN IMMEDIATE / COMMIT).
    If the SQLite write fails (e.g. disk full), memory is still written
    so the current session continues working — best-effort durability.

    Args:
        key:       Cache key.
        value:     Data dict to store.
        row_count: Optional integrity hint (e.g. len(daily_rows)).
    """
    # ── Write SQLite (Durability) ─────────────────────────────────────────────
    try:
        db_module.db_set(key, value, row_count=row_count)
    except Exception as exc:
        print(f"[cache] SQLite write error (non-fatal): {exc}")

    # ── Write memory (Speed) ──────────────────────────────────────────────────
    _cache[key] = value


def invalidate_all() -> None:
    """
    Wipe both tiers completely.
    Called by POST /api/sync — forces a full refresh from Apps Script.
    """
    _cache.clear()
    try:
        db_module.db_clear_all()
    except Exception as exc:
        print(f"[cache] SQLite clear error (non-fatal): {exc}")


def invalidate_key(key: str) -> None:
    """
    Evict a single key from both tiers.
    Called by the periodic pre-warmer before re-fetching.
    """
    _cache.pop(key, None)
    try:
        db_module.db_delete(key)
    except Exception as exc:
        print(f"[cache] SQLite delete error (non-fatal): {exc}")


def invalidate_prefix(prefix: str) -> None:
    """
    Evict every cache key starting with `prefix` from both tiers.
    Scopes a sync/invalidate action to a single channel (e.g. "ch_aukera_google_ads:")
    instead of wiping every channel's cached data.
    """
    for k in [k for k in list(_cache.keys()) if k.startswith(prefix)]:
        _cache.pop(k, None)
    try:
        db_module.db_delete_prefix(prefix)
    except Exception as exc:
        print(f"[cache] SQLite prefix-delete error (non-fatal): {exc}")


def get_etag(key: str) -> str | None:
    """
    Return the stored SHA-256 checksum for a cache key, used as an HTTP ETag.

    The ETag is computed during db_set() and stored in SQLite alongside the data.
    Reading it is a single lightweight SELECT — no re-computation needed.
    Returns None if the key is absent or expired.
    """
    try:
        return db_module.db_get_checksum(key)
    except Exception:
        return None


def cache_info() -> dict:
    """Return combined stats for the /health endpoint."""
    info: dict = {
        "memory": {
            "current_size": len(_cache),
            "max_size":     _cache.maxsize,
            "ttl_seconds":  _cache.ttl,
        },
    }
    try:
        info["sqlite"] = db_module.db_info()
    except Exception as exc:
        info["sqlite"] = {"error": str(exc)}
    return info
