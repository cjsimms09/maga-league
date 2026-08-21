# TERRITORY: C
"""OPPONENT-TENDENCY STORE — pull-list №3, item 4. Feeds E's P144: "per-owner
lineup habits from league_history -- how late they set lineups, bench-points
left, reaction to injuries -- the persistence priors E's opponent model
consumes."

REUSE, NOT REBUILD (rule 11): `opponent_starters.build_store()`'s already-
committed bench/starters split is reused verbatim rather than re-derived; this
module only adds the two NEW measures the ask names plus the point values,
which neither existing store carries. `injury_designations.json`'s already-
committed weekly Q/D/O map is reused verbatim for the reaction measure.

THREE THINGS WERE ASKED, AND ONLY TWO ARE MEASURABLE FROM THIS DATA --
CHECKED BEFORE BUILDING, NOT ASSUMED (rule 3f): `league_history.json`'s
matchup rows carry `starters`, `players`, `players_points` and
`starters_points` -- no timestamp anywhere on the ROSTER SUBMISSION itself
(only `transactions` rows carry `created`, and a waiver claim is not a
lineup set). "How late they set lineups" is not present in any committed or
reachable store; this module reports that refusal explicitly rather than
inventing a proxy, per this project's own standard for a graded no.

WHAT IS BUILT:
  (1) BENCH-POINTS LEFT: sum of `players_points` for every player NOT in
      `starters` that week -- a direct, real measure of lineup-decision cost,
      per (season, week, roster_id) and pooled per owner.
  (2) INJURY-REACTION RATE: of the players on a roster carrying a real
      Q/D/O designation that week, what fraction the owner started anyway --
      a real behavioral signal (risk tolerance), per owner, pooled across
      2023-2025 (injury_designations covers 2021-2025; matchup data only
      exists for 2023-2025, so the join is naturally restricted to the
      overlap).

Run: python3 draft/backtest/opponent_tendency.py
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
DRAFT = HERE.parent
ROOT = DRAFT.parent

LEAGUE_HISTORY = ROOT / "draft" / "data" / "league_history.json"
INJURY = HERE / "injury_designations.json"
OUT = HERE / "opponent_tendency.json"

sys.path.insert(0, str(HERE))
from opponent_starters import build_store as build_starters_store  # noqa: E402

LINEUP_TIMING_NOTE = (
    "UNMEASURABLE from any committed or reachable store -- checked, not "
    "assumed: league_history.json's matchup rows carry no lineup-submission "
    "timestamp; only `transactions` rows carry `created`, and a waiver claim "
    "is not a lineup set. A stand-in proxy would be a guess wearing this "
    "field's name; not built."
)


def load_history(path=None) -> dict:
    return json.loads((path or LEAGUE_HISTORY).read_text())


def load_injury_by_season(path=None) -> dict:
    doc = json.loads((path or INJURY).read_text())
    return doc.get("by_season") or {}


def bench_points_left(row: dict, bench: list) -> float:
    """Sum of `players_points` for the bench list this module was given --
    trusts the bench split from `opponent_starters` rather than re-deriving
    it (rule 11), only adds the point lookup neither existing store has."""
    pts = row.get("players_points") or {}
    return round(sum(float(pts.get(p, 0.0) or 0.0) for p in bench), 2)


def injury_reaction(row: dict, inj_week: dict) -> dict:
    """{flagged, started, rate} for one roster-week: of the players on this
    ROSTER (not just starters) carrying a real designation that week, how
    many did the owner start anyway. `rate=None` (not 0) when nothing on the
    roster was flagged that week -- a real zero-denominator, not a zero."""
    players = row.get("players") or []
    starters = set(row.get("starters") or [])
    flagged = [p for p in players if p in inj_week]
    started = [p for p in flagged if p in starters]
    rate = round(len(started) / len(flagged), 4) if flagged else None
    return {"flagged": len(flagged), "started": len(started), "rate": rate,
            "flagged_ids": flagged, "started_ids": started}


def build_season(season_doc: dict, starters_season: dict, inj_season: dict) -> dict:
    """{week: {roster_id: {bench_points_left, injury_reaction}}}."""
    out: dict = {}
    for wk, rows in (season_doc.get("weeks") or {}).items():
        week_out = {}
        inj_week = inj_season.get(str(wk), {})
        starters_week = starters_season.get(str(wk), {})
        for row in rows:
            rid = str(row["roster_id"])
            bench = starters_week.get(rid, {}).get("bench", [])
            week_out[rid] = {
                "bench_points_left": bench_points_left(row, bench),
                "injury_reaction": injury_reaction(row, inj_week),
            }
        out[str(wk)] = week_out
    return out


def per_owner_summary(by_season: dict) -> dict:
    """Pools every season-week into one row per roster_id -- the priors
    E's opponent model actually consumes are per-owner, not per-week."""
    owners: dict = {}
    for season, weeks in by_season.items():
        for wk, rosters in weeks.items():
            for rid, cell in rosters.items():
                o = owners.setdefault(rid, {
                    "weeks_seen": 0, "bench_points_total": 0.0,
                    "flagged_total": 0, "started_total": 0,
                })
                o["weeks_seen"] += 1
                o["bench_points_total"] += cell["bench_points_left"]
                o["flagged_total"] += cell["injury_reaction"]["flagged"]
                o["started_total"] += cell["injury_reaction"]["started"]

    summary = {}
    for rid, o in owners.items():
        summary[rid] = {
            "weeks_seen": o["weeks_seen"],
            "bench_points_left_per_week": round(o["bench_points_total"] / o["weeks_seen"], 2)
                                          if o["weeks_seen"] else None,
            "injury_start_rate": round(o["started_total"] / o["flagged_total"], 4)
                                 if o["flagged_total"] else None,
            "flagged_player_weeks": o["flagged_total"],
        }
    return summary


