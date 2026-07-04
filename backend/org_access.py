"""
backend/org_access.py
======================
Org hierarchy (Cluster -> Team -> Account -> Channel) + role-based access resolution.

Data lives in backend/org_data/:
  - org_structure.json  : hierarchy shape (clusters, teams, accounts, channels) — committed, no secrets.
  - org_secrets.json     : per-channel sheet_url / apps_script_url — gitignored, never committed.
                           org_secrets.example.json shows the shape.
  - access_grants.json   : email -> list of (role, scope_type, scope_id) grants — committed.

Roles:
  - super_admin  : sees EVERY account/channel in the whole org, no exceptions
  - cluster_head : sees every team/account/channel under their cluster
  - team_head    : sees every account/channel under their team
  - account_head : sees every channel under their one account

super_admin grants use scope_type "global" (scope_id is ignored/unused).

A single user can hold multiple grants across unrelated branches (e.g. account_head
for accounts in different teams) — access_grants.json stores a LIST per email, not
a single role/scope.
"""

from __future__ import annotations

import json
import pathlib
from dataclasses import dataclass

_DATA_DIR = pathlib.Path(__file__).parent / "org_data"


@dataclass(frozen=True)
class Grant:
    role: str        # super_admin | cluster_head | team_head | account_head
    scope_type: str  # global | cluster | team | account
    scope_id: str


def _load_json(name: str) -> dict:
    path = _DATA_DIR / name
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def load_structure() -> dict:
    """Raw org_structure.json contents (clusters, teams, accounts, channels)."""
    return _load_json("org_structure.json")


def load_grants() -> dict[str, list[Grant]]:
    """email (lowercased) -> list[Grant], parsed from access_grants.json."""
    raw = _load_json("access_grants.json")
    grants_by_email: dict[str, list[Grant]] = {}
    for g in raw.get("grants", []):
        email = g["email"].strip().lower()
        grant = Grant(role=g["role"], scope_type=g["scope_type"], scope_id=g["scope_id"])
        grants_by_email.setdefault(email, []).append(grant)
    return grants_by_email


def _accessible_channel_ids(structure: dict, grants: list[Grant]) -> set[str]:
    """Walk the hierarchy for each grant and collect every channel id it covers."""
    if any(g.scope_type == "global" for g in grants):
        return {c["id"] for c in structure["channels"]}

    teams_by_cluster: dict[str, list[str]] = {}
    for t in structure["teams"]:
        teams_by_cluster.setdefault(t["cluster_id"], []).append(t["id"])

    accounts_by_team: dict[str, list[str]] = {}
    for a in structure["accounts"]:
        accounts_by_team.setdefault(a["team_id"], []).append(a["id"])

    channels_by_account: dict[str, list[str]] = {}
    for c in structure["channels"]:
        channels_by_account.setdefault(c["account_id"], []).append(c["id"])

    result: set[str] = set()
    for g in grants:
        if g.scope_type == "account":
            result.update(channels_by_account.get(g.scope_id, []))
        elif g.scope_type == "team":
            for acc_id in accounts_by_team.get(g.scope_id, []):
                result.update(channels_by_account.get(acc_id, []))
        elif g.scope_type == "cluster":
            for team_id in teams_by_cluster.get(g.scope_id, []):
                for acc_id in accounts_by_team.get(team_id, []):
                    result.update(channels_by_account.get(acc_id, []))
    return result


def get_accessible_channels(email: str) -> list[dict]:
    """
    Channel dicts (from org_structure.json) this email has access to,
    based on their grants. Empty list if the email has no grants.
    """
    structure = load_structure()
    grants = load_grants().get(email.strip().lower(), [])
    if not grants:
        return []

    channel_ids = _accessible_channel_ids(structure, grants)
    return [c for c in structure["channels"] if c["id"] in channel_ids]


def get_channel_secrets(channel_id: str) -> dict:
    """
    Per-channel secrets (sheet_url, apps_script_url) from org_secrets.json.
    Returns {} if the channel has no secrets entry (not yet configured).
    """
    try:
        secrets = _load_json("org_secrets.json")
    except FileNotFoundError:
        return {}
    return secrets.get(channel_id, {})


def get_channel_platform(channel_id: str) -> str:
    """
    Which ad platform a channel is ("google_ads" | "meta_ads" | ...), from
    org_structure.json. Used to pick the right calculator + drives the
    frontend's channel icon. Defaults to "google_ads" for channels created
    before this field existed.
    """
    structure = load_structure()
    for c in structure["channels"]:
        if c["id"] == channel_id:
            return c.get("platform", "google_ads")
    return "google_ads"


def user_can_access_channel(email: str, channel_id: str) -> bool:
    """True if this email's grants cover the given channel_id."""
    accessible_ids = {c["id"] for c in get_accessible_channels(email)}
    return channel_id in accessible_ids


def get_accessible_accounts(email: str) -> list[dict]:
    """Account dicts this email can see at least one channel under (for the home screen)."""
    channels = get_accessible_channels(email)
    account_ids = {c["account_id"] for c in channels}
    structure = load_structure()
    return [a for a in structure["accounts"] if a["id"] in account_ids]


def _scope_name(structure: dict, scope_type: str, scope_id: str) -> str:
    """Human-readable name for a grant's scope, for display in the UI."""
    if scope_type == "global":
        return "Entire Organisation"
    lookup = {
        "cluster": structure["clusters"],
        "team":    structure["teams"],
        "account": structure["accounts"],
    }.get(scope_type, [])
    for item in lookup:
        if item["id"] == scope_id:
            return item["name"]
    return scope_id


def get_user_access_summary(email: str) -> dict:
    """
    Human-readable summary of a user's access, for the profile section:
      { "is_super_admin": bool, "grants": [{role, scope_type, scope_name}] }
    """
    structure = load_structure()
    grants = load_grants().get(email.strip().lower(), [])
    return {
        "is_super_admin": any(g.role == "super_admin" for g in grants),
        "grants": [
            {
                "role":       g.role,
                "scope_type": g.scope_type,
                "scope_name": _scope_name(structure, g.scope_type, g.scope_id),
            }
            for g in grants
        ],
    }


def build_home_payload(email: str) -> dict:
    """
    Full payload for GET /api/home: the user's access summary + every
    account they can see, enriched with team/cluster names and grouped channels.
    """
    structure = load_structure()
    teams_by_id    = {t["id"]: t for t in structure["teams"]}
    clusters_by_id = {c["id"]: c for c in structure["clusters"]}

    channels = get_accessible_channels(email)
    channels_by_account: dict[str, list[dict]] = {}
    for ch in channels:
        channels_by_account.setdefault(ch["account_id"], []).append({
            "id":       ch["id"],
            "name":     ch["name"],
            "logo_url": ch["logo_url"],
            "platform": ch.get("platform", "google_ads"),
        })

    accounts = get_accessible_accounts(email)
    account_payload = []
    for a in accounts:
        team = teams_by_id.get(a["team_id"], {})
        cluster = clusters_by_id.get(team.get("cluster_id", ""), {})
        account_payload.append({
            "id":           a["id"],
            "name":         a["name"],
            "logo_url":     a["logo_url"],
            "team_name":    team.get("name", ""),
            "cluster_name": cluster.get("name", ""),
            "channels":     channels_by_account.get(a["id"], []),
        })

    return {
        "status":   "ok",
        "user":     get_user_access_summary(email),
        "accounts": account_payload,
    }
