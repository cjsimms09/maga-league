# TERRITORY: C
"""THE RELEASE NAMES, AND THE 404 THAT MADE A WHOLE SEASON LOOK MISSING.

`nfl_data_py.import_weekly_data(2025)` 404s. Both A and I recorded that as "2025
is not published yet" — the season closest to the board, absent from the
durability answer and from the variance work, for a fortnight.

It was published the whole time. The nflverse release is named **`stats_player`**;
`nfl_data_py` asks for `player_stats`. `stats_player_week_2025.parquet` is 855KB
and fetches in under a second.

That is this repo's recurring defect one layer below where it usually lands — a
consumer reading a name its author believed in — and it fails in the worst
possible way, because **a 404 is indistinguishable from "no data" unless
something says which name was asked for.** A missing season is a fact about the
world; a missing asset is a fact about our URL. These assertions keep the two
apart.

Run: python3 -m pytest draft/tests/test_nflverse_release.py -q
"""
import sys
from pathlib import Path

import pytest

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "backtest"))

import nflverse_release as R  # noqa: E402


def test_THE_WEEKLY_STATS_RELEASE_IS_stats_player_not_player_stats():
    """The exact string that cost us 2025. Written as a test rather than a
    comment because a comment cannot fail when somebody 'tidies' the name back.

    MUTATION: swap it to `player_stats` — every fetch 404s, and the caller
    concludes the season is unpublished. That is not a hypothetical; it is what
    happened, twice, in two different lanes."""
    url = R.asset_url("weekly_stats", 2025)
    assert "/releases/download/stats_player/stats_player_week_2025.parquet" in url
    assert "player_stats" not in url


def test_EVERY_KIND_WE_ACTUALLY_USE_HAS_A_URL():
    """The four assets today's measurements were built from. A kind that silently
    stopped resolving would take its measurement with it.

    MUTATION: drop one from the table — `asset_url` raises for it, which is the
    point: it raises here rather than 404ing at the provider."""
    for kind in ("weekly_stats", "weekly_rosters", "pbp"):
        assert R.asset_url(kind, 2025).startswith("https://")
    assert R.asset_url("players").startswith("https://")


def test_AN_UNKNOWN_KIND_IS_REFUSED_BY_NAME_rather_than_guessed():
    """Guessing a release name is exactly how 2025 went missing. A kind we have
    not verified must fail here, loudly, not become a 404 that reads as absent
    data.

    MUTATION: fall back to a constructed name like `%s/%s_%d.parquet` — the
    caller gets a plausible URL, the provider returns 404, and the conclusion is
    "nflverse does not publish that", which is a claim about the world made from
    a guess about a string."""
    with pytest.raises(ValueError, match="not a verified release"):
        R.asset_url("injuries", 2025)


def test_A_SEASONLESS_ASSET_REFUSES_A_SEASON_and_vice_versa():
    """`players.parquet` carries every player ever and takes no year; the weekly
    files take one. Passing a year to the first would build a URL that 404s, and
    omitting it from the second would too — both landing as "no data".

    MUTATION: format the year in regardless — `players_2025.parquet` 404s and the
    id crosswalk looks unavailable, which would strand every measurement that
    needs to reach our own player ids."""
    assert R.asset_url("players") .endswith("/players/players.parquet")
    with pytest.raises(ValueError, match="takes no season"):
        R.asset_url("players", 2025)
    with pytest.raises(ValueError, match="needs a season"):
        R.asset_url("weekly_stats")


def test_THE_ID_CROSSWALK_IS_ON_RAW_GITHUBUSERCONTENT_not_github_com():
    """Measured 2026-08-14: `github.com/.../raw/...` returns **403** through this
    environment's proxy while `raw.githubusercontent.com/...` returns 200 for the
    identical file. A 403 reads as "we are not allowed this data" when it is
    really "wrong host".

    MUTATION: point it at github.com — the crosswalk 403s, no gsis id resolves to
    a Sleeper id, and every nflverse measurement reports zero matched players."""
    u = R.PLAYER_IDS_URL
    assert u.startswith("https://raw.githubusercontent.com/")
    assert "//github.com/" not in u


