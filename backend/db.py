"""
backend/db.py
=============
SQLite persistent cache — ACID-compliant, survives server restarts.

Why SQLite here:
  - Pure in-memory TTLCache (cachetools) is wiped on every uvicorn restart.
  - A restart with no SQLite means the first user waits 30–90s for Apps Script.
  - With SQLite: restart → first request reads from disk in ~2ms, zero cold-start.

ACID guarantees:
  Atomicity   — BEGIN IMMEDIATE / COMMIT / ROLLBACK: write is all-or-nothing.
  Consistency — SHA-256 checksum verified on every read; corrupted rows deleted.
  Isolation   — handled by asyncio.Lock in apps_script_connector.py.
  Durability  — WAL mode: committed data survives crashes. PRAGMA synchronous=NORMAL
                is safe here (WAL + page checksums protect against torn writes).

Schema:
  cache(key, payload, row_count, checksum, fetched_at, expires_at)

Thread safety:
  Uses thread-local connections (one per OS thread). Safe for uvicorn's
  default single-process multi-worker model and for asyncio event loop threads.
"""

from __future__ import annotations

import hashlib
import json
import sqlite3
import threading
from datetime import datetime, timezone, timedelta
from typing import Optional

from config import DB_PATH, CACHE_TTL

# ── Thread-local connection pool ─────────────────────────────────────────────
# Each thread gets its own Connection object — no shared mutable state.
_local = threading.local()


def _get_conn() -> sqlite3.Connection:
    """Return a thread-local SQLite connection, creating it on first use."""
    if getattr(_local, "conn", None) is None:
        conn = sqlite3.connect(str(DB_PATH), check_same_thread=False)
        # WAL mode: readers never block writers; writers never block readers.
        conn.execute("PRAGMA journal_mode=WAL")
        # NORMAL: flushes at checkpoints. Safe with WAL (OS crash-safe).
        conn.execute("PRAGMA synchronous=NORMAL")
        # Wait up to 5 s if another writer holds the lock (instead of raising).
        conn.execute("PRAGMA busy_timeout=5000")
        # Foreign-key enforcement (future-proofing).
        conn.execute("PRAGMA foreign_keys=ON")
        conn.row_factory = sqlite3.Row
        _local.conn = conn
    return _local.conn  # type: ignore[return-value]


# ── Schema init ───────────────────────────────────────────────────────────────

def init_db() -> None:
    """
    Create the cache table and index if they do not exist.
    Safe to call on every server startup — idempotent.
    """
    conn = _get_conn()
    conn.execute("""
        CREATE TABLE IF NOT EXISTS cache (
            key        TEXT    PRIMARY KEY,
            payload    TEXT    NOT NULL,
            row_count  INTEGER NOT NULL DEFAULT 0,
            checksum   TEXT    NOT NULL,
            fetched_at TEXT    NOT NULL,
            expires_at TEXT    NOT NULL
        )
    """)
    # Index on expires_at so db_purge_expired() is fast even with many rows.
    conn.execute("""
        CREATE INDEX IF NOT EXISTS idx_cache_expires
        ON cache(expires_at)
    """)
    conn.commit()


# ── Internal helpers ──────────────────────────────────────────────────────────

def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _expires_iso() -> str:
    return (datetime.now(timezone.utc) + timedelta(seconds=CACHE_TTL)).isoformat()


def _checksum(payload_str: str) -> str:
    """SHA-256 hex digest of a UTF-8 encoded string. Used for integrity checks."""
    return hashlib.sha256(payload_str.encode("utf-8")).hexdigest()


# ── Public API ────────────────────────────────────────────────────────────────

def db_get(key: str) -> Optional[dict]:
    """
    Read a cached value from SQLite.

    Returns None if:
      - key not found
      - entry has expired (expires_at ≤ now)
      - checksum mismatch (data corrupted — row is deleted)
      - JSON cannot be parsed (row is deleted)

    On a valid hit: returns the deserialized dict.
    """
    conn = _get_conn()
    row = conn.execute(
        "SELECT payload, checksum, expires_at FROM cache WHERE key = ?",
        (key,),
    ).fetchone()

    if row is None:
        return None

    # ── Expiry check ──────────────────────────────────────────────────────────
    if row["expires_at"] <= _now_iso():
        # Let the periodic purge clean this up lazily; just return miss.
        return None

    # ── Integrity: checksum verification ──────────────────────────────────────
    actual = _checksum(row["payload"])
    if actual != row["checksum"]:
        # Data on disk does not match its own fingerprint — delete it.
        _delete_unsafe(conn, key)
        return None

    # ── Deserialize ───────────────────────────────────────────────────────────
    try:
        return json.loads(row["payload"])
    except json.JSONDecodeError:
        _delete_unsafe(conn, key)
        return None


