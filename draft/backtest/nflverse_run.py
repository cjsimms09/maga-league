#!/usr/bin/env python3
# TERRITORY: C
"""FETCH AND VERIFY THE nflverse ASSETS — the reachable half of a regeneration.

⚠ IT DOES NOT REGENERATE THE ARTIFACTS YET, AND THE FIRST DRAFT OF THIS DOCSTRING
SAID IT DID. That is the defect this repo keeps finding — a comment promising
behaviour the body does not have — caught here before it was believed, and the
honest version is below. `main()` resolves each measurement's assets, fetches
them, and reports what came back; computing the three artifacts from them is the
next step and is NOT written.

`nflverse_pace.json`, `nflverse_durability.json` and
`projection_spread_vs_realized.json` were all produced on 2026-08-14 by commands
typed into a shell. The numbers are real and the pure functions behind them are
tested, but **nobody else could reproduce them**, and the routing that carried them
said as much: *"Regeneration needs egress, so the artifact cannot be
regenerate-and-compared the way `waiver_replacement.json` is."*

This closes the FIRST half of that: which assets each measurement reads is now
declared and checkable instead of remembered. It also gives `nflverse_release` a caller, which it did not
have — a module written to hold the release names, with nothing exercising them,
is the same rule-14 gap it was written in response to, one turn later.

⚠ THE SPLIT IS THE USUAL ONE. Everything that decides anything already lives in
`nflverse_pace`, `nflverse_durability`, `nflverse_variance` and `projection_error`
and is unit-tested there. What lives HERE is the plumbing that could not be tested
before it existed: which asset each measurement reads, and what happens when one of
them is not there.

⚠ AND THE FAILURE PATH IS THE POINT, NOT AN AFTERTHOUGHT. `import_weekly_data`
404ing for 2025 was read by two lanes as "the season is unpublished" for a
fortnight. Every fetch here reports through `nflverse_release.describe_failure`, so
a 404 says which asset WE asked for and a 403 says the route is wrong — because
those mean opposite things and the difference is what cost the fortnight.
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
if str(HERE) not in sys.path:
    sys.path.insert(0, str(HERE))

import nflverse_release as REL  # noqa: E402

#: Which asset each measurement reads, declared rather than remembered. A
#: measurement whose source is only in somebody's shell history is a measurement
#: nobody can check.
NEEDS = {
    "pace": [("pbp", True)],
    "durability": [("weekly_rosters", True)],
    # The spread work needs BOTH: availability from the roster (was he there) and
    # points from the stats file (what did he do). Reading availability from the
    # stats file is the exact mistake that cost 39.4% of active QB weeks.
    "spread": [("weekly_rosters", True), ("weekly_stats", True)],
}

#: The seasons every 2026 measurement may use. STRICTLY BEFORE the drafted season,
#: the rule `team_pace`, `durability` and `weekly_variance` each enforce for
#: themselves — declared here too so a caller cannot quietly widen it.
SEASONS = (2023, 2024, 2025)
DRAFTED_SEASON = 2026


#: How far a regenerated value may sit from the committed one and still count as
#: the same number. Committed artifacts store ROUNDED values, so an exact
#: comparison fails on arithmetic rather than on drift — a mistake I made twice on
#: 2026-08-14 before writing this down. Absolute, and reported in the result so a
#: reader never has to guess what "ok" meant.
COMPARE_TOLERANCE = 0.01


def compare_rows(fresh: dict, committed: dict, fields, tol: float = COMPARE_TOLERANCE) -> dict:
    """Regenerate-and-compare, as a value. -> {ok, compared, differences, tolerance}.

    THE HALF THAT CAN BE TESTED. Fetching needs egress; deciding whether two
    derivations agree does not, and it is where the interesting mistakes live.

    A ROW ON ONE SIDE ONLY IS A DIFFERENCE, NOT A SKIP. Population drift is the
    failure that hides: a player who appears or vanishes changes every summary
    computed over the set, and comparing only the overlap reports agreement while
    the denominators moved. That is exactly what a silent upstream revision looks
    like.

    AND A DIFFERENCE IS NAMED WITH BOTH VALUES. "They differ" is a verdict nobody
    can act on — the same complaint this lane made about `integrate.sh` discarding
    the output of the suite it refused on. An upstream revision and a bug in our
    own derivation are opposite problems and the two numbers are what tells them
    apart.
    """
    diffs = []
    for key in sorted(set(fresh or {}) | set(committed or {})):
        a, b = (fresh or {}).get(key), (committed or {}).get(key)
        if a is None or b is None:
            diffs.append({"key": key, "field": "__present__",
                          "fresh": a is not None, "committed": b is not None,
                          "note": "present on one side only — the population "
                                  "moved, which changes every summary over it"})
            continue
        for f in fields:
            x, y = a.get(f), b.get(f)
            if x is None and y is None:
                continue
            if x is None or y is None or abs(float(x) - float(y)) > float(tol):
                diffs.append({"key": key, "field": f, "fresh": x, "committed": y})
    return {"ok": not diffs, "compared": len(set(fresh or {}) & set(committed or {})),
            "differences": diffs, "tolerance": float(tol)}


def plan(measurement: str, seasons=SEASONS) -> list:
    """Which URLs one measurement needs. -> [(kind, season, url), ...].

    PURE, SO THE PLUMBING IS CHECKABLE WITHOUT EGRESS. The thing that goes wrong
    here is asking for the wrong asset, and that is decidable on a string.
    """
    if measurement not in NEEDS:
        raise ValueError(
            "%r is not a measurement this runner knows. Known: %s. Refusing to "
            "guess an asset list — a measurement reading the wrong file produces "
            "a number rather than an error." % (measurement, sorted(NEEDS)))
    bad = [s for s in seasons if int(s) >= DRAFTED_SEASON]
    if bad:
        raise ValueError(
            "season(s) %s are not strictly before %d — every one of these "
            "measurements is a PRIOR, and a prior taken from the season being "
            "drafted is an outcome." % (bad, DRAFTED_SEASON))
    out = []
    for kind, per_season in NEEDS[measurement]:
        if per_season:
            out.extend((kind, int(s), REL.asset_url(kind, int(s))) for s in seasons)
        else:
            out.append((kind, None, REL.asset_url(kind)))
    return out


def fetch(url: str, kind: str, season, timeout: int = 120):  # pragma: no cover
    """Bytes, or a RuntimeError whose message says what WE asked for.

    The whole reason this wrapper exists rather than a bare urlopen: a 404 here
    must never reach the caller as "no data". `describe_failure` names the release
    and the file, and gives a 403 a different sentence, because a naming failure
    and a routing failure point in opposite directions.
    """
    import urllib.error
    import urllib.request

    req = urllib.request.Request(url, headers={"User-Agent": REL.USER_AGENT})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.read()
    except urllib.error.HTTPError as e:
        raise RuntimeError(REL.describe_failure(kind, season, e.code)) from e
    except Exception as e:                               # noqa: BLE001
        raise RuntimeError(
            "nflverse fetch of %s failed before any status came back (%s: %s) — "
            "that is a fact about the connection, not about the data."
            % (url, type(e).__name__, e)) from e


def verify(kind: str, tol: float = COMPARE_TOLERANCE) -> dict:  # pragma: no cover
    """Re-derive one artifact from its recorded assets and diff it. -> compare_rows.

    THIS IS THE THING THE ROUTING SAID WAS MISSING: *"Regeneration needs egress,
    so the artifact cannot be regenerate-and-compared the way
    `waiver_replacement.json` is."* It can now, where the assets are reachable.

    It does NOT rewrite the artifact. A verifier that repairs what it finds cannot
    tell you the artifact was wrong — it just makes it right and says nothing,
    which is how a silent upstream revision becomes invisible.
    """
    import json as _json

    import pandas as pd
    import pyarrow.parquet as pq

    here = HERE
    assets = _json.loads((here / ("nflverse_%s.json" % kind)).read_text())["_provenance"]["assets"]
    local = {k: (Path(a["url"]).name) for k, a in assets.items()}

    def frames(prefix, cols=None):
        out = []
        for key in sorted(k for k in assets if k.startswith(prefix + "/")):
            p = Path(os.environ.get("NFLVERSE_CACHE", "/tmp")) / local[key]
            if not p.exists():
                raise RuntimeError(
                    "asset %s is not cached at %s. `verify` compares against the "
                    "EXACT files the artifact records; it does not refetch, "
                    "because a refetch that silently picked up a revision would "
                    "report agreement with a different world." % (key, p))
            out.append(pq.read_table(p, columns=cols).to_pandas())
        return pd.concat(out, ignore_index=True)

    if kind == "pace":
        import nflverse_pace as NP
        cols = ["season", "game_id", "posteam", "play_type", "qb_kneel", "qb_spike",
                "score_differential"]
        art = _json.loads((here / "nflverse_pace.json").read_text())
        seasons = art["seasons"]
        fresh, _rep = NP.team_pace(frames("pbp", cols), seasons, before_season=2026)
        fields = ("plays", "games", "plays_per_game", "neutral_plays_per_game",
                  "neutral_share", "pass_rate", "neutral_pass_rate")
        return compare_rows(fresh, art["teams"], fields, tol=tol)
    if kind == "durability":
        import grade as GR
        import nflverse_durability as ND
        art = _json.loads((here / "nflverse_durability.json").read_text())
        ids_path = Path(os.environ.get("NFLVERSE_CACHE", "/tmp")) / \
            Path(assets["player_ids"]["url"]).name
        if not ids_path.exists():
            raise RuntimeError(
                "the id crosswalk is not cached at %s. Same rule as the parquet "
                "assets: `verify` compares against the exact file the artifact "
                "records rather than refetching one that may have moved."
                % ids_path)
        cw = GR.crosswalk_gsis_to_sleeper(
            [], ids_df=pd.read_csv(ids_path, low_memory=False))
        # ROSTER STATUS, exactly as the artifact's `_source` declares: ACT is the
        # availability record. Re-deriving from the stats file instead would
        # "verify" a different measurement and report agreement with it.
        rw = frames("weekly_rosters",
                    ["season", "week", "gsis_id", "status", "team", "position"])
        rw = rw[rw["status"] == "ACT"].rename(columns={"gsis_id": "player_id"})
        out, _ = ND.durability(rw, art["seasons"], cw, before_season=2026)
        board = _json.loads((here.parent.parent / "public" / "draft_data.json").read_text())
        fresh = {}
        for p in board.get("players") or []:
            sid = str(p.get("player_id"))
            gs = list((out.get(sid) or {}).get("games", {}).values())
            if p.get("adp") is None or float(p["adp"]) > 150 or len(gs) < 1:
                continue
            fresh[sid] = {"mean_games": round(sum(gs) / len(gs), 2),
                          "seasons": len(gs)}
        return compare_rows(fresh, art["players"], ("mean_games", "seasons"), tol=tol)

    raise ValueError("verify(%r) is not implemented. Known: pace, durability. The "
                     "spread artifact is deliberately absent — it depends on the "
                     "scoring mapper as well as the roster, and the fumble gap "
                     "parked for A sits inside that path, so a green verify would "
                     "confirm a derivation that is known to be missing 14%% of "
                     "fumbles." % kind)


def main(argv=None):  # pragma: no cover  (egress, CI only)
    import argparse

    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--measurement", default="all",
                    choices=["all", *sorted(NEEDS)])
    ap.add_argument("--dry-run", action="store_true",
                    help="print the asset plan and fetch nothing")
    ap.add_argument("--verify", metavar="KIND",
                    help="re-derive an artifact from its RECORDED assets and diff "
                         "it; does not refetch and does not rewrite")
    a = ap.parse_args(argv)
    if a.verify:
        r = verify(a.verify)
        print("verify %s: %s — %d row(s) compared, %d difference(s), tol %s"
              % (a.verify, "OK" if r["ok"] else "DIFFERS", r["compared"],
                 len(r["differences"]), r["tolerance"]))
        for d in r["differences"][:10]:
            print("   ", d)
        return 0 if r["ok"] else 1
    wanted = sorted(NEEDS) if a.measurement == "all" else [a.measurement]

    for m in wanted:
        print("== %s" % m)
        for kind, season, url in plan(m):
            if a.dry_run:
                print("   %-15s %s  %s" % (kind, season, url))
                continue
            try:
                body = fetch(url, kind, season)
                print("   %-15s %s  %.1f MB" % (kind, season, len(body) / 1e6))
            except RuntimeError as e:
                # NAMED AND SURVIVED. One missing season must not cost the others,
                # and the message already says whether it is our URL or our route.
                print("   %-15s %s  FAILED — %s" % (kind, season, e))
    if a.dry_run:
        print("\nDRY RUN — nothing fetched. The plan is the checkable part; the "
              "measurements themselves live in their own modules and are tested "
              "there.")
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