def test_A_404_IS_REPORTED_AS_THE_ASSET_WE_ASKED_FOR_not_as_missing_data():
    """The whole point of this module. `describe_failure` turns a status into a
    sentence that names the release and the file, so the next person reads "we
    asked for X" rather than "2025 does not exist".

    MUTATION: return a generic "not available" — and we are back to a fortnight
    of two lanes believing a season was unpublished."""
    msg = R.describe_failure("weekly_stats", 2025, 404)
    assert "stats_player" in msg and "2025" in msg
    assert "our URL" in msg or "release name" in msg
    # A 403 is a DIFFERENT fact and must not be folded into the same sentence.
    assert "403" not in msg
    forbidden = R.describe_failure("weekly_stats", 2025, 403)
    assert "403" in forbidden and "proxy" in forbidden.lower()


# ── THE RUNNER'S PLAN: which asset each measurement reads ────────────────────

def test_THE_SPREAD_WORK_READS_BOTH_ROSTER_AND_STATS():
    """Availability comes from the ROSTER (was he there) and points from the STATS
    file (what did he do). Reading availability from the stats file is the exact
    mistake that scored 39.4% of active QB weeks as absences.

    MUTATION: drop `weekly_rosters` from the spread plan — the measurement falls
    back to presence-in-the-stats-file as availability, and the bias it
    reintroduces differs by position, which is what manufactures a positional
    ordering out of usage."""
    import nflverse_run as RUN
    kinds = {k for k, _s, _u in RUN.plan("spread")}
    assert kinds == {"weekly_rosters", "weekly_stats"}, kinds


def test_AN_UNKNOWN_MEASUREMENT_IS_REFUSED_rather_than_given_an_empty_plan():
    """MUTATION: return [] for an unknown name — the runner fetches nothing,
    reports no failure, and the measurement silently does not happen."""
    import nflverse_run as RUN
    with pytest.raises(ValueError, match="not a measurement"):
        RUN.plan("usage")


def test_THE_PLAN_REFUSES_THE_SEASON_BEING_DRAFTED():
    """Every one of these measurements is a PRIOR. `team_pace`, `durability` and
    `weekly_variance` each enforce this for themselves; the runner enforcing it too
    is what stops a caller quietly widening the window before they ever run.

    MUTATION: allow it — 2026 is fetched, the per-module guards raise deep inside a
    fetch loop instead of before it, and the failure reads as a missing asset."""
    import nflverse_run as RUN
    with pytest.raises(ValueError, match="strictly before"):
        RUN.plan("pace", seasons=(2025, 2026))


def test_THE_RUNNER_SENDS_THE_REPO_S_USER_AGENT():
    """FFC 403s Python's default and a fetcher using a different identity is a
    second one nobody chose. Asserted against the module that already ships it
    rather than restated.

    MUTATION: change either — the two drift and the next 403 is diagnosed as a
    provider problem."""
    import external_adp_capture as CAP
    assert R.USER_AGENT == CAP.USER_AGENT


# ── REGENERATE-AND-COMPARE: the diffing half, which is pure ──────────────────

def test_A_MATCHING_ARTIFACT_REPORTS_NO_DIFFERENCE():
    import nflverse_run as RUN
    fresh = {"a": {"x": 1.0, "y": 2.0}, "b": {"x": 3.0}}
    r = RUN.compare_rows(fresh, dict(fresh), ("x", "y"))
    assert r["differences"] == [] and r["compared"] == 2 and r["ok"] is True


def test_A_CHANGED_FIELD_IS_NAMED_with_both_values():
    """A diff that says "they differ" and not HOW is a diff nobody can act on —
    the same complaint this lane made about integrate.sh discarding suite output.

    MUTATION: report only a count — a revision upstream is indistinguishable from
    a bug in our own derivation, which are opposite problems."""
    import nflverse_run as RUN
    r = RUN.compare_rows({"a": {"x": 1.0}}, {"a": {"x": 2.0}}, ("x",))
    assert r["ok"] is False
    d = r["differences"][0]
    assert d["key"] == "a" and d["field"] == "x"
    assert d["fresh"] == 1.0 and d["committed"] == 2.0


