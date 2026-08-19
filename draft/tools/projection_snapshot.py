#!/usr/bin/env python3
# TERRITORY: A
"""FREEZE every 2026 preseason projection we hold, so January can grade them.

A, 2026-08-19. This exists because of a hole found today and it is the
UNRECOVERABLE kind.

Cory asked whether we should blend Draft Sharks with Sleeper, FantasyPros and
others, and whether Draft Sharks is the most accurate. Both are empirical
questions. Neither can be answered, because `league_history.json` holds three
seasons of ACTUAL WEEKLY POINTS and this project has never stored a single
past-season FORECAST from anybody. We have outcomes and no predictions.

So today we can measure nothing, and if nothing changes we will be in exactly
this position next August. The fix is not clever, it is just early: write down
what every source says NOW, with the ids needed to join it to outcomes later.

Preseason projections are overwritten the moment the season starts. There is no
archive to go back for. This is a one-way door and it closes this week.

WHAT IT IS NOT: a grade, a blend, or a recommendation. It ranks nothing and
selects nothing. It is a filing cabinet.

Run: python3 draft/tools/projection_snapshot.py
"""
from __future__ import annotations
import json, hashlib
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
DATA = ROOT / "draft" / "data"
OUT = DATA / "projection_snapshot_2026.json"

BOARD = json.loads((ROOT / "public" / "draft_data.json").read_text())

def load(p, default=None):
    try:
        return json.loads((DATA / p).read_text())
    except Exception:
        return default

MULTI = load("multisource_projections.json", {}) or {}
DS = load("draftsharks_projections_2026.json", {}) or {}
ECR = load("expert_spread_2026.json", {}) or {}

# ── the sources, each with what it IS, so a January reader needs no one's memory
SOURCES = {
    "board_proj_mean":   "the blended number the 2026 board actually drafted on "
                         "(public/draft_data.json proj_mean)",
    "sleeper":           "Sleeper's own 2026 projection (board field proj_sleeper)",
    "fantasypros":       "FantasyPros 2026 projection (board field proj_fantasypros). "
                         "⚠️ FantasyPros is itself a CONSENSUS of other projectors, so "
                         "blending it alongside its own inputs double-counts them. "
                         "ffanalytics weights it at exactly 0.000 for this reason.",
    "own_v6":            "this project's own model (board field proj_ownmodel). "
                         "⚠️ register 107: it sits a median 15.3 points BELOW the board "
                         "mean on 80% of players, so any comparison must centre first.",
    "draftsharks":       "Draft Sharks' own 2026 half-PPR projection (ds_proj), from "
                         "PDF exports Cory produced on 08-19; 250 players only",
    "draftsharks_floor": "Draft Sharks floor_proj — a modelled per-player range, which "
                         "is a different quantity from our proj_floor (register 119)",
    "draftsharks_ceiling": "Draft Sharks ceil_proj",
    "draftsharks_consensus": "Draft Sharks' own consensus column (cons_proj)",
    "cbs": "CBS, via multisource_projections.json by_source",
    "espn": "ESPN, via multisource_projections.json by_source",
    "fftoday": "FFToday, via multisource_projections.json by_source",
}

def num(v):
    try:
        f = float(v)
        return f if f == f else None          # drop NaN
    except (TypeError, ValueError):
        return None

# ⭐ multisource is keyed by PLAYER_ID, not by name -- I assumed name and the
# first run crashed on it. That is the better outcome: an id join is exact,
# where a name join silently drops "D.J. Moore" against "DJ Moore" and the miss
# looks like "CBS had no opinion on him".
multi_by_id = {}
for pid, row in (MULTI.get("players") or {}).items():
    if isinstance(row, dict):
        multi_by_id[str(pid)] = row.get("by_source") or {}

ds_by_id = {}
for row in (DS.get("players") or []):
    if row.get("sleeper_id") is not None:
        ds_by_id[str(row["sleeper_id"])] = row

ecr_by_id = {}
for row in (ECR.get("players") or ECR if isinstance(ECR, list) else []):
    if isinstance(row, dict) and row.get("player_id") is not None:
        ecr_by_id[str(row["player_id"])] = row

