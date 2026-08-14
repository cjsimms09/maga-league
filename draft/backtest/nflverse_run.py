#!/usr/bin/env python3
# TERRITORY: C
"""REGENERATE THE nflverse MEASUREMENTS — the runner today's artifacts did not have.

`nflverse_pace.json`, `nflverse_durability.json` and
`projection_spread_vs_realized.json` were all produced on 2026-08-14 by commands
typed into a shell. The numbers are real and the pure functions behind them are
tested, but **nobody else could reproduce them**, and the routing that carried them
said as much: *"Regeneration needs egress, so the artifact cannot be
regenerate-and-compared the way `waiver_replacement.json` is."*

This is that runner. It also gives `nflverse_release` a caller, which it did not
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


def main(argv=None):  # pragma: no cover  (egress, CI only)
    import argparse

    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--measurement", default="all",
                    choices=["all", *sorted(NEEDS)])
    ap.add_argument("--dry-run", action="store_true",
                    help="print the asset plan and fetch nothing")
    a = ap.parse_args(argv)
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
