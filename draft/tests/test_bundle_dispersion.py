# TERRITORY: A
"""The backtest board's spread: measured, or absent. Never invented.

`build_bundle.py` wrote `proj_ceiling = 1.35 * proj_mean` and
`proj_sd = 0.25 * proj_mean` — GLOBAL constants — on every backtest board ever
built. So `engine.js`'s ceiling term (`proj_ceiling - proj_mean`) was
`0.35 * proj_mean`: a fixed multiple of the value term, Spearman 1.0000.
`lab_ceiling_degeneracy.js` measured it and said the only honest thing about
every ceiling experiment run on that board — THE MEASUREMENT COULD NOT HAVE COME
OUT ANY OTHER WAY.

That is why `MEASURED_WEIGHTS.ceiling` ships at 0, and why the zero was to stand
"until a real-ceiling board re-runs the experiment". These tests are what makes
the rebuilt board a real-ceiling board, and what stops the constants coming back.
"""
from __future__ import annotations

import os
import sys

import pytest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))
from backtest import build_bundle as BB  # noqa: E402


def _cal(cells):
    return {"cells": cells}


def _cell(sd=0.30, p10=0.40, p90=1.60, n=60, status="measured"):
    return {"n": n, "status": status, "sd_ratio": sd, "mean_ratio": 1.0,
            "p10_ratio": p10, "p50_ratio": 1.0, "p90_ratio": p90}


# Two bands with DIFFERENT p90s — the whole point. A calibration whose cells all
# carry the same ratio would rebuild the very defect being removed.
CAL = _cal({
    ("WR", "1-3"): _cell(p90=1.15, p10=0.70, sd=0.20),
    ("WR", "4-8"): _cell(p90=1.35, p10=0.55, sd=0.28),
    ("WR", "9-16"): _cell(p90=1.60, p10=0.30, sd=0.38),
})


def _players(n=16, pos="WR"):
    return [{"player_id": str(i), "position": pos, "proj_mean": 200.0 - i * 10.0}
            for i in range(n)]


def test_the_ceiling_is_no_longer_a_fixed_multiple_of_the_projection():
    """GATE 1 FROM THE PREREG. If the ceiling/mean ratio is still one number
    across the board, nothing downstream of this change is interpretable and the
    re-derivation is abandoned."""
    ps = _players()
    BB.attach_dispersion(ps, CAL)
    ratios = {round(p["proj_ceiling"] / p["proj_mean"], 4)
              for p in ps if p.get("proj_ceiling")}
    assert len(ratios) > 1, (
        f"ceiling is still a single fixed multiple of proj_mean: {ratios}. This "
        "is the exact defect the change was meant to remove.")


def test_the_old_constants_are_gone_from_the_row_builder():
    """The literal values, pinned. A future edit that reintroduces 1.35 or 0.25
    as a dispersion default fails here rather than silently re-collinearising
    every backtest board."""
    src = open(os.path.join(os.path.dirname(HERE), "backtest",
                            "build_bundle.py")).read()
    assert '"proj_ceiling": round((pm or 0.0) * 1.35, 2)' not in src
    assert '"proj_sd": round((pm or 0.0) * 0.25, 2)' not in src


def test_an_unmeasured_cell_writes_nothing_rather_than_a_fallback():
    """ABSENT IS ABSENT. A fallback constant is how 0.25*mean reached the board
    in the first place, and a consumer cannot tell a fitted number from a
    filled-in one. An omitted ceiling makes engine.js's spread zero, which is
    the honest reading of "no measurement for this player"."""
    cal = _cal({("WR", "1-3"): _cell()})          # only the top band measured
    ps = _players(n=16)
    out = BB.attach_dispersion(ps, cal)
    top = [p for p in ps if p["proj_mean"] >= 180.0]
    deep = [p for p in ps if p["proj_mean"] < 180.0]
    assert all("proj_ceiling" in p for p in top)
    assert all("proj_ceiling" not in p for p in deep), (
        "an unmeasured cell must leave the field OFF, not fill it in")
    assert out["players_with_no_measured_cell"] == len(deep)


def test_an_unmeasurable_status_is_refused_even_when_ratios_are_present():
    """A cell can carry numbers and still be marked unmeasurable (too few graded
    players). The status is the authority, not the presence of a float —
    otherwise a two-player band reports the tightest spread on the board, which
    is the 0.0-variance failure shape."""
    cal = _cal({("WR", "1-3"): _cell(status="unmeasurable")})
    ps = _players(n=4)
    BB.attach_dispersion(ps, cal)
    assert all("proj_ceiling" not in p for p in ps)


def test_floor_and_sd_ride_along_and_are_sourced():
    """proj_floor and proj_sd were ABSENT and SYNTHETIC respectively. Both now
    come from the same measured cell, and both carry a source stamp so a later
    reader can tell which construction produced them — proj_ceiling changed
    MEANING on 2026-08-17 and an unstamped field is unreadable across that
    boundary."""
    ps = _players(n=8)
    BB.attach_dispersion(ps, CAL)
    p = ps[0]
    assert p["proj_floor"] < p["proj_mean"] < p["proj_ceiling"]
    assert p["proj_sd"] > 0
    for f in ("proj_ceiling", "proj_floor", "proj_sd"):
        assert p[f + "_source"] == "measured_calibration"


def test_weekly_sd_is_not_invented():
    """Production derives weekly_sd from games played; the bundle has no
    games-expected figure. Manufacturing one would be the same class of error
    this whole change removes, so the field stays off."""
    ps = _players(n=8)
    BB.attach_dispersion(ps, CAL)
    assert all("weekly_sd" not in p for p in ps)


def test_the_measured_spread_is_still_constant_within_a_cell():
    """DECLARED IN THE PREREG, PINNED HERE SO IT CANNOT BE OVERSOLD. The fix
    reduces the collinearity; it does not remove it. Inside one band every
    player still gets the same multiplier, so a weight fitted on this board
    measures CROSS-BAND differences only and says nothing about whether an
    individual player is worth taking for his upside.

    If this test ever fails, a genuine per-player dispersion signal has been
    wired in — and every claim about what these boards can measure needs
    revisiting upward."""
    ps = _players(n=3)                                   # all inside band 1-3
    BB.attach_dispersion(ps, CAL)
    ratios = {round(p["proj_ceiling"] / p["proj_mean"], 6) for p in ps}
    assert len(ratios) == 1, (
        "a per-player ceiling would be better than what was promised — update "
        "the prereg's limitations and the bundle notes before celebrating")


def test_build_without_a_calibration_records_the_refusal(monkeypatch):
    """A caller that supplies nothing must get a board with NO dispersion and a
    note saying so — not the old constants, and not silence."""
    ps = _players(n=4)
    note = {"attached": None, "why": "x"}
    # attach_dispersion must simply not be reached; assert the shape build()
    # writes when calibration is falsy.
    assert BB.attach_dispersion(ps, {"cells": {}})["attached"] == {
        "proj_ceiling": 0, "proj_floor": 0, "proj_sd": 0}
    assert all("proj_ceiling" not in p for p in ps)
    assert set(note) == {"attached", "why"}


def test_leave_one_season_out_is_enforced_by_the_fitter_not_by_memory():
    """The calibration must never be fitted on the season being graded — that is
    foreknowledge the drafter did not have (the exp33 leak). This is enforced in
    projection_error.calibrate, which RAISES rather than warning, so a caller
    cannot leak by forgetting."""
    from backtest import projection_error as PE
    with pytest.raises(ValueError, match="excluded season"):
        PE.calibrate([{"season": 2023, "players": []}], [{}], exclude_season=2023)
