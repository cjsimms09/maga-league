#!/usr/bin/env python3
"""MYFANTASYLEAGUE ADP — a SECOND gradeable historical redraft ADP source.

The probe (adp_sources_probe.json, 2026-08-09) settled what the docs got wrong: the
MFL year-scoped export returns HISTORICAL adp for 2023/24/25 (status 200,
totalDrafts=5011 in 2023) — a large, free, JSON, revealed-behavior consensus, exactly
the kind that cleared our null. This module is the PURE parser + crosswalk:
  parse(adp_json, players_json) -> [{name, position, team, adp, drafts}]
join MFL's numeric player id (in the adp report) to MFL's players export (id -> name/
pos/team), so the rows land in the same shape exp36 already grades FFC in. The FETCH
(TYPE=adp and TYPE=players, JSON=1, per year) runs in CI (open egress); this core is
egress-free and unit-tested in test_mfl_adp.py.

Endpoint (documented): https://api.myfantasyleague.com/{YEAR}/export?TYPE=adp
  &PERIOD=DRAFT&IS_PPR=1&IS_KEEPER=N&IS_MOCK=-1&INJURED=-1&CUTOFF=5&FCOUNT=12&JSON=1
  IS_PPR=1 is full-PPR; MFL has no half-PPR ADP flag, so we take PPR and DOCUMENT the
  format gap (half vs full PPR mostly reshuffles pass-catching RB/WR at the margin;
  the exp36 grader compares SOURCES on the SAME realized outcomes, so a shared format
  offset cancels in the head-to-head). FCOUNT=12 team count; our league is 10 — the
  overall-pick invariant (Cory) is used, not raw round, so the count difference is a
  documented caveat, not a blocker.
"""
from __future__ import annotations
import json


def _norm_name(mfl_name):
    """MFL prints 'Last, First' — normalize to 'First Last' for the shared crosswalk."""
    if not mfl_name:
        return None
    s = str(mfl_name).strip()
    if "," in s:
        last, _, first = s.partition(",")
        return (first.strip() + " " + last.strip()).strip()
    return s


def _players_index(players_json):
    """MFL players export -> {id: {name, position, team}}. Accepts dict or JSON str."""
    d = json.loads(players_json) if isinstance(players_json, str) else players_json
    node = ((d or {}).get("players") or {}).get("player") or []
    if isinstance(node, dict):
        node = [node]
    idx = {}
    for p in node:
        pid = str(p.get("id")) if p.get("id") is not None else None
        if pid:
            idx[pid] = {"name": _norm_name(p.get("name")),
                        "position": (p.get("position") or None),
                        "team": (p.get("team") or None)}
    return idx


def parse(adp_json, players_json):
    """Join the MFL adp report to the players export. Returns rows:
    [{name, position, team, adp, drafts}] sorted by adp (ascending = earliest)."""
    d = json.loads(adp_json) if isinstance(adp_json, str) else adp_json
    adp_node = (d or {}).get("adp") or {}
    players = adp_node.get("player") or []
    if isinstance(players, dict):
        players = [players]
    idx = _players_index(players_json)
    rows = []
    for p in players:
        pid = str(p.get("id")) if p.get("id") is not None else None
        # MFL field is 'averagePick'; tolerate 'adp'/'avg' variants defensively.
        avg = p.get("averagePick", p.get("adp", p.get("avg")))
        if pid is None or avg is None:
            continue
        try:
            adp = float(avg)
        except (TypeError, ValueError):
            continue
        meta = idx.get(pid) or {}
        rows.append({"mfl_id": pid, "name": meta.get("name"),
                     "position": meta.get("position"), "team": meta.get("team"),
                     "adp": adp,
                     "drafts": _to_int(p.get("draftsSelectedIn"))})
    rows.sort(key=lambda r: r["adp"])
    return rows


def _to_int(x):
    try:
        return int(x)
    except (TypeError, ValueError):
        return None


def coverage(rows):
    """How usable is a parsed source: total rows, how many resolved to a name/pos."""
    n = len(rows)
    named = sum(1 for r in rows if r.get("name") and r.get("position"))
    return {"rows": n, "named": named,
            "named_frac": round(named / n, 3) if n else 0.0}