players, multi_missed = [], 0
for p in BOARD.get("players", []):
    pid = str(p.get("player_id"))
    name = p.get("name") or p.get("player_name") or ""
    ms = multi_by_id.get(pid)
    if ms is None:
        multi_missed += 1
        ms = {}
    d = ds_by_id.get(pid, {})
    e = ecr_by_id.get(pid, {})
    rec = {
        # the join keys January will need. sleeper_id is the one that matters --
        # names change, ids do not.
        "player_id": pid, "name": name, "position": p.get("position"),
        "team": p.get("team"), "bye": p.get("bye"),
        # what the market thought, which is the baseline any source must beat
        "adp": num(p.get("adjusted_adp")) or num(p.get("raw_adp")),
        "adp_sd": num(p.get("adp_sd")),
        "consensus_rank": num(p.get("consensus_rank")),
        "ecr_rank": num(e.get("rank_ecr")), "ecr_spread": num(e.get("spread")),
        # the forecasts themselves
        "proj": {
            "board_proj_mean": num(p.get("proj_mean")),
            "sleeper": num(p.get("proj_sleeper")),
            "fantasypros": num(p.get("proj_fantasypros")),
            "own_v6": num(p.get("proj_ownmodel")),
            "draftsharks": num(d.get("ds_proj")),
            "draftsharks_consensus": num(d.get("cons_proj")),
            "cbs": num(ms.get("CBS") or ms.get("cbs")),
            "espn": num(ms.get("ESPN") or ms.get("espn")),
            "fftoday": num(ms.get("FFToday") or ms.get("fftoday")),
        },
        # ranges, which are NOT the same quantity across sources
        "bands": {
            "board_floor": num(p.get("proj_floor")),
            "board_ceiling": num(p.get("proj_ceiling")),
            "board_band_is": "mean +/- 1.28 * sd ACROSS SOURCES -- analyst "
                             "disagreement, not player volatility (register 103/119)",
            "draftsharks_floor": num(d.get("floor_proj")),
            "draftsharks_ceiling": num(d.get("ceil_proj")),
            "draftsharks_injury_risk_pct": num(d.get("injury_risk_pct")),
        },
    }
    players.append(rec)

cover = {k: sum(1 for r in players if r["proj"].get(k) is not None) for k in
         ("board_proj_mean", "sleeper", "fantasypros", "own_v6", "draftsharks",
          "cbs", "espn", "fftoday")}
n = len(players)

ctl = {
    "C1_at_least_four_independent_sources": {
        "ok": sum(1 for k, v in cover.items()
                  if k not in ("board_proj_mean", "fantasypros") and v > 100) >= 4,
        "coverage": cover,
        "why": "a snapshot with one real source cannot answer 'should we blend'. "
               "board_proj_mean and fantasypros are excluded from the count -- the "
               "first is a blend OF the others and the second is a consensus of "
               "others, so neither is independent evidence."},
    "C2_join_key_present_on_every_row": {
        "ok": all(r["player_id"] and r["player_id"] != "None" for r in players),
        "why": "January joins on player_id. A row without one is unusable and "
               "silently drops out of the grade."},
    "C3_multisource_join_misses_counted": {
        "ok": multi_missed < n,
        "board_players_with_no_multisource_row": multi_missed, "board_players": n,
        "why": "joined on PLAYER_ID, which is exact. Misses are real absences "
               "from the multisource store, not match failures -- counted anyway, "
               "because an uncounted miss looks like 'CBS had no opinion'."},
    "C4_self_describing": {
        "ok": all(k in SOURCES for k in cover),
        "why": "whoever grades this in January must not need to ask me what a "
               "field means. Every source carries its own definition and its own "
               "known defects in this file."},
}
all_ok = all(c["ok"] for c in ctl.values())

doc = {
    "_territory": "TERRITORY: A — draft/tools/projection_snapshot.py",
    "_what": "IMMUTABLE. Every 2026 preseason projection we hold, frozen for a "
             "January grade. Not a grade, not a blend, not a recommendation.",
    "_why": "This project holds three seasons of actual weekly points and ZERO "
            "past-season forecasts, so 'which source is most accurate' and "
            "'should we blend' are unanswerable today. Preseason projections are "
            "overwritten when the season starts; there is no archive to go back "
            "for. This is the one-way door.",
    "_captured": "2026-08-19, before the 2026 season",
    "_board_built_at": BOARD.get("built_at"),
    "_how_to_grade": "join on player_id to actual season points, then per source: "
                     "MAE and Spearman against outcomes, by position, on the "
                     "players that source actually covered. Compare each source "
                     "to `adp` -- a projection that cannot beat the market's "
                     "draft order is not worth blending.",
    "sources": SOURCES,
    "controls": ctl, "controls_all_passed": all_ok,
    "n_players": n, "coverage": cover,
    "players": players,
}
OUT.write_text(json.dumps(doc, indent=1))
digest = hashlib.sha256(OUT.read_bytes()).hexdigest()[:16]

print("PROJECTION SNAPSHOT 2026 — frozen for a January grade\n")
for k, v in ctl.items():
    print(("  OK  " if v["ok"] else "  FAIL") + k)
print(f"\n  {n} players\n")
print("  source                 players with a number")
for k, v in sorted(cover.items(), key=lambda kv: -kv[1]):
    note = ""
    if k == "fantasypros":
        note = "   (a consensus OF others -- do not blend alongside its inputs)"
    if k == "board_proj_mean":
        note = "   (a blend of the others, not independent evidence)"
    print(f"    {k:<22} {v:>6}{note}")
print(f"\n  wrote {OUT.name}  sha256:{digest}")
print("  ⚠️  IMMUTABLE. If it is ever regenerated after the season starts it is "
      "no longer a preseason forecast and the grade is void.")
raise SystemExit(0 if all_ok else 1)
