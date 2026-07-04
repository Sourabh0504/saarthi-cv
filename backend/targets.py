"""
backend/targets.py
===================
Reads monthly account targets (leads/spend) from the dedicated Targets
Google Sheet, via backend/apps_script/targetsDoGet.js.

Degrades gracefully: if the Targets Apps Script hasn't been deployed yet
(shared_secrets.json's targets_apps_script_url is empty) or no target row
exists for this account/month, this returns found=False rather than
raising — the Account Overview screen shows an empty/"set a target" state
instead of erroring.
"""

from __future__ import annotations

import httpx

from org_access import get_shared_secret

_TIMEOUT = httpx.Timeout(connect=10.0, read=20.0, write=10.0, pool=10.0)


async def fetch_account_target(account_id: str, month: str) -> dict:
    """
    Returns {"found": False} if Targets isn't configured yet or no row
    exists for this account/month. Otherwise:
    {"found": True, "account_id", "month", "target_leads", "target_spend"}
    """
    url = get_shared_secret("targets_apps_script_url")
    if not url:
        return {"found": False, "configured": False}

    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT, follow_redirects=True) as client:
            resp = await client.get(url, params={"account_id": account_id, "month": month})
        resp.raise_for_status()
        data = resp.json()
    except Exception as exc:
        # Non-fatal — the sheet may be temporarily unreachable. Surface as
        # "not found" rather than a 502, since a target is optional context,
        # not core to the KPI cards the rest of the screen depends on.
        return {"found": False, "configured": True, "error": str(exc)}

    if data.get("status") != "ok" or not data.get("found"):
        return {"found": False, "configured": True}

    return {
        "found":         True,
        "configured":    True,
        "account_id":    account_id,
        "month":         month,
        "target_leads":  data.get("target_leads", 0),
        "target_spend":  data.get("target_spend", 0),
    }
