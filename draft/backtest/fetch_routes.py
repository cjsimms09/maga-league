# TERRITORY: A
"""ROUTES RUN (proxy) AND TARGET-PER-ROUTE-RUN — the second per-player opportunity feed.

Cory: *"what other data are we missing"*. This is the one after snap share.

THERE IS NO ROUTES FEED, AND THAT IS THE FIRST THING TO KNOW. nflverse publishes
no routes file (`routes/routes_YYYY.csv` 404s) and `ftn_charting` is PLAY-level
— motion, play-action, blitzers — with no player ids and no route counts. True
routes run is a PFF / Fantasy Points Data product this project does not have.

SO THIS IS A PROXY, BUILT FROM `pbp_participation`: for every PASS play, each
skill player listed in `offense_players` is counted as having run a route. It is
available for 2021-2025.

**IT IS AN UPPER BOUND AND MUST BE READ AS ONE.** A tight end or back who stayed
in to block is on the field and is counted. That inflation is largest exactly
where it matters least (blocking TEs are not the players a route metric is used
to evaluate) but it is real, it is not estimated here, and nothing downstream
should treat this as a measured route count.

WHY IT IS WORTH THE TROUBLE: routes run is the DENOMINATOR for
target-per-route-run, which is the cleanest receiving-efficiency measure there
is — a player with 60 targets on 300 routes is being used very differently from
one with 60 on 600, and target share alone cannot tell them apart. And like snap
share it is a genuine PER-PLAYER quantity, which is the family that finally
produced a real signal (weekly_volatility.py).

── THE PBP JOIN IS REQUIRED, AND THAT WAS MEASURED, NOT ASSUMED ──────────────

`pbp_participation` carries no `play_type`, so pass plays must come from the
play-by-play. That is a second large download per season, so the participation-
only alternatives were tested on 2024 against the true 20,007 pass plays:

    number_of_pass_rushers > 0   precision 0.892   recall 0.988
    time_to_throw notna          precision 0.941   recall 0.928
    was_pressure notna           precision 0.436   recall 1.000
    ngs_air_yards notna          precision 0.000   recall 0.000   (column empty)

The best is a **12% inflation** of the route denominator. A denominator inflated
by a tenth makes every efficiency number quietly wrong and nothing downstream
would notice, so the join is not optional. Measured join rate on 2024: **100%**.

── POSITION COMES FROM THE ROSTER, NOT THE FILE ──────────────────────────────

`offense_positions` exists for 2023-2025 (26 columns) and NOT for 2021-2022
(20 columns) — the participation schema changed mid-history. Branching on that
would run two code paths over two populations and call the result one dataset.
So position comes from the weekly data for every season instead. See
`positions_for`.

(The file's own column WAS checked and is index-aligned with `offense_players`
despite arriving alphabetically sorted — 0 mismatches on 2024. It is unused
anyway; a fact that must be re-verified per season is a fact waiting to be
wrong.)

── SEASON COVERAGE: 2021-2024, AND 2025 IS BLOCKED FOR A FAMILIAR REASON ─────

2025 raises `NotPublished` — nflverse serves no weekly data for it, which is the
SAME 404 that leaves the season ungradeable in the backtest. One gap, two
consequences. See draft/audit/pbp_rebuild_2pt_gap_2026-08-17.md.

Run:
    python3 draft/backtest/fetch_routes.py --check
    python3 draft/backtest/fetch_routes.py --seasons 2021 2022 2023 2024 2025
"""
from __future__ import annotations

import argparse
import io
import json
import sys
import urllib.error
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
SEASONS = (2021, 2022, 2023, 2024, 2025)
PART_URL = ("https://github.com/nflverse/nflverse-data/releases/download/"
            "pbp_participation/pbp_participation_{season}.csv")
UA = {"User-Agent": "maga-league/1.0"}

#: Positions counted as running a route. QB is excluded deliberately — a
#: quarterback on a pass play is throwing it, not running a route, and including
#: him would put a 600-"route" QB at the top of every list.
ROUTE_POSITIONS = ("WR", "TE", "RB", "FB")

#: Below this share of participation rows joining to a play type, the season is
#: REFUSED rather than written. A partial join silently shrinks the denominator
#: for whichever players happen to be in the unjoined plays.
MIN_JOIN_RATE = 0.95

#: A player-week needs this many routes before a target-per-route-run means
#: anything. TPRR off three routes is a ratio of two small integers.
MIN_ROUTES_FOR_TPRR = 10


class NotPublished(Exception):
    """nflverse has no participation file for this season YET — distinct from a
    broken fetch, and green for a job scheduled ahead of the season."""


def _get(url: str, timeout: int = 600) -> str:
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers=UA),
                                    timeout=timeout) as r:
            return r.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        if e.code == 404:
            raise NotPublished(f"no participation file for that season") from e
        raise


def load_participation(season: int):
    import pandas as pd
    return pd.read_csv(io.StringIO(_get(PART_URL.format(season=season))),
                       low_memory=False)


def load_pbp(season: int):
    import nfl_data_py as nfl
    return nfl.import_pbp_data([season], downcast=True)


