# TERRITORY: C
"""C4 — RB OFFSEASON FEATURES: backfield competition + team change.

Routed A -> C, ROUTES.md 2026-08-18 ("C4 -- THE NEXT PROJECTION ARM IS YOURS
TO BUILD"), V7-CANDIDATE-PREREG.md §1 (C4) and §4 (P-v7c). Feature store
only -- grading is A's, through the shared two-fold harness, POST-DRAFT
(V7-CANDIDATE-PREREG.md §5: "nothing here touches Saturday's board").

WHAT THIS BUILDS. RB rows, player_id x season for 2021-26, carrying:

  backfield_depth_n     how many RBs are on the player's own team's depth
                        chart this season (a crowded-committee proxy)
  player_depth_rank     this player's own rank on that depth chart (1 =
                        starter)
  notable_arrivals      count of RBs on the depth chart this season who were
                        NOT on this team last season (trade/FA/draft/etc.)
  notable_departures    count of RBs who WERE on this team's depth chart last
                        season and are gone this season
  team_change           this player changed teams from the prior season
                        (None if the player has no prior-season row at all --
                        a rookie's first season is not a "change")

THE LEAKAGE RULE THE FIVE DEAD V7 CANDIDATES TAUGHT (read C1/C3/C5/C7's
post-mortems in V7-CANDIDATE-PREREG.md §6 before touching this file): every
feature here must be knowable at DRAFT TIME of the season it describes.
depth_rows/roster_rows passed into build_rows() MUST already be filtered to
an offseason/Week-1 snapshot upstream (egress_main() does this by
construction, selecting the season's EARLIEST available week from
nfl_data_py's weekly depth-chart releases) -- an in-season-updated depth
chart (Week 8's committee reshuffle after an injury) is not offseason-ness,
it is in-season usage wearing an offseason feature's name, and grading
against it would silently leak the outcome the feature is supposed to
predict.

AS-OF PROOF, NOT JUST A CLAIM. Every row carries `as_of`, naming the exact
snapshot used (season + week + source function), so a later reviewer can
confirm offseason-ness from the artifact alone rather than trusting this
docstring.

AMBIGUOUS FEATURES ARE KEPT, NOT DROPPED (A's stated DEFAULT for this
order): every judgment call below carries a `_definition` note in the
committed artifact instead of being silently decided in code with no
paper trail.

Run:  python3 draft/backtest/rb_offseason_features.py
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

from grade import crosswalk_gsis_to_sleeper  # noqa: E402  -- rule 11, reused not re-derived

SEASONS = (2021, 2022, 2023, 2024, 2025, 2026)
POSITION = "RB"
OUT = HERE / "rb_offseason_features.json"


# ── pure feature logic (fixture-testable, no egress) ────────────────────────

def depth_ranks(depth_rows: list) -> dict:
    """{gsis_id: rank} for one team/season's RB depth chart. depth_rows:
    [{gsis_id, depth_team}] already filtered to POSITION and one team/season.
    `depth_team` is nflverse's own 1-indexed depth slot; ties (same
    depth_team value) are broken by row order, which is the order
    nfl_data_py serves them in -- stable, not re-sorted here."""
    ranked = sorted(
        (r for r in depth_rows if r.get("gsis_id")),
        key=lambda r: (_int_or_last(r.get("depth_team")),),
    )
    return {r["gsis_id"]: i + 1 for i, r in enumerate(ranked)}


def _int_or_last(v) -> int:
    try:
        return int(v)
    except (TypeError, ValueError):
        return 99  # unparsable depth slot sorts after every real one


def team_of(roster_rows: list) -> dict:
    """{gsis_id: team} for one season's RB roster snapshot. A player who
    appears more than once (mid-offseason roster move) keeps the LAST row's
    team, matching build_historical_byes.py's own documented simplification
    for the same class of rare case."""
    out = {}
    for r in roster_rows:
        gid = r.get("gsis_id")
        if gid:
            out[gid] = r.get("team")
    return out


def backfield_rows_for_team(cur_depth: list, prior_depth: list | None) -> dict:
    """{gsis_id: {backfield_depth_n, player_depth_rank, notable_arrivals,
    notable_departures}} for ONE team/season, given this season's and (if
    any) the PRIOR season's depth-chart rows for that same team."""
    ranks = depth_ranks(cur_depth)
    cur_ids = set(ranks)
    n = len(cur_ids)
    if prior_depth is None:
        arrivals = departures = None  # no prior-season chart to compare against
    else:
        prior_ids = {r["gsis_id"] for r in prior_depth if r.get("gsis_id")}
        arrivals = len(cur_ids - prior_ids)
        departures = len(prior_ids - cur_ids)
    return {
        gid: {
            "backfield_depth_n": n,
            "player_depth_rank": rank,
            "notable_arrivals": arrivals,
            "notable_departures": departures,
        }
        for gid, rank in ranks.items()
    }