def test_A_ROW_ON_ONE_SIDE_ONLY_IS_A_DIFFERENCE_not_a_skip():
    """Population drift is the failure that hides: a player who appears or vanishes
    changes every summary computed over the set, and comparing only the overlap
    reports agreement while the denominators moved.

    MUTATION: intersect the keys first — the two artifacts agree perfectly on the
    players they share, which is exactly what a silent revision looks like."""
    import nflverse_run as RUN
    r = RUN.compare_rows({"a": {"x": 1.0}, "b": {"x": 1.0}}, {"a": {"x": 1.0}}, ("x",))
    assert r["ok"] is False
    assert any(d.get("field") == "__present__" for d in r["differences"]), r


def test_THE_TOLERANCE_IS_EXPLICIT_and_absolute():
    """Committed artifacts store rounded values, so an exact comparison would fail
    on arithmetic rather than on drift — which is the mistake I made twice today.
    The tolerance is a parameter and it is stated in the result.

    MUTATION: compare with == — every rounded field reports a difference and the
    check becomes noise nobody reads."""
    import nflverse_run as RUN
    r = RUN.compare_rows({"a": {"x": 1.0004}}, {"a": {"x": 1.0}}, ("x",), tol=0.01)
    assert r["ok"] is True and r["tolerance"] == 0.01


# ── THE CHECK, NOT THE ADVICE: does upstream lack it, or did we ask wrong? ───
#
# `describe_failure` tells a reader to verify the release name. These pin the
# function that VERIFIES it, because the record shows what advice is worth:
# the same sentence was available for the whole fortnight 2025 spent filed as
# unpublished, and for however long `nflverse_pace.py` claimed the pbp pull was
# egress-blocked when it returns 200 in about a second.

def _probe(table, log=None):
    """A probe with no network: {url_suffix_match: status}. `None` = could not ask."""
    def go(url):
        if log is not None:
            log.append(url)
        for frag, status in table.items():
            if frag in url:
                return status
        return 404
    return go


def test_A_RENAMED_RELEASE_THAT_STILL_SERVES_OLD_SEASONS_IS_NOT_not_published():
    """⚠ THE CASE THAT DEFEATED THE FIRST VERSION OF THIS FUNCTION, and the exact
    case the module exists for.

    Measured against the real host 2026-08-17: nflverse renamed `player_stats`
    to `stats_player` and LEFT THE OLD RELEASE IN PLACE, frozen after 2024.

        player_stats/player_stats_2023.parquet   200   <- control passes
        player_stats/player_stats_2024.parquet   200
        player_stats/player_stats_2025.parquet   404
        stats_player/stats_player_week_2025.parquet  200

    So the dead name serves the control season, the template "works", and the
    first version of `diagnose_missing` returned `not_published` — reproducing
    the original fortnight with a checker written to prevent it. It is also why
    the original story was believed: four seasons worked and one 404'd, which
    is precisely what a season not being out yet looks like.

    MUTATION: let a passing control alone mean `not_published` — which is what
    it meant an hour ago — and this season is filed under nflverse's
    publication schedule while it is being served."""
    R.RELEASES["dead_name"] = ("player_stats", "player_stats_%d.parquet", True)
    R.FAMILY["dead_name"] = "weekly_stats"       # a rival NAME for the same data
    try:
        d = R.diagnose_missing(
            "dead_name", 2025,
            _probe({"player_stats/player_stats_2025": 404,
                    "player_stats/player_stats_": 200,
                    "stats_player/stats_player_week_2025": 200}),
            season_played_through=2025)
    finally:
        del R.RELEASES["dead_name"]
        del R.FAMILY["dead_name"]
    assert d["control_status"] == 200, "the control must PASS or this proves nothing"
    assert d["verdict"] == "served_elsewhere", d
    assert d["served_as"] == "weekly_stats"
    assert d["verdict"] != "not_published"
    assert "whole time" in d["why"] or "our name" in d["why"]