def positions_for(season: int, pbp=None) -> dict:
    """{gsis_id: position} for the season, from the WEEKLY DATA, not the file.

    WHY NOT `offense_positions`, WHICH THE FILE SOMETIMES HAS. It exists for
    2023-2025 (26 columns) and NOT for 2021-2022 (20 columns) — the participation
    schema changed. Branching on that would run two different code paths over two
    different populations and call the result one dataset, which is the shape of
    error this repo keeps finding.

    So position comes from one source for every season. It also removes the
    alignment question entirely: `offense_positions` arrives sorted
    alphabetically, and although it WAS verified index-aligned with
    `offense_players` on 2024, a fact that has to be re-verified per season is a
    fact waiting to be wrong.
    """
    import nfl_data_py as nfl
    try:
        wk = nfl.import_weekly_data([season], downcast=True)
    except urllib.error.HTTPError as e:
        if e.code == 404:
            # THE SAME 404 THAT BLOCKS 2025 GRADING, arriving here. nflverse
            # serves no weekly data for 2025, which is why the backtest cannot
            # grade it and why routes cannot be built for it either. Reported as
            # NotPublished rather than crashing, because "the source has not
            # published this season" is an expected state, not a bug — and
            # because a season that dies here should not take the other four
            # with it.
            raise NotPublished(
                f"no weekly data for {season} — the same gap that leaves the "
                "season ungradeable (draft/audit/pbp_rebuild_2pt_gap_2026-08-17.md)"
            ) from e
        raise
    out = {}
    for pid, pos in zip(wk["player_id"], wk["position"]):
        if isinstance(pid, str) and pid and isinstance(pos, str):
            out[pid] = pos
    return out


def build_season(season: int, crosswalk: dict, part=None, pbp=None,
                 positions=None) -> dict:
    """{week: {sleeper_id: {routes, targets, tprr}}} plus join accounting."""
    part = load_participation(season) if part is None else part
    pbp = load_pbp(season) if pbp is None else pbp
    positions = positions_for(season) if positions is None else positions

    key = lambda g, p: f"{g}_{int(p)}"
    ptype, pweek, ptarget = {}, {}, {}
    for g, p, t, w, rec in zip(pbp["game_id"], pbp["play_id"], pbp["play_type"],
                               pbp["week"], pbp.get("receiver_player_id")):
        k = key(g, p)
        ptype[k] = t
        pweek[k] = w
        if rec == rec and rec:
            ptarget[k] = str(rec)

    weeks: dict = {}
    joined = unjoined = 0
    no_position = set()
    for g, p, ids in zip(part["nflverse_game_id"], part["play_id"],
                         part["offense_players"].fillna("")):
        k = key(g, p)
        t = ptype.get(k)
        if t is None:
            unjoined += 1
            continue
        joined += 1
        if t != "pass" or not ids:
            continue
        wk = weeks.setdefault(int(pweek.get(k) or 0), {})
        tgt = ptarget.get(k)
        for gsis in str(ids).split(";"):
            pos = positions.get(gsis)
            if pos is None:
                # ABSENT, NOT GUESSED. A player with no weekly row has no
                # position we can assert; counting him as a route-runner would
                # invent a denominator, and counting him as not one would be an
                # equally unsupported claim. He is recorded and skipped.
                no_position.add(gsis)
                continue
            if pos not in ROUTE_POSITIONS:
                continue
            sid = crosswalk.get(gsis)
            if not sid:
                continue
            row = wk.setdefault(sid, {"routes": 0, "targets": 0})
            row["routes"] += 1
            if tgt == gsis:
                row["targets"] += 1
    for wk in weeks.values():
        for row in wk.values():
            row["tprr"] = (round(row["targets"] / row["routes"], 4)
                           if row["routes"] >= MIN_ROUTES_FOR_TPRR else None)
    total = joined + unjoined
    return {"season": season, "weeks": weeks,
            "join": {"participation_rows": total, "joined_to_pbp": joined,
                     "unjoined": unjoined,
                     "join_rate": round(joined / total, 4) if total else 0.0,
                     "on_field_without_a_position": len(no_position)}}


def crosswalk() -> dict:
    """gsis -> sleeper, the same single hop `fetch_snap_counts` needs for its
    second leg. participation keys on gsis, so there is no pfr hop here."""
    import nfl_data_py as nfl
    out = {}
    for _i, r in nfl.import_ids().iterrows():
        g, s = r.get("gsis_id"), r.get("sleeper_id")
        if isinstance(g, str) and g and s == s and s is not None:
            out[g] = str(int(s)) if not isinstance(s, str) else s
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--seasons", nargs="*", type=int, default=list(SEASONS))
    ap.add_argument("--check", action="store_true", help="report, write nothing")
    args = ap.parse_args()

    print("building the gsis -> sleeper crosswalk ...")
    cw = crosswalk()
    print(f"  {len(cw)} ids")

    ok = True
    for season in args.seasons:
        try:
            doc = build_season(season, cw)
        except NotPublished as e:
            print(f"{season}: {e} — nothing to write yet (expected before week 1)")
            continue
        j = doc["join"]
        players = {sid for wk in doc["weeks"].values() for sid in wk}
        print(f"{season}: join {j['join_rate']:.1%} "
              f"({j['joined_to_pbp']}/{j['participation_rows']}), "
              f"{len(doc['weeks'])} weeks, {len(players)} players with routes")
        if j["join_rate"] < MIN_JOIN_RATE:
            print(f"   REFUSING {season}: join below {MIN_JOIN_RATE:.0%} — a partial "
                  "join shrinks the denominator silently", file=sys.stderr)
            ok = False
            continue
        doc["_note"] = (
            "ROUTES RUN IS A PROXY AND AN UPPER BOUND: every skill player on the "
            "field for a PASS play is counted, so a blocking TE or back is "
            "included. nflverse publishes no true routes feed. `tprr` is "
            "targets/routes and is None below "
            f"{MIN_ROUTES_FOR_TPRR} routes, because a ratio of two small "
            "integers is not an efficiency. QBs are excluded by design.")
        if not args.check:
            (HERE / f"routes_{season}.json").write_text(json.dumps(doc, indent=1))
            print(f"   wrote routes_{season}.json")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
