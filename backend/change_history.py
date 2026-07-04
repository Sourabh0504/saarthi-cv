"""
backend/change_history.py
==========================
Reads/writes the Change History Google Sheet, via
backend/apps_script/changeHistoryDoGet.js.

v1 scope: account-level, not campaign-level (see the note at the top of
changeHistoryDoGet.js) — Saarthi has no Campaign Master data source yet, so
this logs "a change to Account X" rather than "a change to Campaign Y".
Upgrading to per-campaign granularity later is additive (new columns +
a campaign lookup), not a rewrite of this module.

Degrades gracefully: if the Change History Apps Script hasn't been deployed
yet, get_recent_changes() returns an empty, clearly-marked list instead of
erroring, and log_change() raises a clear, catchable error the route turns
into a friendly 503 rather than a raw exception.
"""

from __future__ import annotations

import httpx

from org_access import get_shared_secret

_TIMEOUT = httpx.Timeout(connect=10.0, read=20.0, write=10.0, pool=10.0)


class ChangeHistoryNotConfigured(Exception):
    """Raised when shared_secrets.json's change_history_apps_script_url is empty."""


def _require_url() -> str:
    url = get_shared_secret("change_history_apps_script_url")
    if not url:
        raise ChangeHistoryNotConfigured(
            "Change History isn't connected yet — an admin needs to deploy the "
            "Change_History sheet's Apps Script and add its URL to "
            "backend/org_data/shared_secrets.json."
        )
    return url


async def get_recent_changes(account_id: str, limit: int = 20) -> dict:
    """Returns {"configured": bool, "changes": [...]}."""
    try:
        url = _require_url()
    except ChangeHistoryNotConfigured:
        return {"configured": False, "changes": []}

    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT, follow_redirects=True) as client:
            resp = await client.get(url, params={"account_id": account_id, "limit": str(limit)})
        resp.raise_for_status()
        data = resp.json()
    except Exception as exc:
        return {"configured": True, "changes": [], "error": str(exc)}

    if data.get("status") != "ok":
        return {"configured": True, "changes": [], "error": data.get("message", "Unknown error")}

    return {"configured": True, "changes": data.get("changes", [])}


async def log_change(payload: dict) -> dict:
    """
    Appends one immutable change record. Raises ChangeHistoryNotConfigured
    if the Apps Script URL isn't set yet — the route turns this into a 503
    with a clear message rather than a raw 500.
    """
    url = _require_url()

    async with httpx.AsyncClient(timeout=_TIMEOUT, follow_redirects=True) as client:
        resp = await client.post(url, json=payload)
    resp.raise_for_status()
    data = resp.json()

    if data.get("status") != "ok":
        raise ValueError(data.get("message", "Change History Apps Script returned an error."))

    return data
