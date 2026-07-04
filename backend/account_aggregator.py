"""
backend/account_aggregator.py
==============================
Aggregates performance across every channel under one account, for the
Account Overview screen. Reuses each channel's existing, already-cached,
platform-dispatched fetch_data() from apps_script_connector.py — this
module only sums the results, it never talks to Apps Script directly.

Aggregation is always done on raw totals (impressions/clicks/cost/conversions)
summed first, then rates (ctr/cpc/cpm/cost_per_conversion) computed from the
sums — never averaged per-channel, which would be mathematically wrong when
channels have very different volumes.

"conversions" is already a platform-neutral field name in Creative data —
Google's conversions and Meta's "On Facebook Leads" both land in this same
key upstream (calculator.py / calculator_meta.py), so summing it across
channels naturally gives a blended lead count with no platform-specific
handling needed here.

Resilience: if one channel's Apps Script call fails, the other channels'
data still comes back — the failing channel is marked with an "error" field
and excluded from the totals, and the response's top-level "partial" flag
is set, rather than failing the whole account summary over one bad channel.
"""

from __future__ import annotations

from apps_script_connector import fetch_data
from calculator import safe_div
from org_access import get_channels_for_account


def _sum_creative_totals(creatives: list[dict]) -> dict:
    totals = {"impressions": 0.0, "clicks": 0.0, "cost": 0.0, "conversions": 0.0}
    for c in creatives:
        totals["impressions"] += float(c.get("impressions", 0) or 0)
        totals["clicks"]      += float(c.get("clicks", 0) or 0)
        totals["cost"]        += float(c.get("cost", 0) or 0)
        totals["conversions"] += float(c.get("conversions", 0) or 0)
    return totals


def _rates(totals: dict) -> dict:
    """Blended rates computed from summed totals — platform-neutral naming
    (cost_per_conversion, not cpa/cpl) since this spans mixed platforms."""
    impressions = totals["impressions"]
    clicks      = totals["clicks"]
    cost        = totals["cost"]
    conversions = totals["conversions"]
    return {
        "ctr": round(safe_div(clicks, impressions) * 100, 2),
        "cpc": round(safe_div(cost, clicks), 2),
        "cpm": round(safe_div(cost, impressions) * 1000, 2),
        "cost_per_conversion": round(safe_div(cost, conversions), 2),
    }


async def fetch_account_summary(account_id: str, start: str, end: str) -> dict:
    """
    Fetch and combine performance across every channel under `account_id`,
    for one explicit date range.

    `start`/`end` are always required (not optional/"auto") — unlike a
    single-channel dashboard, an account summary blends multiple channels
    that may each have different underlying data ranges, so there is no
    sensible per-channel "auto" that stays comparable across channels.
    The caller (main.py) is responsible for defaulting to "current month"
    when the user hasn't picked a range.

    Returns:
    {
      "status": "ok",
      "partial": bool,                 # True if any channel's fetch failed
      "date_range": {"start": str, "end": str},
      "totals": {impressions, clicks, cost, conversions, ctr, cpc, cpm, cost_per_conversion},
      "channels": [
        {channel_id, channel_name, platform, impressions, clicks, cost, conversions,
         served_from_cache} | {channel_id, channel_name, platform, error}
      ]
    }
    """
    channels = get_channels_for_account(account_id)

    channel_results: list[dict] = []
    grand_totals = {"impressions": 0.0, "clicks": 0.0, "cost": 0.0, "conversions": 0.0}
    any_failed = False

    for channel in channels:
        entry: dict = {
            "channel_id":   channel["id"],
            "channel_name": channel["name"],
            "platform":     channel.get("platform", "unknown"),
        }
        try:
            data = await fetch_data(channel["id"], start, end)
            channel_totals = _sum_creative_totals(data.get("creatives", []))
            entry.update(channel_totals)
            entry["served_from_cache"] = data.get("served_from_cache", False)
            for key in grand_totals:
                grand_totals[key] += channel_totals[key]
        except Exception as exc:
            any_failed = True
            entry["error"] = str(exc)
        channel_results.append(entry)

    totals = {**grand_totals, **_rates(grand_totals)}

    return {
        "status":     "ok",
        "partial":    any_failed,
        "date_range": {"start": start, "end": end},
        "totals":     totals,
        "channels":   channel_results,
    }
