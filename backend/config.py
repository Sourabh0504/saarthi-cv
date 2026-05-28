"""
backend/config.py
=================
Reads all configuration from the .env file.
Import from here everywhere — never read os.environ directly.
"""

import os
from dotenv import load_dotenv

load_dotenv()


def _require(key: str) -> str:
    """Read a required env var — raises clearly if missing."""
    val = os.getenv(key)
    if not val:
        raise RuntimeError(
            f"[config] Required env var '{key}' is missing or empty. "
            f"Copy backend/.env.template -> backend/.env and fill it in."
        )
    return val


# ── Apps Script ───────────────────────────────────────────────────────────────
# Lazy getter — value is resolved on first call, not at import time.
# This allows all modules to import cleanly even before .env exists.
_apps_script_url: str | None = None

def get_apps_script_url() -> str:
    """Return the Apps Script URL. Fails clearly if .env is not configured."""
    global _apps_script_url
    if _apps_script_url is None:
        _apps_script_url = _require("APPS_SCRIPT_URL")
    return _apps_script_url

# Keep a module-level alias for backwards compat — resolved lazily on access
class _LazyURL:
    def __str__(self): return get_apps_script_url()
    def __repr__(self): return get_apps_script_url()
    def __eq__(self, other): return str(self) == other
    def __add__(self, other): return str(self) + other

APPS_SCRIPT_URL = _LazyURL()  # type: ignore

# ── Cache ─────────────────────────────────────────────────────────────────────
# Seconds to cache each (start, end) response from Apps Script.
# Default: 900 = 15 minutes
CACHE_TTL: int = int(os.getenv("CACHE_TTL", "900"))

# ── CORS ──────────────────────────────────────────────────────────────────────
# Comma-separated list of allowed frontend origins.
_raw_origins = os.getenv("ALLOWED_ORIGINS", "http://localhost:5173,http://localhost:3000")
ALLOWED_ORIGINS: list[str] = [o.strip() for o in _raw_origins.split(",") if o.strip()]

# ── Server ────────────────────────────────────────────────────────────────────
API_HOST: str = os.getenv("API_HOST", "0.0.0.0")
API_PORT: int = int(os.getenv("API_PORT", "8000"))