def team_change_flags(cur_team: dict, prior_team: dict | None) -> dict:
    """{gsis_id: True/False/None} -- None for a player with no prior-season
    roster row at all (a rookie's first season is not a "change"; grading
    it as False would silently claim continuity that was never measured)."""
    if prior_team is None:
        return {gid: None for gid in cur_team}
    out = {}
    for gid, team in cur_team.items():
        prev = prior_team.get(gid)
        out[gid] = None if prev is None else (team != prev)
    return out


DEFINITIONS = {
    "backfield_depth_n": ("count of RBs listed on the player's team's Week-1 "
                          "depth chart -- ties in the raw depth_team column "
                          "broken by nfl_data_py's serving order, not "
                          "re-sorted; a crowded-committee proxy, not a "
                          "usage-share measurement."),
    "player_depth_rank": ("this player's own 1-indexed rank on that same "
                          "Week-1 chart; 1 = listed starter."),
    "notable_arrivals": ("count of RBs on this season's Week-1 chart who "
                         "were NOT on this team's PRIOR season's Week-1 "
                         "chart -- rookies, trades and free-agent signings "
                         "are not distinguished from each other, only "
                         "counted as one class (offseason turnover IN); "
                         "null when no prior-season chart exists for the "
                         "team (2021, the first season captured)."),
    "notable_departures": ("count of RBs on the PRIOR season's Week-1 chart "
                           "who are absent from this season's -- retirement, "
                           "release and trade-out are not distinguished, "
                           "only counted as one class (offseason turnover "
                           "OUT); null under the same 2021 condition above."),
    "team_change": ("this player's own team differs from his prior season's "
                    "team; null for a player with no prior-season roster "
                    "row (most commonly a rookie's first season -- treated "
                    "as UNKNOWN, not as False, since 'no change' was never "
                    "actually observed)."),
}


def build_rows(depth_by_team: dict, prior_depth_by_team: dict,
               roster_by_team: dict, prior_roster_by_team: dict,
               crosswalk: dict, season: int, as_of: str) -> list:
    """depth_by_team / roster_by_team: {team: [rows]} for `season`, already
    filtered to POSITION and to the offseason snapshot by the caller.
    prior_* are the same shape for `season - 1`, or {} if that season was
    not captured (2021 has no prior year in this store's range).
    crosswalk: {gsis_id: sleeper_id}, from crosswalk_gsis_to_sleeper (rule
    11 -- reused, not re-derived)."""
    rows = []
    for team, cur_depth in depth_by_team.items():
        prior_depth = prior_depth_by_team.get(team)
        bf = backfield_rows_for_team(cur_depth, prior_depth)
        cur_roster = roster_by_team.get(team, [])
        prior_roster = prior_roster_by_team.get(team)
        tc = team_change_flags(team_of(cur_roster), (
            team_of(prior_roster) if prior_roster is not None else None))
        for gid, feats in bf.items():
            sleeper_id = crosswalk.get(gid)
            if sleeper_id is None:
                continue  # unmapped id -- dropped, not guessed; matches
                          # crosswalk_gsis_to_sleeper's own documented gap
            rows.append({
                "player_id": sleeper_id,
                "gsis_id": gid,
                "season": season,
                "team": team,
                "position": POSITION,
                **feats,
                "team_change": tc.get(gid),
                "source": "nfl_data_py import_depth_charts + import_seasonal_rosters",
                "as_of": as_of,
            })
    return rows


