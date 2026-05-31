"""
backend/auth.py
===============
Google OAuth2 token verification + JWT session management.

Flow:
  1. Frontend gets a Google access_token via @react-oauth/google
  2. Frontend POSTs it to POST /auth/google
  3. Backend calls Google's userinfo endpoint to verify + get profile
  4. Backend checks email against ALLOWED_EMAILS whitelist
  5. Backend issues a signed JWT (7-day TTL) containing user info
  6. Frontend stores JWT in localStorage and sends it on every API call

No google-auth library needed — just httpx (already installed) + PyJWT.
"""

from __future__ import annotations

import time
from typing import Optional

import httpx
import jwt as pyjwt
from fastapi import HTTPException, Security
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

from config import ALLOWED_EMAILS, JWT_SECRET

# ── Constants ─────────────────────────────────────────────────────────────────
ALGORITHM  = "HS256"
JWT_EXPIRE = 7 * 24 * 3600          # 7 days in seconds
GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo"

# ── FastAPI bearer security scheme ────────────────────────────────────────────
_bearer = HTTPBearer(auto_error=False)


# ─────────────────────────────────────────────────────────────────────────────
# Google token verification
# ─────────────────────────────────────────────────────────────────────────────

async def verify_google_access_token(access_token: str) -> dict:
    """
    Call Google's userinfo endpoint to verify an access token and
    return the user's profile (email, name, picture, sub, email_verified).
    Raises HTTP 401 if the token is invalid or expired.
    """
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(
            GOOGLE_USERINFO_URL,
            headers={"Authorization": f"Bearer {access_token}"},
        )

    if resp.status_code != 200:
        raise HTTPException(
            status_code=401,
            detail="Invalid or expired Google token. Please sign in again.",
        )

    return resp.json()


# ─────────────────────────────────────────────────────────────────────────────
# Whitelist enforcement
# ─────────────────────────────────────────────────────────────────────────────

def check_whitelist(email: str) -> None:
    """
    Raise HTTP 403 if the email is not in the ALLOWED_EMAILS whitelist.
    If ALLOWED_EMAILS is empty, all Google accounts are permitted.
    """
    if not ALLOWED_EMAILS.strip():
        return  # open access — every Google account allowed

    allowed = {e.strip().lower() for e in ALLOWED_EMAILS.split(",") if e.strip()}
    if email.lower() not in allowed:
        raise HTTPException(
            status_code=403,
            detail=(
                f"Access denied. {email} is not authorised for this portal. "
                "Contact your administrator to request access."
            ),
        )


# ─────────────────────────────────────────────────────────────────────────────
# JWT helpers
# ─────────────────────────────────────────────────────────────────────────────

def create_session_token(user: dict) -> str:
    """
    Issue a signed HS256 JWT containing user profile info.
    The frontend can decode the payload client-side (no secret needed to read,
    only to verify — verification happens on the backend via /auth/me).
    """
    now = int(time.time())
    payload = {
        "sub":             user.get("sub", ""),
        "email":           user.get("email", ""),
        "name":            user.get("name", ""),
        "picture":         user.get("picture", ""),
        "email_verified":  user.get("email_verified", False),
        "iat":             now,
        "exp":             now + JWT_EXPIRE,
    }
    return pyjwt.encode(payload, JWT_SECRET, algorithm=ALGORITHM)


def decode_session_token(token: str) -> dict:
    """
    Decode and verify our JWT. Raises HTTP 401 if invalid or expired.
    """
    try:
        return pyjwt.decode(token, JWT_SECRET, algorithms=[ALGORITHM])
    except pyjwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Session expired. Please sign in again.")
    except pyjwt.InvalidTokenError as exc:
        raise HTTPException(status_code=401, detail=f"Invalid session token: {exc}")


# ─────────────────────────────────────────────────────────────────────────────
# FastAPI dependencies
# ─────────────────────────────────────────────────────────────────────────────

def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Security(_bearer),
) -> Optional[dict]:
    """
    Soft auth dependency — returns user dict if JWT is present and valid,
    returns None if no Authorization header is sent.
    Use on endpoints that work with or without authentication.
    """
    if not credentials:
        return None
    return decode_session_token(credentials.credentials)


def require_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Security(_bearer),
) -> dict:
    """
    Hard auth dependency — raises HTTP 401 if no valid JWT is present.
    Use on endpoints that require authentication.
    """
    if not credentials:
        raise HTTPException(
            status_code=401,
            detail="Authentication required. Please sign in.",
        )
    return decode_session_token(credentials.credentials)
