#!/usr/bin/env python3
# TERRITORY: C
"""WHERE THE nflverse DATA ACTUALLY IS — the release names, verified, in one place.

WHY THIS EXISTS, STATED AS THE FAILURE IT ENDS. `nfl_data_py.import_weekly_data(2025)`
404s. Both A and I recorded that as *"2025 is not published"* — the season closest
to the board — and worked around it for a fortnight: A's durability request was
answered on 2023+2024 only, and my variance work had the same hole.

**It was published the whole time.** The nflverse release is named `stats_player`;
`nfl_data_py` asks for `player_stats`. `stats_player_week_2025.parquet` is 855KB and
fetched in under a second on 2026-08-14, as did the 2025 weekly rosters and the 2025
play-by-play.

That is this repo's recurring defect one layer below where it usually lands — a
consumer reading a name its author believed in — and it fails in the worst possible
direction, because **a 404 is indistinguishable from "no such data" unless something
says which name was asked for.** A missing season is a fact about the world. A
missing asset is a fact about our URL. This module keeps them apart.

⚠ IT FETCHES NOTHING AND DECIDES NOTHING. Building a URL and describing a failure
are pure, so they can be tested; the download is the caller's, because a module that
reaches the network cannot be exercised where it matters.

VERIFIED BY HTTP HEAD ON 2026-08-14, and the failures are recorded beside the
successes because a probe that lists only its hits is not evidence:

    200  stats_player/stats_player_week_2025.parquet     855,077 bytes
    200  weekly_rosters/roster_weekly_2025.parquet       850,871
    200  rosters/roster_2025.parquet                     585,103
    200  players/players.parquet                       3,403,846
    200  pbp/play_by_play_2025.parquet              ~20,300,000
    404  player_stats/player_stats_2025.parquet     <- what nfl_data_py asks for
    404  player_stats/stats_player_week_2025.parquet
    404  weekly/weekly_2025.parquet
"""
from __future__ import annotations

BASE = "https://github.com/nflverse/nflverse-data/releases/download"

#: kind -> (release, filename template, takes_a_season). NOTHING IS CONSTRUCTED
#: FROM A PATTERN — every entry here was confirmed with a HEAD request, and the
#: whole point of the module is that an unverified name must not become a URL.
RELEASES = {
    # ⚠ `stats_player`, NOT `player_stats`. See the module docstring; this exact
    # transposition cost two lanes the 2025 season.
    "weekly_stats":   ("stats_player",   "stats_player_week_%d.parquet", True),
    "weekly_rosters": ("weekly_rosters", "roster_weekly_%d.parquet",     True),
    "rosters":        ("rosters",        "roster_%d.parquet",            True),
    "pbp":            ("pbp",            "play_by_play_%d.parquet",      True),
    "players":        ("players",        "players.parquet",              False),
}

#: gsis id -> sleeper id, which nflverse's own `players.parquet` does NOT carry.
#: This is the file `nfl_data_py.import_ids()` reads, and `grade.crosswalk_gsis_to_sleeper`
#: already accepts it as `ids_df`.
#:
#: ⚠ raw.githubusercontent.com, NOT github.com. Measured 2026-08-14: the
#: `github.com/.../raw/...` form returns **403** through this environment's proxy
#: while the raw host returns 200 for the identical file. A 403 reads as "we are
#: not permitted this data" when it means "wrong host", and that is the same
#: confusion as the 404 above wearing a different number.
PLAYER_IDS_URL = ("https://raw.githubusercontent.com/dynastyprocess/data/master/"
                  "files/db_playerids.csv")


def asset_url(kind: str, season: int = None) -> str:
    """The verified URL for one asset. Raises rather than guessing.

    REFUSES AN UNKNOWN KIND BY NAME. Falling back to a constructed pattern would
    hand the caller a plausible URL, the provider would 404 it, and the conclusion
    would be "nflverse does not publish that" — a claim about the world made from
    a guess about a string. That is precisely how 2025 went missing.
    """
    if kind not in RELEASES:
        raise ValueError(
            "%r is not a verified release asset. Known kinds: %s. Add one only "
            "after confirming it with a real request — a guessed release name "
            "404s, and a 404 reads as missing DATA rather than a missing URL."
            % (kind, sorted(RELEASES)))
    release, template, needs_season = RELEASES[kind]
    if needs_season and season is None:
        raise ValueError("%r needs a season" % kind)
    if not needs_season and season is not None:
        raise ValueError(
            "%r takes no season — it is a single file covering every player. "
            "Formatting a year in would build a URL that 404s." % kind)
    name = template % int(season) if needs_season else template
    return "%s/%s/%s" % (BASE, release, name)


def describe_failure(kind: str, season, status) -> str:
    """Turn a status code into a sentence that names what WE asked for.

    THIS IS THE WHOLE MODULE. The next person to see a 404 here must read "we
    asked for stats_player/stats_player_week_2025.parquet and it was not there",
    not "2025 is unavailable" — because the second sentence is a conclusion about
    nflverse drawn from a fact about us, and it survived a fortnight last time.

    A 403 IS A DIFFERENT FACT and gets a different sentence. Folding them together
    is the same collapse one level up: one means the name is wrong, the other means
    the route is.
    """
    try:
        release, template, needs = RELEASES[kind]
        asked = "%s/%s" % (release, (template % int(season)) if needs else template)
    except Exception:                                   # noqa: BLE001
        asked = "an UNKNOWN kind %r" % kind
    if int(status) == 404:
        return ("nflverse returned 404 for %s. That is a statement about OUR URL "
                "before it is a statement about the data: check the release name "
                "against nflverse_release.RELEASES before concluding the season "
                "is unpublished. `nfl_data_py` asks for `player_stats` and the "
                "release is `stats_player`, which hid the whole of %s once already."
                % (asked, season))
    if int(status) == 403:
        return ("nflverse returned 403 for %s — a ROUTE problem, not a naming one. "
                "The agent proxy 403s `github.com/.../raw/...` while "
                "`raw.githubusercontent.com` serves the identical file; check the "
                "host before concluding the asset is restricted." % asked)
    return ("nflverse returned %s for %s — neither a naming nor a routing failure "
            "this module knows about. Record what was asked for rather than "
            "reporting the data as absent." % (status, asked))