def db_set(key: str, data: dict, row_count: int = 0) -> None:
    """
    Atomically write (or replace) a cache entry.

    Uses BEGIN IMMEDIATE to prevent any other writer from interleaving.
    Either the full write commits or a ROLLBACK leaves the old entry intact.

    Args:
        key:       Cache key string.
        data:      Dict to serialize and store.
        row_count: Optional row-count integrity hint (e.g. len(daily_rows)).
    """
    payload_str = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
    checksum    = _checksum(payload_str)
    fetched_at  = _now_iso()
    expires_at  = _expires_iso()

    conn = _get_conn()
    conn.execute("BEGIN IMMEDIATE")
    try:
        conn.execute(
            """
            INSERT INTO cache (key, payload, row_count, checksum, fetched_at, expires_at)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(key) DO UPDATE SET
                payload    = excluded.payload,
                row_count  = excluded.row_count,
                checksum   = excluded.checksum,
                fetched_at = excluded.fetched_at,
                expires_at = excluded.expires_at
            """,
            (key, payload_str, row_count, checksum, fetched_at, expires_at),
        )
        conn.execute("COMMIT")
    except Exception:
        try:
            conn.execute("ROLLBACK")
        except Exception:
            pass
        raise


def db_get_checksum(key: str) -> Optional[str]:
    """
    Return the stored checksum for a cache key (used as ETag).
    Returns None if the key is absent or expired.
    """
    conn = _get_conn()
    row = conn.execute(
        "SELECT checksum, expires_at FROM cache WHERE key = ?",
        (key,),
    ).fetchone()
    if row is None:
        return None
    if row["expires_at"] <= _now_iso():
        return None
    return row["checksum"]


def db_delete(key: str) -> None:
    """Atomically remove a single cache entry."""
    conn = _get_conn()
    conn.execute("BEGIN IMMEDIATE")
    try:
        conn.execute("DELETE FROM cache WHERE key = ?", (key,))
        conn.execute("COMMIT")
    except Exception:
        try:
            conn.execute("ROLLBACK")
        except Exception:
            pass
        raise


def db_clear_all() -> None:
    """
    Atomically delete ALL cache entries.
    Called by POST /api/sync — complete cache wipe.
    """
    conn = _get_conn()
    conn.execute("BEGIN IMMEDIATE")
    try:
        conn.execute("DELETE FROM cache")
        conn.execute("COMMIT")
    except Exception:
        try:
            conn.execute("ROLLBACK")
        except Exception:
            pass
        raise


def db_delete_prefix(prefix: str) -> int:
    """
    Atomically remove every cache entry whose key starts with `prefix`.
    Returns the number of rows removed.

    Escapes SQL LIKE wildcards (%, _) in the prefix — channel_id values
    contain underscores (e.g. "ch_aukera_google_ads"), which would otherwise
    match any single character and delete unrelated keys.
    """
    escaped = prefix.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    conn = _get_conn()
    conn.execute("BEGIN IMMEDIATE")
    try:
        cur = conn.execute(
            "DELETE FROM cache WHERE key LIKE ? ESCAPE '\\'",
            (escaped + "%",),
        )
        conn.execute("COMMIT")
        return cur.rowcount
    except Exception:
        try:
            conn.execute("ROLLBACK")
        except Exception:
            pass
        return 0


def db_purge_expired() -> int:
    """
    Delete all expired entries. Returns the number of rows removed.
    Safe to call periodically — does not affect valid cache entries.
    """
    conn = _get_conn()
    conn.execute("BEGIN IMMEDIATE")
    try:
        cur = conn.execute("DELETE FROM cache WHERE expires_at <= ?", (_now_iso(),))
        conn.execute("COMMIT")
        return cur.rowcount
    except Exception:
        try:
            conn.execute("ROLLBACK")
        except Exception:
            pass
        return 0


def db_info() -> dict:
    """Return cache stats for the /health endpoint."""
    conn = _get_conn()
    total   = conn.execute("SELECT COUNT(*) FROM cache").fetchone()[0]
    valid   = conn.execute(
        "SELECT COUNT(*) FROM cache WHERE expires_at > ?", (_now_iso(),)
    ).fetchone()[0]
    expired = total - valid
    return {
        "total_entries":   total,
        "valid_entries":   valid,
        "expired_entries": expired,
    }


# ── Internal unsafe helpers (no transaction — only call inside one) ───────────

def _delete_unsafe(conn: sqlite3.Connection, key: str) -> None:
    """Delete a row without starting a new transaction. Caller owns the transaction."""
    try:
        conn.execute("DELETE FROM cache WHERE key = ?", (key,))
        conn.commit()
    except Exception:
        pass