def test_A_PLAYED_SEASON_MISSING_UNDER_EVERY_KNOWN_NAME_IS_ambiguous_never_absent():
    """No verified name serves it AND the season has been played. That is still
    not evidence nflverse lacks it — a rename we have not found yet looks
    identical from here. The honest verdict is `ambiguous`.

    MUTATION: return `not_published` for the tidy-looking case and the module
    is back to making claims about the world out of facts about our URLs.

    ⚠ AND THE OTHER FAMILIES ARE SERVED HERE, WHICH IS THE POINT. An earlier
    fixture 404'd every other kind, so it could not tell "no rival NAME for this
    data" from "no other asset at all" — and the real host does the opposite:
    2026 rosters are served months before a snap. Run live, that fixture's code
    reported `pbp` 2026 as `served_elsewhere` on the strength of a roster."""
    d = R.diagnose_missing(
        "weekly_stats", 2024,
        _probe({"stats_player_week_2024": 404, "stats_player_week_": 200,
                # every OTHER family serves 2024 — none of them is weekly stats
                "play_by_play_2024": 200, "roster_2024": 200,
                "roster_weekly_2024": 200, "players.parquet": 200}),
        season_played_through=2025)
    assert d["verdict"] == "ambiguous", d
    assert "renamed" in d["why"]
    assert "IS within the played range" in d["why"]


def test_A_DIFFERENT_FAMILY_MAY_NOT_ANSWER_FOR_THE_MISSING_ONE():
    """⚠ MEASURED LIVE, NOT IMAGINED. `pbp/play_by_play_2026.parquet` 404s
    because the 2026 season has not been played — while
    `rosters/roster_2026.parquet` is served, as it is every year long before
    week 1. Cross-checking any kind that merely TAKES A SEASON therefore
    concluded the play-by-play "was there the whole time".

    A roster is not play-by-play. Only a rival name for the SAME data counts.

    MUTATION: drop the family gate and 2026 pbp comes back `served_elsewhere`,
    pointing at a roster — a gap of theirs recorded as a gap of ours, which is
    the same defect as the original wearing the opposite sign."""
    d = R.diagnose_missing(
        "pbp", 2026,
        _probe({"play_by_play_2026": 404, "play_by_play_": 200,
                "roster_2026": 200, "roster_weekly_2026": 200,
                "players.parquet": 200}),
        season_played_through=2025)
    assert d["verdict"] == "not_published", d
    assert d.get("served_as") is None
    assert "has not been played" in d["why"]


def test_AN_UNREGISTERED_KIND_IS_ITS_OWN_FAMILY_not_a_wildcard():
    """`family()` defaults an unknown kind to ITSELF, and the default is the
    whole safety of the fallback: two kinds added ad hoc without family entries
    must not start answering for one another.

    ⚠ FOUND BY THE GATE AS A SURVIVOR. Mutating the default to a shared
    constant left every assertion green, because every kind in the other tests
    is registered — so the claim in `family`'s docstring was carried by nothing.

    MUTATION: `FAMILY.get(kind, "any")`. Two unrelated new kinds collapse into
    one family and a missing asset is answered by whatever else happens to be
    served."""
    assert R.family("no_such_kind_at_all") == "no_such_kind_at_all"
    assert R.family("another_unknown") != R.family("no_such_kind_at_all")

    R.RELEASES["odd_a"] = ("alpha", "alpha_%d.parquet", True)
    R.RELEASES["odd_b"] = ("beta", "beta_%d.parquet", True)
    try:
        d = R.diagnose_missing(
            "odd_a", 2024,
            _probe({"alpha/alpha_2024": 404, "alpha/alpha_": 200,
                    "beta/beta_2024": 200}),      # a DIFFERENT unregistered kind
            season_played_through=2025)
    finally:
        del R.RELEASES["odd_a"], R.RELEASES["odd_b"]
    assert d["verdict"] == "ambiguous", d
    assert d.get("served_as") is None, "beta must not answer for alpha"


def test_not_published_REQUIRES_THE_CALENDAR_and_is_refused_without_it():
    """The ONLY sound `not_published`: the season has not been played. That is a
    fact no renamed release can imitate — and it does not come from a probe.

    MUTATION: default `season_played_through` to anything at all, and an
    unstated calendar silently starts licensing the verdict it cannot support."""
    table = {"play_by_play_2026": 404, "play_by_play_": 200}
    unstated = R.diagnose_missing("pbp", 2026, _probe(table))
    assert unstated["verdict"] == "ambiguous", unstated
    assert "did not say" in unstated["why"]

    stated = R.diagnose_missing("pbp", 2026, _probe(table), season_played_through=2025)
    assert stated["verdict"] == "not_published", stated
    assert "has not been played" in stated["why"]


