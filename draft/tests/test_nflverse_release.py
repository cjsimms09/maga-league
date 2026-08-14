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
