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

#: The header this repo sends everywhere. Declared here rather than at each call
#: site for the same reason `external_adp_capture` declares it: FFC 403s Python's
#: default, and a fetcher that quietly uses a different one is a second identity
#: nobody chose. Kept in step by test, not by trust.
USER_AGENT = "mfga-league-draft-tool/1.0"

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

#: kind -> the DATA FAMILY it belongs to. Two kinds sharing a family are rival
#: NAMES FOR THE SAME DATA, and only those may stand in for one another when
#: `diagnose_missing` asks "is this season served under some other name?".
#:
#: ⚠ WITHOUT THIS THE CROSS-NAME CHECK IS ACTIVELY WRONG, measured live
#: 2026-08-17: asked for `pbp/play_by_play_2026.parquet` (404, the season has
#: not been played), the check found `rosters/roster_2026.parquet` served — 2026
#: rosters exist months before a snap — and concluded the play-by-play "was
#: there the whole time". A roster is not play-by-play. Any kind that merely
#: takes a season will collide like this, so sharing a season argument is not
#: evidence of carrying the same data.
#:
#: Every kind is presently alone in its family, so the check finds nothing and
#: the verdict falls to `ambiguous`. That is the correct answer, not a gap: it
#: earns its place the moment a rename is registered beside the name it
#: replaced, which is the one case where "served elsewhere" is provable here.
FAMILY = {
    "weekly_stats":   "weekly_stats",
    "weekly_rosters": "weekly_rosters",
    "rosters":        "rosters",
    "pbp":            "pbp",
    "players":        "players",
}


def family(kind: str) -> str:
    """A kind's data family, defaulting to ITSELF. An unregistered kind is its
    own family, so it can never be answered by an unrelated asset."""
    return FAMILY.get(kind, kind)


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


#: The CONTROL season for `diagnose_missing`: one whose data is certainly
#: published, so a 404 on it can only mean the URL is wrong.
#:
#: ⚠ DECLARED, NOT DERIVED, and deliberately not "the latest complete season".
#: Computing it from today's date would make the control drift onto the very
#: season most likely to be mid-publication — the one case where a 404 is
#: ambiguous — which is the failure this constant exists to remove. 2023 is
#: finished, long served, and will not become unpublished.
CONTROL_SEASON = 2023