def verify_known_positive(by_season: dict) -> dict:
    """Rule 3e: two real, opposite-direction cases, checked by hand against
    the raw data before this module was written (rule 3f) --
    2025 week 1, roster 4, player 4037 (designation O, real, correctly
    BENCHED, 0.0 points) and roster 7, player 4034 (designation Q, real,
    STARTED anyway, scored 18.7). Both directions matter: a control that
    only checks the benched case cannot tell 'always benches' from 'reads
    the flag correctly'."""
    wk1 = by_season.get("2025", {}).get("1", {})
    r4 = wk1.get("4", {}).get("injury_reaction", {})
    r7 = wk1.get("7", {}).get("injury_reaction", {})
    ok = ("4037" in r4.get("flagged_ids", []) and "4037" not in r4.get("started_ids", [])
          and "4034" in r7.get("flagged_ids", []) and "4034" in r7.get("started_ids", []))
    return {"ok": ok, "roster_4_flagged": r4.get("flagged_ids", []),
            "roster_4_started": r4.get("started_ids", []),
            "roster_7_flagged": r7.get("flagged_ids", []),
            "roster_7_started": r7.get("started_ids", [])}


def build_store(seasons=(2023, 2024, 2025)) -> dict:
    history = load_history()
    starters_store = build_starters_store(history)  # rule 11
    inj_by_season = load_injury_by_season()

    hist_seasons = history.get("seasons") if isinstance(history, dict) and "seasons" in history else history
    by_season: dict = {}
    for s in hist_seasons:
        season = s.get("season")
        try:
            season_int = int(season)
        except (TypeError, ValueError):
            continue
        if season_int not in seasons:
            continue
        season_str = str(season)
        starters_season = starters_store["seasons"].get(season_str, {})
        inj_season = inj_by_season.get(season_str, {})
        by_season[season_str] = build_season(s, starters_season, inj_season)

    control = verify_known_positive(by_season)
    summary = per_owner_summary(by_season)

    doc = {
        "_territory": "TERRITORY: C — produced by draft/backtest/opponent_tendency.py",
        "_note": "Feeds E's P144 opponent-model priors. Two of the three "
                 "asked-for measures are real (bench-points-left, "
                 "injury-reaction-rate); the third (lineup timing) is a "
                 "measured refusal, stated in lineup_timing below rather "
                 "than silently dropped.",
        "lineup_timing": LINEUP_TIMING_NOTE,
        "seasons": list(seasons),
        "rule_3e_control": control,
        "per_owner_summary": summary,
        "by_season": by_season,
    }
    return doc


def main(seasons=(2023, 2024, 2025)) -> int:
    doc = build_store(seasons)
    if not doc["rule_3e_control"]["ok"]:
        print("REFUSING TO WRITE — the known-positive control failed:",
              doc["rule_3e_control"])
        return 1
    OUT.write_text(json.dumps(doc, indent=1))
    n_owners = len(doc["per_owner_summary"])
    print(f"wrote {OUT.relative_to(DRAFT.parent)}: {n_owners} owners, "
         f"seasons {doc['seasons']}, control ok={doc['rule_3e_control']['ok']}")
    return 0


if __name__ == "__main__":
    yrs = tuple(int(a) for a in sys.argv[1:]) or (2023, 2024, 2025)
    sys.exit(main(yrs))
