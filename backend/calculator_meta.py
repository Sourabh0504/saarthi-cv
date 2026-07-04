"""
backend/calculator_meta.py
===========================
Meta Ads (Facebook/Instagram) performance metric calculations.

Mirrors calculator.py's shape, but with Meta's metric set — clicks means
"Link clicks" and conversions means "On Facebook Leads" (already mapped to
these generic field names by the Meta Apps Script, so no relabeling needed here):

  CTR  = clicks / impressions × 100
  CPC  = cost / clicks
  CPM  = cost / impressions × 1000
  CVR  = conversions / clicks × 100      (Meta uses CVR/CPL, not Google's CR/CPA)
  CPL  = cost / conversions

Extra Meta-only fields (landing_page_views, thruplays, hook_rate,
video_avg_watch_time) are already aggregated by the Apps Script — weighted
averages for hook_rate/video_avg_watch_time are computed there, not here —
so this module just passes them through unchanged when present.
"""

from __future__ import annotations

from calculator import safe_div

_EXTRA_FIELDS = ("landing_page_views", "thruplays", "hook_rate", "video_avg_watch_time")


def compute_metrics(
    impressions: float,
    clicks: float,
    cost: float,
    conversions: float,
) -> dict:
    """Compute Meta's 5 KPI metrics for a single creative's aggregated totals."""
    ctr = round(safe_div(clicks, impressions) * 100, 2)
    cpc = round(safe_div(cost, clicks), 2)
    cpm = round(safe_div(cost, impressions) * 1000, 2)
    cvr = round(safe_div(conversions, clicks) * 100, 2)
    cpl = round(safe_div(cost, conversions), 2)

    return {
        "ctr": ctr,
        "cpc": cpc,
        "cpm": cpm,
        "cvr": cvr,
        "cpl": cpl,
    }


def _to_float_opt(value) -> float | None:
    """Coerce to float, returning None (not 0) when the field is genuinely absent."""
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def enrich_creative(raw: dict) -> dict:
    """
    Take a raw combined row (dimensions + performance aggregates) and
    attach computed metric fields + any present Meta-only extras.
    """
    impressions = float(raw.get("impressions", 0) or 0)
    clicks      = float(raw.get("clicks", 0) or 0)
    cost        = float(raw.get("cost", 0) or 0)
    conversions = float(raw.get("conversions", 0) or 0)

    metrics = compute_metrics(impressions, clicks, cost, conversions)

    extras: dict = {}
    for field in _EXTRA_FIELDS:
        val = _to_float_opt(raw.get(field))
        if val is not None:
            extras[field] = val

    return {**raw, **metrics, **extras}


def enrich_all(creatives: list[dict]) -> list[dict]:
    """Enrich a list of creative rows with computed Meta metrics."""
    return [enrich_creative(c) for c in creatives]


def top_performers(
    creatives: list[dict],
    metric: str,
    creative_type: str | None = None,
    city: str | None = None,
    n: int = 5,
) -> list[dict]:
    """
    Same ranking logic as calculator.top_performers, but cpc/cpl (not cpc/cpa)
    are the "lower is better" metrics for Meta.
    """
    LOWER_IS_BETTER = {"cpc", "cpl"}

    filtered = creatives

    if creative_type:
        filtered = [c for c in filtered if c.get("creative_type") == creative_type]

    if city:
        filtered = [c for c in filtered if c.get("city") == city]

    filtered = [c for c in filtered if c.get(metric, 0) not in (0, 0.0, None)]

    reverse = metric not in LOWER_IS_BETTER
    sorted_list = sorted(filtered, key=lambda c: c.get(metric, 0), reverse=reverse)

    return sorted_list[:n]