def diagnose_missing(kind, season, probe, *, control_season=CONTROL_SEASON,
                     season_played_through=None) -> dict:
    """Did upstream not publish it, or did WE ask wrong? Actually check.

    ⚠ READ THIS BEFORE USING THE VERDICT. A 404 plus a working control does NOT
    establish "not published", and the first version of this function said it
    did. Measured 2026-08-17 against the real host, on the exact case the
    module exists for:

        player_stats/player_stats_2025.parquet   404   <- what nfl_data_py asks
        player_stats/player_stats_2023.parquet   200   <- control PASSES
        player_stats/player_stats_2024.parquet   200
        stats_player/stats_player_week_2025.parquet  200  <- served all along

    nflverse renamed the release and **left the old one in place**, frozen after
    2024. So the dead name still serves every season up to the rename, the
    control comes back 200, and the honest-looking conclusion is exactly the
    wrong one — `not_published` for a season that was served the whole time.
    That is not a hypothetical: it is the fortnight in the module docstring,
    reproduced by the checker written to prevent it.

    It also explains why the original story was so credible. Four seasons
    worked and one 404'd. That is what a season not being out yet looks like.

    SO THE TEMPLATE CONTROL IS NECESSARY AND NOT SUFFICIENT. It proves the
    template works FOR THAT SEASON; it cannot prove the template is the CURRENT
    name, and a frozen release defeats it at every control season — 2024
    included, because the freeze is one season back. No amount of probing that
    one template separates "renamed" from "unpublished".

    WHAT ACTUALLY SEPARATES THEM is not a probe at all: a season that has not
    been played cannot have been published. `season_played_through` is the
    caller stating the last season whose data should exist. Without it this
    function will NEVER say `not_published`, because absent that fact it cannot
    honestly say it — and defaulting the other way is the whole defect.

    ⚠ THIS IS THE CHECK `describe_failure` ONLY DESCRIBES. That function ends
    "check the release name against RELEASES before concluding the season is
    unpublished" — advice, addressed to a human, and the record shows what
    advice is worth here: the same sentence was available for the fortnight
    2025 spent filed as unpublished, and for however long `nflverse_pace.py`
    said the pbp pull was egress-blocked. A note telling someone to verify is
    not a verification, and both of those notes were plausible and written
    down, which is precisely why nobody re-ran them.

    HOW IT DISCRIMINATES: re-probe the SAME URL TEMPLATE at a season that is
    certainly published. If `pbp/play_by_play_2023.parquet` is served and
    `pbp/play_by_play_2026.parquet` is not, the template works and the season
    genuinely is not there. If the control 404s too, the template is broken and
    the original 404 was never evidence about nflverse at all.

    WHY THE TEMPLATE AND NOT A MANIFEST. Listing the release's assets would
    also answer this, and it would answer it about a DIFFERENT endpoint than
    the one that failed — a lookup that succeeds while our fetch path is broken
    proves nothing about our fetch path, and the API needs credentials the
    workflow may not have. The control walks the identical code path with one
    number changed, so it cannot pass for a reason the real fetch would not.

    `probe(url)` returns an HTTP status, or None if it could not ask.

    ⚠ AND AN UNREACHABLE CONTROL IS `unknown`, NEVER `not_published`. That
    branch is the entire point. Defaulting a failed control to "upstream does
    not have it" would take our own outage and write it into the record as a
    fact about theirs — the exact move that cost a season of routes.
    """
    try:
        url = asset_url(kind, season)
    except ValueError as e:
        # NOT A NETWORK FACT AT ALL. An unverified kind cannot 404 "because the
        # season is missing"; there was never a real URL to miss.
        return {"verdict": "we_asked_wrong", "kind": kind, "season": season,
                "asked": None, "control": None, "checked": False,
                "why": "the asset name was refused before any request was made: %s"
                       % e}

    status = probe(url)
    st = None if status is None else int(status)
    base = {"kind": kind, "season": season, "asked": url, "status": st,
            "control_season": int(control_season)}

    if st == 200:
        return dict(base, verdict="present", checked=False,
                    why="the asset is served; nothing is missing to explain.")
    if st == 403:
        return dict(base, verdict="route", checked=False,
                    why=describe_failure(kind, season, 403))
    if st != 404:
        return dict(base, verdict="unknown", checked=False,
                    why=describe_failure(kind, season, st))

    if int(season) == int(control_season):
        # A CONTROL THAT IS THE ASKED URL IS NOT A CONTROL. Probing it again
        # would return the same 404 and get read as "we asked wrong" — a
        # verdict manufactured by the test design rather than by evidence.
        return dict(base, verdict="unknown", checked=False,
                    why="the control season IS the season asked for, so the "
                        "probe would re-ask the same URL and could only agree "
                        "with itself. Pass a different control_season.")

    control_url = asset_url(kind, control_season)
    control = probe(control_url)
    cs = None if control is None else int(control)
    base = dict(base, control=control_url, control_status=cs, checked=True)

    if cs is None or cs not in (200, 404):
        return dict(base, verdict="unknown",
                    why="the control probe returned %s rather than a clean 200 "
                        "or 404, so nothing was discriminated. This is OUR "
                        "inability to ask, and it must not be recorded as "
                        "nflverse lacking the data." % cs)
    if cs == 404:
        return dict(base, verdict="we_asked_wrong",
                    why="the SAME template 404s at %s, which is certainly "
                        "published. The URL is wrong, so the original 404 is "
                        "no evidence that %s is unpublished. %s"
                        % (control_season, season,
                           describe_failure(kind, season, 404)))

    # The template serves the control season. Before that is allowed to mean
    # anything about nflverse, ask whether some OTHER verified name serves the
    # season we actually wanted — the renamed-release case, which is the one
    # that got past the first version of this check.
    for other in sorted(RELEASES):
        # SAME DATA FAMILY ONLY. See `FAMILY`: matching on "takes a season"
        # instead made 2026 rosters answer for 2026 play-by-play.
        if other == kind or family(other) != family(kind):
            continue
        try:
            alt = asset_url(other, season)
        except ValueError:
            continue
        if probe(alt) == 200:
            return dict(base, verdict="served_elsewhere", served_as=other,
                        served_url=alt,
                        why="%s is served for %s under the verified kind %r "
                            "while %r 404s. The data was there the whole time; "
                            "this is a fact about our name, and recording it as "
                            "unpublished is the exact error in the module "
                            "docstring." % (alt.rsplit("/", 1)[-1], season,
                                            other, kind))

    played = None if season_played_through is None else int(season_played_through)
    if played is not None and int(season) > played:
        # THE ONLY SOUND "not_published", and it does not come from a probe. A
        # season that has not been played cannot have been published, and that
        # is a fact about the calendar no renamed release can imitate.
        return dict(base, verdict="not_published",
                    season_played_through=played,
                    why="%s has not been played (the caller states data should "
                        "exist only through %s), so nflverse having nothing for "
                        "it is expected rather than a defect."
                        % (season, played))

    return dict(base, verdict="ambiguous", season_played_through=played,
                why="the template serves %s but 404s %s, and no other verified "
                    "kind serves %s either. This does NOT establish that "
                    "nflverse lacks it: a release that was renamed and left "
                    "frozen serves old seasons and 404s new ones, which is "
                    "indistinguishable from here — it is what `player_stats` "
                    "does right now. %s Resolve it by finding the current "
                    "release name, or by passing season_played_through if the "
                    "season simply has not happened."
                    % (control_season, season, season,
                       "The caller did not say which seasons should exist."
                       if played is None else
                       "%s IS within the played range (through %s), so 'not "
                       "published yet' is not available as an explanation."
                       % (season, played)))


