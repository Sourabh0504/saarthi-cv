"""
backend/calculator.py
=====================
All performance metric calculations for the CreativeVisibility portal.

Rules:
  - safeDiv() guards every division — NEVER divide by zero
  - All inputs are raw totals (impressions, clicks, cost, conversions)
  - All outputs are rounded to sane decimal places
  - Currency is always Indian Rupees (₹) — no conversion needed
  - Cost inputs arrive as float (rupees); stored/returned as float

Metrics:
  CTR  = clicks / impressions × 100           (percentage, 2dp)
  CPC  = cost / clicks                         (rupees, 2dp)
  CPM  = cost / impressions × 1000             (rupees, 2dp)
  CR   = conversions / clicks × 100            (percentage, 2dp)
  CPA  = cost / conversions                    (rupees, 2dp)
"""

from __future__ import annotations


def safe_div(numerator: float, denominator: float, fallback: float = 0.0) -> float:
    """
    Division with zero-guard.
    Returns fallback (default 0.0) if denominator is zero or None.
    This is the ONLY place division-by-zero can happen — always use this.
    """
    if not denominator:
        return fallback
    return numerator / denominator


def compute_metrics(
    impressions: float,
    clicks: float,
    cost: float,
    conversions: float,
) -> dict:
    """
    Compute all 5 KPI metrics for a single creative's aggregated totals.

    Args:
        impressions:  Total impressions for the date range
        clicks:       Total clicks for the date range
        cost:         Total cost in ₹ for the date range
        conversions:  Total conversions for the date range (can be decimal)

    Returns:
        dict with keys: ctr, cpc, cpm, cr, cpa
        All values are floats rounded to 2 decimal places.
        Zero-guarded — no division by zero possible.
    """
    ctr = round(safe_div(clicks, impressions) * 100, 2)       # %
    cpc = round(safe_div(cost, clicks), 2)                     # ₹ per click
    cpm = round(safe_div(cost, impressions) * 1000, 2)         # ₹ per 1000 impressions
    cr  = round(safe_div(conversions, clicks) * 100, 2)        # % conversion rate
    cpa = round(safe_div(cost, conversions), 2)                # ₹ per conversion

    return {
        "ctr": ctr,
        "cpc": cpc,
        "cpm": cpm,
        "cr":  cr,
        "cpa": cpa,
    }


def enrich_creative(raw: dict) -> dict:
    """
    Take a raw combined row (dimensions + performance aggregates) and
    attach computed metric fields in-place.

    Expects keys: impressions, clicks, cost, conversions
    Adds keys:    ctr, cpc, cpm, cr, cpa

    Safe to call even if performance keys are missing (treats as 0).
    """
    impressions  = float(raw.get("impressions", 0) or 0)
    clicks       = float(raw.get("clicks", 0) or 0)
    cost         = float(raw.get("cost", 0) or 0)
    conversions  = float(raw.get("conversions", 0) or 0)

    metrics = compute_metrics(impressions, clicks, cost, conversions)
    return {**raw, **metrics}


def enrich_all(creatives: list[dict]) -> list[dict]:
    """Enrich a list of creative rows with computed metrics."""
    return [enrich_creative(c) for c in creatives]


def top_performers(
    creatives: list[dict],
    metric: str,
    creative_type: str | None = None,
    city: str | None = None,
    n: int = 5,
) -> list[dict]:
    """
    Return the top N creatives ranked by a given metric.

    Args:
        creatives:     List of enriched creative dicts (must already have metrics)
        metric:        One of: "ctr", "conversions", "cpc", "cpa", "impressions", "clicks", "cost"
        creative_type: Optional filter — "Image", "Video", or "Text"
        city:          Optional filter — exact city name (case-sensitive)
        n:             Number of top results to return (default 5)

    Returns:
        Sorted list (best first) of up to N creatives.
        For cost-based metrics (cpc, cpa), lower is better — sorted ascending.
        For all other metrics, higher is better — sorted descending.
    """
    LOWER_IS_BETTER = {"cpc", "cpa"}

    filtered = creatives

    if creative_type:
        filtered = [c for c in filtered if c.get("creative_type") == creative_type]

    if city:
        filtered = [c for c in filtered if c.get("city") == city]

    # Only include creatives that actually have the metric (skip zero-spend ghosts)
    filtered = [c for c in filtered if c.get(metric, 0) not in (0, 0.0, None)]

    reverse = metric not in LOWER_IS_BETTER
    sorted_list = sorted(filtered, key=lambda c: c.get(metric, 0), reverse=reverse)

    return sorted_list[:n]
