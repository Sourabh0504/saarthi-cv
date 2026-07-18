"""
backend/deck_builder.py
========================
Assembles a "Weekly/Monthly Business Review" deck as a CarouselData-shaped
JSON payload — same schema as the already-built ContentMaster slide engine
(references/ContentMaster/src/types/content.ts), reused deliberately so a
future rendering phase can consume this output with no format translation.

This module is pure data assembly: it composes real Account Overview data
(account_aggregator, targets, change_history) into slides. It does NOT
render anything — no HTML, no PDF, no frontend. That's a later phase.

Block shapes below are copied from the actual ContentMaster component
props (references/ContentMaster/src/components/slides/blocks/*.tsx),
not guessed from the loose TypeScript types — kpi-grid, progress-bar,
compare, and timeline are verified against real component code.
"""

from __future__ import annotations

from account_aggregator import fetch_account_summary
from targets import fetch_account_target
from change_history import get_recent_changes


def _fmt_money(value: float) -> str:
    return f"₹{value:,.0f}"


def _fmt_num(value: float) -> str:
    return f"{value:,.0f}"


def _kpi_slide(summary: dict) -> dict:
    """KPI Overview slide — kpi-grid block, verified prop shape:
    { items: [{icon?, value, label, tone?}] }"""
    totals = summary["totals"]
    return {
        "id": "kpi-overview",
        "template": "reference",
        "badge": {"label": "OVERVIEW", "icon": "BarChart3", "tone": "info"},
        "title": {"part1": "Performance", "part2": "Snapshot"},
        "blocks": [
            {
                "type": "kpi-grid",
                "items": [
                    {"icon": "Users", "value": _fmt_num(totals["conversions"]), "label": "Leads", "tone": "primary"},
                    {"icon": "IndianRupee", "value": _fmt_money(totals["cost"]), "label": "Spend"},
                    {"icon": "Eye", "value": _fmt_num(totals["impressions"]), "label": "Impressions"},
                    {"icon": "MousePointerClick", "value": _fmt_num(totals["clicks"]), "label": "Clicks"},
                    {"icon": "Percent", "value": f"{totals['ctr']}%", "label": "CTR"},
                    {"icon": "Target", "value": _fmt_money(totals["cost_per_conversion"]), "label": "Cost / Lead"},
                ],
            }
        ],
    }


def _target_slide(summary: dict, target: dict) -> dict | None:
    """Target vs Achieved slide — progress-bar block, verified prop shape:
    { tone?, items: [{label, percent, sublabel?}] }. None if no target is set,
    since there's nothing meaningful to show — not an error, just an absent slide."""
    if not target.get("found"):
        return None

    totals = summary["totals"]
    items = []

    target_leads = target.get("target_leads") or 0
    if target_leads > 0:
        pct = round(min(100, (totals["conversions"] / target_leads) * 100))
        items.append({
            "label": "Leads",
            "percent": pct,
            "sublabel": f"{_fmt_num(totals['conversions'])} / {_fmt_num(target_leads)}",
        })

    target_spend = target.get("target_spend") or 0
    if target_spend > 0:
        pct = round(min(100, (totals["cost"] / target_spend) * 100))
        items.append({
            "label": "Spend",
            "percent": pct,
            "sublabel": f"{_fmt_money(totals['cost'])} / {_fmt_money(target_spend)}",
        })

    if not items:
        return None

    return {
        "id": "target-vs-achieved",
        "template": "reference",
        "badge": {"label": "PACING", "icon": "Target", "tone": "primary"},
        "title": {"part1": "Target vs", "part2": "Achieved"},
        "blocks": [{"type": "progress-bar", "tone": "primary", "items": items}],
    }


def _channel_slide(summary: dict) -> dict | None:
    """Channel breakdown slide — compare block (exactly 2 channels fits its
    left/right shape natively). None if fewer than 2 channels reported."""
    channels = [c for c in summary["channels"] if "error" not in c]
    if len(channels) < 2:
        return None

    def panel(ch: dict) -> dict:
        return {
            "heading": ch["channel_name"],
            "items": [
                f"Spend: {_fmt_money(ch.get('cost', 0))}",
                f"Leads: {_fmt_num(ch.get('conversions', 0))}",
                f"Impressions: {_fmt_num(ch.get('impressions', 0))}",
                f"Clicks: {_fmt_num(ch.get('clicks', 0))}",
            ],
        }

    left, right = channels[0], channels[1]
    return {
        "id": "channel-breakdown",
        "template": "comparison",
        "badge": {"label": "BY CHANNEL", "icon": "PieChart", "tone": "neutral"},
        "title": {"part1": "Channel", "part2": "Breakdown"},
        "blocks": [{
            "type": "compare",
            "left": panel(left),
            "right": panel(right),
        }],
    }


def _change_log_slide(changes: list[dict]) -> dict | None:
    """Recent changes slide — timeline block, verified prop shape:
    { tone?, items: [{marker, label, description?}] }. None if there's
    nothing documented yet — an empty slide would just be noise."""
    if not changes:
        return None

    items = []
    for c in changes[:8]:  # keep the slide readable — top 8, most recent first
        date_label = c.get("timestamp", "")[:10]
        items.append({
            "marker": date_label,
            "label": c.get("change_type", ""),
            "description": c.get("reason", ""),
        })

    return {
        "id": "change-log",
        "template": "reference",
        "badge": {"label": "WHAT WE DID", "icon": "History", "tone": "neutral"},
        "title": {"part1": "Recent", "part2": "Changes"},
        "blocks": [{"type": "timeline", "items": items}],
    }


async def build_weekly_business_review(account_id: str, account_name: str, start: str, end: str) -> dict:
    """
    Assembles a CarouselData-shaped dict for a Business Review deck covering
    one account's period. Slides that have nothing meaningful to show
    (no target set, only one channel, no logged changes) are omitted rather
    than rendered empty — a deck should never show a blank slide as filler.
    """
    summary = await fetch_account_summary(account_id, start, end)
    month = start[:7]  # "YYYY-MM" — targets are keyed by month, not arbitrary ranges
    target = await fetch_account_target(account_id, month)
    changes_result = await get_recent_changes(account_id, limit=8)

    slides = [
        {
            "id": "cover",
            "template": "cover",
            "badge": {"label": "BUSINESS REVIEW", "icon": "TrendingUp", "tone": "primary"},
            "title": {"part1": account_name, "part2": "Performance Review"},
            "blocks": [{"type": "lead", "text": f"{start} – {end}"}],
            "footer": {"author": "Saarthi", "brand": account_name},
        },
        _kpi_slide(summary),
    ]

    for slide in (
        _target_slide(summary, target),
        _channel_slide(summary),
        _change_log_slide(changes_result.get("changes", [])),
    ):
        if slide is not None:
            slides.append(slide)

    return {
        "meta": {
            "id": f"business-review-{account_id}-{start}",
            "title": f"{account_name} — Business Review",
            "subtitle": f"{start} – {end}",
            "theme": "dark",
            "accent": "primary",
        },
        "slides": slides,
    }