def shortfall(got, expected, *, unit="week", label="") -> dict:
    """A fetch that came back SHORT: the count, and whether the shape excuses it.

    ⚠ THE SAME DISCRIMINATION ONE LEVEL DOWN. `diagnose_missing` separates a
    missing FILE that is theirs from one that is ours. This separates a missing
    part of a file the same way, because "we got fewer weeks than we asked for"
    is read as "the season is still running" by default and that reading is
    only sometimes true.

    THE SHAPE IS THE EVIDENCE. A publication schedule can only ever be missing
    a contiguous TAIL — upstream has not reached week 15 yet. It cannot produce
    a HOLE: weeks 1-4 and 6-18 present with 5 absent is not something a
    schedule does, so it is our join, our filter, or a real upstream defect,
    and in none of those cases may it be filed under "not published yet".

    `tail` therefore says CONSISTENT WITH an in-progress season, not "fine" — a
    truncated download also looks exactly like a tail, and this cannot tell
    them apart. It narrows the claim; it does not clear it.
    """
    want = sorted({int(x) for x in (expected or [])})
    have = {int(x) for x in (got or [])}
    missing = [x for x in want if x not in have]
    name = ("%s: " % label) if label else ""
    if not want:
        return {"verdict": "unknown", "n_expected": 0, "n_got": len(have),
                "n_missing": 0, "missing": [],
                "why": "%snothing was expected, so 'short' has no meaning here "
                       "— which is not the same as the fetch being complete."
                       % name}
    if not missing:
        return {"verdict": "complete", "n_expected": len(want),
                "n_got": len(have), "n_missing": 0, "missing": [],
                "why": "%sall %d %s(s) present." % (name, len(want), unit)}

    tail = want[len(want) - len(missing):]
    is_tail = missing == tail
    return {
        "verdict": "tail" if is_tail else "interior",
        "n_expected": len(want), "n_got": len(have),
        "n_missing": len(missing), "missing": missing,
        "first_missing": missing[0], "last_expected": want[-1],
        "why": ("%s%d of %d %s(s) missing (%s), and they are the last %d in "
                "order — CONSISTENT WITH upstream not having got there yet. "
                "Not proof of it: a truncated download has the same shape."
                % (name, len(missing), len(want), unit,
                   ", ".join(str(m) for m in missing[:6]), len(missing))
               if is_tail else
               "%s%d of %d %s(s) missing (%s) and %s is NOT the tail — %s is "
               "present after it. A publication schedule cannot leave a hole, "
               "so this is our join, our filter, or an upstream defect, and it "
               "must not be recorded as 'not published yet'."
               % (name, len(missing), len(want), unit,
                  ", ".join(str(m) for m in missing[:6]), missing[0], want[-1])),
    }