# ── egress (real fetch; CI only -- sandbox proxy blocks nfl_data_py) ────────

def egress_main() -> dict:  # pragma: no cover  (egress; CI only)
    import nfl_data_py as nfl

    ids_df = nfl.import_ids()
    crosswalk = crosswalk_gsis_to_sleeper([], ids_df)

    depth_all = nfl.import_depth_charts(list(SEASONS))
    roster_all = nfl.import_seasonal_rosters(list(SEASONS))
    if "gsis_id" not in roster_all.columns and "player_id" in roster_all.columns:
        # import_seasonal_rosters renames gsis_id -> player_id internally
        # (nfl_data_py's own __import_rosters source); same id, restored to
        # the name this module and its crosswalk join use throughout.
        roster_all = roster_all.rename(columns={"player_id": "gsis_id"})

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

    depth_all = depth_all[depth_all["position"] == POSITION]
    roster_all = roster_all[roster_all["position"] == POSITION]

    def _offseason_week(season: int) -> int | None:
        weeks = sorted(set(int(w) for w in
                           depth_all[depth_all["season"] == season]["week"]))
        return weeks[0] if weeks else None

    by_season_depth, by_season_roster, as_of_by_season = {}, {}, {}
    for season in SEASONS:
        wk = _offseason_week(season)
        if wk is None:
            by_season_depth[season] = {}
            continue
        sub = depth_all[(depth_all["season"] == season) & (depth_all["week"] == wk)]
        by_team = {}
        for _, r in sub.iterrows():
            by_team.setdefault(r["club_code"], []).append(
                {"gsis_id": r.get("gsis_id"), "depth_team": r.get("depth_team")})
        by_season_depth[season] = by_team
        rsub = roster_all[roster_all["season"] == season]
        rby_team = {}
        for _, r in rsub.iterrows():
            rby_team.setdefault(r["team"], []).append({"gsis_id": r.get("gsis_id"),
                                                        "team": r.get("team")})
        by_season_roster[season] = rby_team
        as_of_by_season[season] = (f"season {season} week {wk} depth chart "
                                   f"(nfl_data_py import_depth_charts, "
                                   f"earliest available week)")

    all_rows = []
    for season in SEASONS:
        cur_depth = by_season_depth.get(season, {})
        if not cur_depth:
            continue
        prior_depth = by_season_depth.get(season - 1, {})
        cur_roster = by_season_roster.get(season, {})
        prior_roster = by_season_roster.get(season - 1)
        rows = build_rows(cur_depth, prior_depth, cur_roster,
                          prior_roster if prior_roster is not None else {},
                          crosswalk, season, as_of_by_season[season])
        all_rows.extend(rows)

    if not all_rows:
        return {"status": "VOID", "reason": "0 rows built across all seasons"}

    doc = {
        "_territory": "TERRITORY: C -- produced by rb_offseason_features.py",
        "_prereg": "V7-CANDIDATE-PREREG.md §1 (C4), §4 (P-v7c)",
        "_note": ("RB offseason feature store for the C4 candidate arm -- "
                 "backfield competition + team change, one row per RB per "
                 "season the player appeared on an offseason depth chart. "
                 "Not graded here -- A grades through the shared two-fold "
                 "harness POST-DRAFT (V7-CANDIDATE-PREREG.md §5)."),
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