def test_A_BROKEN_TEMPLATE_IS_OURS_and_the_control_is_what_shows_it():
    """The control 404s too, so the template — not the season — is wrong."""
    d = R.diagnose_missing(
        "pbp", 2025, _probe({"play_by_play_": 404}), season_played_through=2025)
    assert d["verdict"] == "we_asked_wrong", d
    assert d["control_status"] == 404


def test_AN_UNREACHABLE_CONTROL_IS_unknown_and_NEVER_not_published():
    """⚠ THE BRANCH THE WHOLE MODULE IS FOR. If we could not ask, we did not
    learn anything — and writing our own outage down as nflverse lacking the
    data is the gap-of-ours-recorded-as-a-gap-of-theirs defect itself.

    MUTATION: treat a None control as absent data. Every network blip then
    becomes a permanent, plausible, written-down claim about upstream."""
    for bad in (None, 500, 403):
        d = R.diagnose_missing(
            "pbp", 2026,
            _probe({"play_by_play_2026": 404, "play_by_play_": bad}),
            season_played_through=2025)
        assert d["verdict"] == "unknown", (bad, d)
        assert "must not be recorded" in d["why"]


def test_AN_UNKNOWN_KIND_IS_we_asked_wrong_WITHOUT_TOUCHING_THE_NETWORK():
    """`player_stats` is not a verified kind. There was never a URL to 404, so
    no request may be made and no fact about nflverse may be inferred."""
    log = []
    d = R.diagnose_missing("player_stats", 2025, _probe({}, log),
                           season_played_through=2025)
    assert d["verdict"] == "we_asked_wrong" and d["checked"] is False
    assert log == [], "an unverified name must not become a request"


def test_THE_CONTROL_MAY_NOT_BE_THE_SEASON_UNDER_TEST():
    """Probing the asked-for URL as its own control can only agree with itself,
    manufacturing `we_asked_wrong` out of the test design."""
    d = R.diagnose_missing("pbp", R.CONTROL_SEASON, _probe({"play_by_play_": 404}),
                           season_played_through=2025)
    assert d["verdict"] == "unknown", d
    assert "IS the season asked for" in d["why"]


# ── A FETCH THAT CAME BACK SHORT: the count, and whether the shape excuses it ─

def test_A_HOLE_IS_NOT_A_PUBLICATION_SCHEDULE():
    """⚠ THE DISCRIMINATION. A schedule can only be missing a contiguous TAIL.
    Weeks 1-4 and 6-18 present with 5 absent is not something upstream does, so
    it is our join, our filter, or a real defect — never 'not published yet'.

    MUTATION: report any shortfall as a tail and an interior hole becomes
    invisible behind an explanation that cannot apply to it."""
    hole = R.shortfall(got=[w for w in range(1, 19) if w != 5],
                       expected=range(1, 19), unit="week")
    assert hole["verdict"] == "interior", hole
    assert hole["n_missing"] == 1 and hole["missing"] == [5]
    assert "cannot leave a hole" in hole["why"]
    assert "must not be recorded" in hole["why"]

    tail = R.shortfall(got=range(1, 15), expected=range(1, 19), unit="week")
    assert tail["verdict"] == "tail", tail
    assert tail["n_missing"] == 4 and tail["missing"] == [15, 16, 17, 18]
    # CONSISTENT WITH, not cleared — a truncated download has the same shape.
    assert "CONSISTENT WITH" in tail["why"] and "Not proof" in tail["why"]


def test_A_SHORTFALL_ALWAYS_CARRIES_THE_COUNT():
    """Cory's rule, verbatim: write down the count, the reason, and the check."""
    for r in (R.shortfall(got=[1, 2], expected=range(1, 19)),
              R.shortfall(got=[1, 3], expected=range(1, 4))):
        assert r["n_missing"] == r["n_expected"] - r["n_got"]
        assert r["missing"] and r["why"]
    assert R.shortfall(got=range(1, 19), expected=range(1, 19))["verdict"] == "complete"


def test_AN_EMPTY_EXPECTATION_IS_unknown_not_complete():
    """A check that expected nothing found nothing. Rule 13f: that has not
    looked, and it must not read as a clean bill."""
    r = R.shortfall(got=[], expected=[])
    assert r["verdict"] == "unknown", r
    assert "not the same as the fetch being complete" in r["why"]
