# TERRITORY: C
"""C6 — QB-CONTEXT REPRICING FOR RECEIVERS: attach each WR/TE to their team's
offseason starting QB and that QB's FITTED quality (prior-season PPG).

Routed A -> C, ROUTES.md 2026-08-18 ("C6 IS YOURS — QB-CONTEXT REPRICING FOR
RECEIVERS"), V7-CANDIDATE-PREREG.md §1 (C6). Feature store only -- grading is
A's, through the shared two-fold harness, POST-DRAFT alongside C4 and C7's
re-entry. Nothing here touches Saturday's board.

WHAT THIS BUILDS. WR/TE rows, player_id x season, carrying:

  attached_qb_id          sleeper_id of the team's offseason depth-chart QB1
                          (same team, same season) -- None if no clear QB1
  attached_qb_ppg_prior   that QB's fantasy points-per-game in season - 1,
                          from the committed nflverse_weekly_points store --
                          None if the QB has no prior-season row (a rookie
                          or first-year starter's context is unmeasured, not
                          guessed)

THE LEAKAGE RULE, restated for THIS feature (read C1/C3/C5/C7's post-mortems
in V7-CANDIDATE-PREREG.md §6 first -- same three rules C4 followed):

  1. ablatable inside the full stack -- rows join by player_id x season,
     same shape discipline as C4's rb_offseason_features.py.
  2. must exist for BOTH graded seasons (2024 and 2025), not just 2026.
  3. leak-free by construction -- "fitted QB quality" means the QB's PPG in
     season - 1 ONLY (never the graded season itself, never in-season
     games), and "attached QB" means the OFFSEASON depth-chart QB1 (the
     earliest available week's snapshot, same mechanism as C4) -- never an
     in-season starter change. THE IN-SEASON HALF (a depth-chart QB change
     triggering a reprice) IS POST-DRAFT WIRING, DELIBERATELY NOT BUILT
     HERE -- this module produces the offseason field only.

THE D-NULL OBLIGATION (ROUTES.md, same order): whoever GRADES this arm must
report its error correlation against own_v6 on the graded season beside the
result -- an arm that correlates >0.98 with the champion is another costume
of the same signal, not a genuinely disagreeing one. Not this module's job
(grading is A's), but named here so it isn't lost between build and grade.

REUSE, NOT RE-DERIVATION (rule 11): `depth_ranks` and `_int_or_last` are
imported from `rb_offseason_features.py` (C4, same offseason-depth-chart
mechanism, generic over position) rather than re-implemented.
`crosswalk_gsis_to_sleeper` from `grade.py` and `season_totals`/
`positions_record` from `model_accuracy_backtest.py` are reused exactly as
`own_model_v6.py` and `rb_offseason_features.py` already use them.

Run:  python3 draft/backtest/qb_context_receiver_features.py
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

from grade import crosswalk_gsis_to_sleeper  # noqa: E402  -- rule 11
from rb_offseason_features import depth_ranks, _int_or_last  # noqa: E402,F401 -- rule 11
from model_accuracy_backtest import season_totals  # noqa: E402  -- rule 11

SEASONS = (2022, 2023, 2024, 2025, 2026)
RECEIVER_POSITIONS = ("WR", "TE")
QB_POSITION = "QB"
OUT = HERE / "qb_context_receiver_features.json"


# ── pure feature logic (fixture-testable, no egress) ────────────────────────

def starting_qb(qb_depth_rows: list) -> str | None:
    """gsis_id of the team's offseason depth-chart QB1, or None if the
    team's QB depth chart is empty (never guessed from a tie -- depth_ranks'
    own tie-break, inherited from C4, applies identically here)."""
    ranks = depth_ranks(qb_depth_rows)
    if not ranks:
        return None
    return min(ranks, key=lambda gid: ranks[gid])


def qb_ppg_prior(qb_sleeper_id: str | None, prior_totals: dict,
                 prior_games: dict) -> float | None:
    """QB's fantasy points-per-game in the PRIOR season only. None if the
    QB is unknown, or has no prior-season row (rookie / first-year starter
    -- unmeasured, not zero)."""
    if qb_sleeper_id is None:
        return None
    games = prior_games.get(qb_sleeper_id)
    if not games:
        return None
    pts = prior_totals.get(qb_sleeper_id, 0.0)
    return round(pts / games, 2)


def build_rows(receiver_rows_by_team: dict, qb_depth_by_team: dict,
              prior_totals: dict, prior_games: dict, crosswalk: dict,
              season: int, as_of: str) -> list:
    """receiver_rows_by_team / qb_depth_by_team: {team: [rows]} for
    `season`, already filtered to WR/TE and QB respectively and to the
    offseason snapshot by the caller. prior_totals/prior_games: season - 1's
    season_totals() output, keyed by sleeper_id already. crosswalk:
    {gsis_id: sleeper_id}, from crosswalk_gsis_to_sleeper (rule 11)."""
    rows = []
    for team, receivers in receiver_rows_by_team.items():
        qb_gsis = starting_qb(qb_depth_by_team.get(team, []))
        qb_sleeper = crosswalk.get(qb_gsis) if qb_gsis else None
        qb_ppg = qb_ppg_prior(qb_sleeper, prior_totals, prior_games)
        for r in receivers:
            gid = r.get("gsis_id")
            if not gid:
                continue
            sleeper_id = crosswalk.get(gid)
            if sleeper_id is None:
                continue  # unmapped id -- dropped, not guessed (C4's rule)
            rows.append({
                "player_id": sleeper_id,
                "season": season,
                "team": team,
                "position": r.get("position"),
                "attached_qb_id": qb_sleeper,
                "attached_qb_ppg_prior": qb_ppg,
                "source": "nfl_data_py import_depth_charts + import_rosters "
                         "+ committed nflverse_weekly_points",
                "as_of": as_of,
            })
    return rows


DEFINITIONS = {
    "attached_qb_id": ("sleeper_id of the team's offseason depth-chart QB1 "
                       "(earliest available week's snapshot, C4's as-of "
                       "mechanism) -- null if the team's QB depth chart is "
                       "empty for that season."),
    "attached_qb_ppg_prior": ("that QB's fantasy points-per-game in "
                              "season - 1 ONLY, from the committed "
                              "nflverse_weekly_points store -- null for a "
                              "QB with no prior-season row (rookie or "
                              "first-year starter), never guessed as 0 or "
                              "as a league-average fill-in."),
}


# ── egress (real fetch; CI only -- sandbox proxy blocks nfl_data_py) ────────

def egress_main() -> dict:  # pragma: no cover  (egress; CI only)
    import nfl_data_py as nfl

    ids_df = nfl.import_ids()
    crosswalk = crosswalk_gsis_to_sleeper([], ids_df)

    depth_all = nfl.import_depth_charts(list(SEASONS))
    roster_all = nfl.import_rosters(list(SEASONS))

    need_depth = {"season", "week", "club_code", "depth_team", "gsis_id", "position"}
    need_roster = {"season", "team", "position", "gsis_id"}
    if not need_depth.issubset(set(depth_all.columns)):
        return {"status": "VOID",
                "reason": f"import_depth_charts missing columns: "
                          f"{need_depth - set(depth_all.columns)}"}
    if not need_roster.issubset(set(roster_all.columns)):
        return {"status": "VOID",
                "reason": f"import_rosters missing columns: "
                          f"{need_roster - set(roster_all.columns)}"}

    qb_depth = depth_all[depth_all["position"] == QB_POSITION]
    receiver_roster = roster_all[roster_all["position"].isin(RECEIVER_POSITIONS)]

    def _offseason_week(season: int) -> int | None:
        weeks = sorted(set(int(w) for w in
                           qb_depth[qb_depth["season"] == season]["week"]))
        return weeks[0] if weeks else None

    all_rows = []
    for season in SEASONS:
        wk = _offseason_week(season)
        if wk is None:
            continue
        qsub = qb_depth[(qb_depth["season"] == season) & (qb_depth["week"] == wk)]
        qb_by_team = {}
        for _, r in qsub.iterrows():
            qb_by_team.setdefault(r["club_code"], []).append(
                {"gsis_id": r.get("gsis_id"), "depth_team": r.get("depth_team")})

        rsub = receiver_roster[receiver_roster["season"] == season]
        rec_by_team = {}
        for _, r in rsub.iterrows():
            rec_by_team.setdefault(r["team"], []).append(
                {"gsis_id": r.get("gsis_id"), "position": r.get("position")})

        prior_totals, prior_games = season_totals(season - 1)
        as_of = (f"season {season} week {wk} QB depth chart "
                f"(nfl_data_py import_depth_charts, earliest available "
                f"week) + season {season} roster (import_rosters) + "
                f"{season - 1} committed weekly-points store")
        rows = build_rows(rec_by_team, qb_by_team, prior_totals, prior_games,
                          crosswalk, season, as_of)
        all_rows.extend(rows)

    if not all_rows:
        return {"status": "VOID", "reason": "0 rows built across all seasons"}

    doc = {
        "_territory": "TERRITORY: C -- produced by qb_context_receiver_features.py",
        "_prereg": "V7-CANDIDATE-PREREG.md §1 (C6)",
        "_note": ("WR/TE rows attaching each receiver to their team's "
                 "offseason starting QB and that QB's prior-season PPG -- "
                 "one row per receiver per season. Not graded here -- A "
                 "grades through the shared two-fold harness POST-DRAFT "
                 "(V7-CANDIDATE-PREREG.md §5), and must report error "
                 "correlation against own_v6 beside the result (the D-null "
                 "obligation)."),
        "_definitions": DEFINITIONS,
        "seasons": list(SEASONS),
        "rows": all_rows,
        "row_count": len(all_rows),
    }
    OUT.write_text(json.dumps(doc, indent=1))
    return doc


def main() -> None:  # pragma: no cover  (egress; CI only)
    doc = egress_main()
    if doc.get("status") == "VOID":
        print(f"VOID: {doc['reason']}")
        sys.exit(1)
    print(f"wrote {OUT.name} -- {doc['row_count']} rows across "
         f"{len(doc['seasons'])} season(s)")


if __name__ == "__main__":
    main()
