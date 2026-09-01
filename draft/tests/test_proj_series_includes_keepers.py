# TERRITORY: D
"""THE 2027 SOURCE GRADE HAD NO ROW FOR ANY KEEPER, AND NOTHING SAID SO.

`_update_proj_series` read `artifact["players"]` alone. The keeper lock MOVES a
player out of that list into `kept_players`, so from the lock on 2026-08-22 the
archive built expressly to make the January 2027 projection-source grade
possible carried no projection, no situation and no distribution for any of the
twenty-three best players in the league.

It is register 80's named bug -- a join walking `players` and silently missing
keepers -- in the one file where the loss is unrecoverable: `proj_series.py`'s
own note says a retroactive fetch leaks (exp33), so a day not captured is gone.

It was silent because the completeness check in `draft-data.yml` asks whether
each source WROTE A ROW today, never what is inside the row. On every day of
the ten it printed `complete`.

⚠️ RULE 3E — THE FAIL ARM IS THE POINT. A test that only asserts the keepers are
present would pass just as happily against a board with no keepers at all, or if
someone later re-broke the population a different way. So the pre-fix expression
is evaluated here explicitly and REQUIRED to be missing them: if
`artifact["players"]` ever starts containing keepers, this file is testing
nothing and says so rather than going quietly green.
"""
import json
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "draft"))

BOARD = ROOT / "public" / "draft_data.json"


@pytest.fixture(scope="module")
def artifact():
    if not BOARD.exists():
        pytest.skip("no published board in this checkout")
    return json.loads(BOARD.read_text())


def _kept_ids(artifact):
    return {str(p["player_id"]) for p in artifact.get("kept_players", [])
            if p.get("player_id")}


def test_the_board_actually_has_keepers_or_this_file_proves_nothing(artifact):
    """The licence for everything below. A post-lock board has a keeper slate;
    a pre-lock one does not, and then the arms are vacuous rather than green."""
    kept = _kept_ids(artifact)
    if not kept:
        pytest.skip("board is pre-keeper-lock: nothing for this file to assert")
    assert len(kept) >= 2, kept


def test_FAIL_ARM_the_old_expression_really_did_miss_them(artifact):
    """The exact pre-fix population, evaluated here. If this ever passes, the
    defect this file guards has changed shape and the guard below is inert."""
    kept = _kept_ids(artifact)
    if not kept:
        pytest.skip("board is pre-keeper-lock")
    old_population = {str(p["player_id"]) for p in artifact.get("players", [])
                      if p.get("player_id")}
    assert not (kept & old_population), (
        "`players` now contains kept players, so the old expression would NOT "
        "have dropped them — this file's fail arm is no longer testing anything")


def test_every_keeper_reaches_the_frozen_snapshot(artifact, tmp_path):
    """The fix, end to end through the real writer rather than a reimplemented
    population: run `_update_proj_series` at a throwaway path and read back what
    it actually froze."""
    kept = _kept_ids(artifact)
    if not kept:
        pytest.skip("board is pre-keeper-lock")
    import build

    out = tmp_path / "proj_series.json"
    build._update_proj_series(artifact, today="2026-01-01", path=out)
    series = json.loads(out.read_text())["series"]
    frozen = {s["source"]: set(s["proj"]) for s in series if s["date"] == "2026-01-01"}

    assert "sleeper" in frozen, series
    missing = sorted(kept - frozen["sleeper"])
    assert not missing, (
        f"{len(missing)} kept players are absent from the frozen Sleeper "
        f"snapshot: {missing}. They carry proj_baseline on the artifact, so the "
        "archive is dropping numbers it already holds — and preseason "
        "projections cannot be refetched (exp33).")

    # FantasyPros prices 22 of the 23 today; assert the join, not a count, so a
    # keeper FP genuinely does not cover is not read as a regression here.
    fp_on_board = {str(p["player_id"]) for p in artifact.get("kept_players", [])
                   if p.get("proj_fantasypros") is not None}
    if fp_on_board:
        assert "fantasypros" in frozen, series
        assert not (fp_on_board - frozen["fantasypros"]), sorted(fp_on_board - frozen["fantasypros"])


