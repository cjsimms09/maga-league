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
        # DISPERSION, KEPT RATHER THAN DISCARDED.
        #
        # This parser read `averagePick` and `draftsSelectedIn` and dropped the
        # rest, so every daily snapshot since 2026-08-11 lost the only
        # player-specific spread any source gives us. Meanwhile the board's
        # MEASURED ON THE FIRST REAL SPREAD, 2026-08-14, AND IT CORRECTS
        # THIS JUSTIFICATION. Inside the draft range the board's `adp_sd` is NOT a
        # clamp: it is FFC-PUBLISHED for 142 of the 146 players priced inside pick
        # 150, with 38 distinct values across adp 0-50, 41 across 50-100 and 47
        # across 100-150. The saturation is real but lives ENTIRELY BEYOND PICK
        # 150 — 348 rows at 30.00 (`fallback-clamped`) and 122 at 15.00 — which is
        # the deep pool A's own comment calls a place where "nothing reaches a
        # decision today".
        #
        # So the capture is still worth having — a day's spread is perishable, MFL
        # is a genuine second opinion, and the deep pool IS content-free — but NOT
        # for the reason written below, which was true of the board as a whole and
        # false of the part that drafts get made from. Kept unedited so the
        # correction is visible rather than tidied away:
        #
        # `adp_sd` is a clamp that saturates in both directions — 15.00 for
        # every player at adp >= 100, 30.00 for the entire search_rank fallback
        # by construction — and it drives survival, which drives VONA.
        #
        # A mean is a fact about a day; so is a spread, and it is just as
        # perishable. Capturing is cheap and cannot be done retroactively;
        # DERIVING an sd from these is a separate question and is deliberately
        # not attempted here (see the module docstring).
        rows.append({"mfl_id": pid, "name": meta.get("name"),
                     "position": meta.get("position"), "team": meta.get("team"),
                     "adp": adp,
                     "drafts": _to_int(p.get("draftsSelectedIn")),
                     "min_pick": _to_int(p.get("minPick")),
                     "max_pick": _to_int(p.get("maxPick")),
                     "sel_pct": _to_float(p.get("draftSelPct"))})
    rows.sort(key=lambda r: r["adp"])
    return rows


def _to_int(x):
    try:
        return int(x)
    except (TypeError, ValueError):
        return None


def _to_float(x):
    """ABSENT STAYS ABSENT. A field the source did not publish is None, never 0.0
    — a dispersion of zero is the most confident possible claim (taken at exactly
    the same pick in every draft), and it is the opposite of what silence means."""
    try:
        return float(x)
    except (TypeError, ValueError):
        return None


def coverage(rows):
    """How usable is a parsed source: total rows, how many resolved to a name/pos."""
    n = len(rows)
    named = sum(1 for r in rows if r.get("name") and r.get("position"))
    return {"rows": n, "named": named,
            "named_frac": round(named / n, 3) if n else 0.0}
