# TERRITORY: C
"""THE FETCH PATH'S 404 BRANCH — the one that has been wrong three times.

`nflverse_run.fetch` reaches the network and is `pragma: no cover`, so the
message it raises is built by `failure_message`, which is pure and is what
these exercise. A branch that only exists inside an untestable function is a
branch nobody has run, and this is precisely the branch where:

  * `nfl_data_py.import_weekly_data(2025)` 404ing was recorded by two lanes as
    "2025 is not published" for a fortnight — it was served as `stats_player`;
  * `fetch_routes.py` filed a season of routes under nflverse's publication
    schedule when the file was served and our own lookup 404'd;
  * `build_historical_byes.py` wrote "2025 is not published on nflverse yet"
    on 2026-08-15 — the day AFTER the module documenting the trap — while all
    32 of that season's byes were derivable from the served file.

Run: python3 -m pytest draft/tests/test_nflverse_run.py -q
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "backtest"))

import nflverse_run as R  # noqa: E402

# ── THE 404 PATH RUNS THE CHECK, IT DOES NOT DESCRIBE IT ─────────────────────

def _probe(table):
    def go(url):
        for frag, status in table.items():
            if frag in url:
                return status
        return 404
    return go


def test_A_404_CARRIES_A_DIAGNOSIS_not_just_a_description():
    """⚠ RULE 9. `describe_failure` tells a reader to check the release name.
    That advice sat in this file's own docstring through the fortnight 2025 was
    recorded as unpublished, and again on 2026-08-15 when build_historical_byes
    wrote the same conclusion about the same season. Three times the sentence
    was present and nobody re-ran it, so the 404 path now RUNS the check.

    MUTATION: drop the diagnosis and go back to a sentence that has been
    ignored three times."""
    msg = R.failure_message(
        "weekly_stats", 2025, 404,
        _probe({"stats_player_week_2025": 404, "stats_player_week_": 200}),
        season_played_through=2025)
    assert "stats_player" in msg                      # still says what we asked
    assert "DIAGNOSIS" in msg
    assert "[ambiguous]" in msg, msg
    assert "not_published" not in msg.split("DIAGNOSIS")[1].split("]")[0]


def test_THE_404_PATH_MAY_NOT_INVENT_not_published_WITHOUT_THE_CALENDAR():
    """The caller says which seasons should exist, or the verdict is withheld."""
    table = {"play_by_play_2026": 404, "play_by_play_": 200}
    silent = R.failure_message("pbp", 2026, 404, _probe(table))
    assert "[ambiguous]" in silent and "did not say" in silent

    told = R.failure_message("pbp", 2026, 404, _probe(table),
                             season_played_through=2025)
    assert "[not_published]" in told and "has not been played" in told


def test_A_NON_404_IS_LEFT_ALONE_and_probes_nothing():
    """A 403 is a routing fact. Diagnosing it as a naming fact is the same
    collapse one level up, and it must not cost a network round trip either."""
    seen = []
    msg = R.failure_message("weekly_stats", 2025, 403,
                            lambda u: seen.append(u) or 200)
    assert "403" in msg and "DIAGNOSIS" not in msg
    assert seen == [], "a 403 needs no control probe"