def test_the_truncation_does_not_evict_a_keeper_to_make_room(artifact, tmp_path):
    """Adding 23 rows pushes the population past `TOP_N`, and the cut is by
    projection. Keepers are the highest-projection players on the board so they
    cannot lose that cut today — but the cut is real and this says so out loud,
    because 'it fits' is a property of this board, not of the code."""
    kept = _kept_ids(artifact)
    if not kept:
        pytest.skip("board is pre-keeper-lock")
    import build
    import proj_series as PS

    priced = [p for p in artifact.get("players", []) + artifact.get("kept_players", [])
              if p.get("proj_baseline") is not None]
    out = tmp_path / "s.json"
    build._update_proj_series(artifact, today="2026-01-01", path=out)
    frozen = next(s for s in json.loads(out.read_text())["series"]
                  if s["source"] == "sleeper")
    assert len(frozen["proj"]) == min(len(priced), PS.TOP_N), (
        len(frozen["proj"]), len(priced), PS.TOP_N)
    assert not (kept - set(frozen["proj"])), "the cut evicted a keeper"


def test_the_newest_capture_is_never_keeper_blind(artifact):
    """FORWARD-LOOKING, and the reason it exists is that the last time this
    broke, nothing noticed for EIGHT capture-days. The completeness check in
    `draft-data.yml` asks whether each source wrote a row and printed
    `complete` on every one of them, truthfully.

    This asks the question that would have caught it on day one: does the newest
    captured day carry any keeper at all, on each source. It is deliberately a
    weak bar — ANY keeper, not all 23 — so ordinary churn cannot redden it while
    a writer that stops looking at the whole population still does.
    """
    import sys as _sys
    _sys.path.insert(0, str(ROOT / "draft" / "tools"))
    from proj_series_gradeable import population_by_day, systematic_absences

    kept = _kept_ids(artifact)
    if not kept:
        pytest.skip("board is pre-keeper-lock")
    series_path = ROOT / "draft" / "data" / "proj_series.json"
    if not series_path.exists():
        pytest.skip("no archive in this checkout")
    series = json.loads(series_path.read_text())["series"]

    for source in ("sleeper", "fantasypros"):
        days = population_by_day(series, source)
        if not days:
            continue
        newest = sorted(days)[-1]
        blind = {d for run in systematic_absences(series, source, kept) for d in run}
        assert newest not in blind, (
            f"{source}'s newest capture ({newest}) carries not one of the {len(kept)} "
            "kept players — the archive has stopped seeing a whole population, and "
            "preseason projections cannot be refetched (exp33). Register 444.")


def test_CONTROL_the_blind_run_detector_finds_the_one_we_already_had(artifact):
    """RULE 3E. The test above is a null-returning check, and a null from a
    detector that has never returned a positive is a bug report rather than a
    finding. This is its positive: register 444's own eight-day run, still
    sitting in the archive, must be found — so if the detector ever goes blind,
    it says so here instead of quietly passing up there forever.
    """
    import sys as _sys
    _sys.path.insert(0, str(ROOT / "draft" / "tools"))
    from proj_series_gradeable import systematic_absences

    kept = _kept_ids(artifact)
    if not kept:
        pytest.skip("board is pre-keeper-lock")
    series_path = ROOT / "draft" / "data" / "proj_series.json"
    if not series_path.exists():
        pytest.skip("no archive in this checkout")
    series = json.loads(series_path.read_text())["series"]

    runs = systematic_absences(series, "sleeper", kept)
    assert any(len(r) >= 5 for r in runs), (
        "the register-444 keeper-blind run is no longer detectable in the archive. "
        "Either history was rewritten, or this detector has stopped working — and "
        "if it has, the forward-looking test beside it is passing on nothing.")
