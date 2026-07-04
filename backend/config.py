"""
backend/config.py
=================
Reads all configuration from the .env file.
Import from here everywhere — never read os.environ directly.
"""

import os
from dotenv import load_dotenv

load_dotenv()

# ── Cache ─────────────────────────────────────────────────────────────────────
# Seconds to cache each (start, end) response from Apps Script.
# Default: 900 = 15 minutes
CACHE_TTL: int = int(os.getenv("CACHE_TTL", "900"))

# ── CORS ──────────────────────────────────────────────────────────────────────
# Comma-separated list of allowed frontend origins.
origins = os.getenv("ALLOWED_ORIGINS", "").split(",")
ALLOWED_ORIGINS: list[str] = origins

# ── Server ────────────────────────────────────────────────────────────────────
API_HOST: str = os.getenv("API_HOST", "0.0.0.0")
API_PORT: int = int(os.getenv("API_PORT", "8000"))

# ── Auth ──────────────────────────────────────────────────────────────────────
# Google OAuth Client ID (same value as VITE_GOOGLE_CLIENT_ID on frontend)
GOOGLE_CLIENT_ID: str = os.getenv("GOOGLE_CLIENT_ID", "")

# Comma-separated list of Google emails allowed to log in.
# Leave blank to allow ALL Google accounts.
# Example: "sourabh@gmail.com,client@brand.com"
ALLOWED_EMAILS: str = os.getenv("ALLOWED_EMAILS", "")

# Secret key for signing JWT session tokens.
# Generate with: python -c "import secrets; print(secrets.token_hex(32))"
JWT_SECRET: str = os.getenv("JWT_SECRET", "dev-secret-change-in-production-please")

# ── SQLite Persistent Cache ───────────────────────────────────────────────────
# Path to the SQLite file used as a durable cache tier.
# This file persists across server restarts — enables instant warm starts.
# Relative paths are resolved relative to the backend/ directory.
# Add cv_cache.db to .gitignore — it is a local runtime artifact, not source.
import pathlib as _pathlib
DB_PATH: _pathlib.Path = _pathlib.Path(
    os.getenv("DB_PATH", str(_pathlib.Path(__file__).parent / "cv_cache.db"))
)
