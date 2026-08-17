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

── SEASON COVERAGE: 2021-2025. 2025 WAS NEVER BLOCKED UPSTREAM. ──────────────

This header said "2025 raises NotPublished — nflverse serves no weekly data for
it". Checked on 2026-08-17 instead of repeated: the 2025 participation file is
served, 49MB, HTTP 200. What 404s is `import_weekly_data`, which this file used
only to look up POSITIONS. **A gap of ours was recorded as a gap of theirs**,
and the season sat absent for a reason nobody re-tested.

Fixed by taking positions from `seasonal_rosters`, which covers all five seasons
— and which turns out to be the better source everywhere, not merely the one
that works for 2025. See `positions_for` for the measurement.

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


#: What `positions_for` reads. Stamped into every season file so a consumer can
#: tell which population a routes count was taken over, without dating the file.
POSITION_SOURCE = "nflverse seasonal_rosters"


def positions_for(season: int, pbp=None) -> dict:
    """{gsis_id: position} for the season, from the SEASONAL ROSTERS.

    WHY NOT `offense_positions`, WHICH THE FILE SOMETIMES HAS. It exists for
    2023-2025 (26 columns) and NOT for 2021-2022 (20 columns) — the participation
    schema changed. Branching on that would run two different code paths over two
    different populations and call the result one dataset, which is the shape of
    error this repo keeps finding. It also arrives sorted alphabetically, and
    although it WAS verified index-aligned with `offense_players` on 2024, a fact
    that has to be re-verified per season is a fact waiting to be wrong.

    That reasoning stands. WHAT CHANGED ON 2026-08-17 IS WHICH SINGLE SOURCE.

    This read `import_weekly_data`, which has a stat line only for players who
    RECORDED something. Measured on 2024: of the 1,708 distinct players who
    actually appear on the field in the participation file, that source can
    classify **611 and leaves 1,097 unknown**, and it finds **494** route
    positions where the roster finds **550**. So 57 real route-runners per season
    were being dropped — not mis-classified, dropped — and every one of them was
    a skill player who was on the field for pass plays and never recorded a
    counting stat. That is precisely the population a ROUTES metric exists to
    see: the blocking tight end, the decoy, the man who ran twenty routes for
    zero targets.

    `import_seasonal_rosters` covers all five seasons (2,960 / 3,133 / 3,089 /
    3,215 / 3,134 rows, 100% with a usable position) and leaves **zero** on-field
    players unclassified on 2024. It is the same single source for every season,
    so the docstring's own principle is better served, not abandoned.

    THE DISAGREEMENTS ARE ALMOST ALL INERT. Where both sources classify the same
    player, they differ on 40 of 612 (6.5%) on 2024, of which 11 involve a route
    position, and 10 of those 11 are FB<->RB — both in ROUTE_POSITIONS, so who
    counts as running a route does not move. Exactly one player (00-0038489)
    changes inclusion, FB under weekly and LB under the roster.

    AND IT UNBLOCKED 2025, WHICH WAS NEVER ACTUALLY BLOCKED UPSTREAM. This
    function's 404 was written up as "nflverse serves no data for 2025". The
    participation file for 2025 is served, 49MB, HTTP 200 — it was the POSITION
    lookup that 404'd, and a gap of ours was recorded as a gap of theirs.
    """
    import nfl_data_py as nfl
    try:
        ro = nfl.import_seasonal_rosters([season])
    except urllib.error.HTTPError as e:
        if e.code == 404:
            # A season nflverse has genuinely not published YET is an expected
            # state, not a bug, and must not take the other seasons down with
            # it. Kept from the original: only the SOURCE changed, not the
            # discipline about absence.
            raise NotPublished(f"no seasonal roster for {season}") from e
        raise
    out = {}
    for pid, pos in zip(ro["player_id"], ro["position"]):
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
                # ABSENT, NOT GUESSED. A player with no roster row has no
                # position we can assert; counting him as a route-runner would
                # invent a denominator, and counting him as not one would be an
                # equally unsupported claim. He is recorded and skipped.
                #
                # This set used to be large and was read as unavoidable. It was
                # not: under the weekly-stats source it held 1,097 of the 1,708
                # players on the field in 2024, because that source only knows
                # players who recorded a stat. Under the roster source it is
                # empty. A number that looks like an inherent limit is worth
                # measuring against a second source before believing it.
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
            "position_source": POSITION_SOURCE,
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
