# TERRITORY: A
"""Per-player weekly volatility — the refusals and the honesty, which are the parts that can rot.

The measurement itself is arithmetic. What needs guarding is (a) that seasons
scored under DIFFERENT rule sets are never pooled, and (b) that the module keeps
saying it measures a signal rather than licensing a weight. Both are the kinds of
thing that quietly stop being true.
"""
from __future__ import annotations

import json
import os
import sys

import pytest

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, os.path.join(ROOT, "draft", "backtest"))
import weekly_volatility as WV  # noqa: E402


def test_seasons_under_a_different_scoring_table_are_refused_not_pooled():
    """THE GUARD THAT MATTERS MOST, and it fired for real: 2021-2022 were scored
    under a different fingerprint than 2023-2025.

    A points total is a fact about a week AND a rule set. Pooling across a
    scoring change produces per-player numbers that never existed under either
    table — and, in nflverse_weekly_store's own words, "NOTHING IN THE
    ARITHMETIC WOULD COMPLAIN": the sum is a valid float, the count is right,
    and every check we own goes green."""
    seasons, fp_of = WV.comparable_seasons()
    assert seasons, "no comparable season group found at all"
    fps = {fp_of[s] for s in seasons}
    assert len(fps) == 1, f"the chosen group mixes scoring tables: {fps}"
    # And any season left out must genuinely differ, not just be inconvenient.
    for s, fp in fp_of.items():
        if s not in seasons:
            assert fp != next(iter(fps)), (
                f"season {s} shares the fingerprint and was excluded anyway")


def test_a_thin_or_tiny_mean_player_season_is_dropped():
    """Two different ways cv lies, both refused rather than filtered later.

    Few weeks: an sd off three games is noise about noise. Tiny mean: cv
    explodes on arithmetic alone — a player averaging 0.4 with one 6-point week
    reads as wildly volatile while telling us only that he does not play. Both
    land hardest on deep, intermittently-used players, which is exactly the
    population a boom/bust reading is most tempting for."""
    by = {
        "thin": [10.0] * (WV.MIN_WEEKS - 1),
        "tiny": [0.0] * (WV.MIN_WEEKS + 4) + [6.0],
        "good": [12.0, 4.0, 18.0, 9.0, 15.0, 2.0, 11.0, 20.0, 7.0],
    }
    out = WV.season_volatility(by)
    assert "thin" not in out
    assert "tiny" not in out
    assert "good" in out and out["good"]["cv"] > 0


def test_cv_is_scale_free_so_it_is_not_the_mean_in_disguise():
    """The whole point. Doubling every weekly score doubles mean AND sd and
    leaves cv identical — so cv cannot be a rescaled copy of the projection,
    which is the defect every existing dispersion field has."""
    base = [12.0, 4.0, 18.0, 9.0, 15.0, 2.0, 11.0, 20.0, 7.0]
    a = WV.season_volatility({"p": base})["p"]
    b = WV.season_volatility({"p": [x * 2 for x in base]})["p"]
    assert a["cv"] == pytest.approx(b["cv"], abs=1e-6)
    assert b["mean"] == pytest.approx(a["mean"] * 2, abs=1e-6)


def test_persistence_reports_a_null_and_a_control_in_the_same_row():
    """A rho with no null is not evidence, and a null with no control cannot
    tell "nothing persists" from "the test cannot detect persistence". Both ride
    in the same row so a reader cannot see the headline without the yardstick."""
    seasons, _ = WV.comparable_seasons()
    per = {}
    for s in seasons:
        by, _ = WV.load_season(s)
        per[s] = WV.season_volatility(by)
    rows = WV.persistence(per, seasons, "cv", draws=60)
    assert rows, "no transitions measured"
    for r in rows:
        if r.get("status") == "underpowered":
            continue
        assert "null_95" in r and r["null_95"][0] < r["null_95"][1]
        assert "control_mean_carryover" in r
        assert r["control_mean_carryover"] > 0.3, (
            "the control must show a strong trait carrying over, or the test "
            "cannot detect one and a null result would be meaningless")


def test_persistence_is_deterministic():
    """A seeded null, so the same store gives the same verdict. An unseeded
    permutation test that lands either side of its own threshold on re-runs is
    a coin flip wearing a measurement's clothes."""
    seasons, _ = WV.comparable_seasons()
    per = {}
    for s in seasons:
        by, _ = WV.load_season(s)
        per[s] = WV.season_volatility(by)
    a = WV.persistence(per, seasons, "cv", draws=60)
    b = WV.persistence(per, seasons, "cv", draws=60)
    assert a == b


def test_the_module_does_not_license_a_weight():
    """THE HONESTY PIN. This file measures that a signal EXISTS. That is not a
    measurement that leaning on it PAYS, and this repo has spent a week learning
    that difference the expensive way — a ceiling weight was zeroed, a phase
    grid returned a null it did not earn, and both traced to treating a
    quantity's existence as a licence to use it.

    If someone later deletes this disclaimer to justify shipping a weight, this
    test fails first."""
    doc = WV.build()
    note = doc["_note"]
    assert "sets no weight" in note
    assert "not evidence that leaning on it pays" in note


def test_the_missing_population_is_documented_as_injury_selected():
    """THE CAVEAT MOST LIKELY TO BE LOST, so it is pinned.

    On the 2026 board 26 of 157 draftable players have no 2025 volatility, and
    only 8 are rookies — the rest are veterans who MISSED most of last season.
    That is an injury-selected group containing Nabers (ADP 32), Garrett Wilson
    (45) and Mike Evans (62): early picks, not deep fliers.

    A future wiring that fills a missing volatility with a positional mean would
    hand the steadiest available reading to exactly the players whose last
    season was interrupted — a bias pointing the wrong way on the most expensive
    picks. If this warning is ever deleted, this fails first."""
    src = open(os.path.join(ROOT, "draft", "backtest",
                            "weekly_volatility.py")).read()
    assert "INJURY-SELECTED" in src
    assert "never as\n     average" in src or "never as average" in src
    # and the honest statement that it cannot answer the rookie question
    assert "Concepcion" in src and "undefined" in src


def test_the_artifact_records_which_seasons_it_refused():
    """A refusal that leaves no trace is indistinguishable from data that never
    existed. The artifact must say which seasons were dropped and why, or a
    2027 reader sees three seasons and assumes that is all there ever was."""
    doc = WV.build()
    # Re-pinned 2026-08-18 (register 5d): the 2021-22 refusals were an artifact
    # of the FETCHER-written stores carrying a different scoring fingerprint.
    # The components-derived rebuild scores every season through the ONE frozen
    # table, so nothing is refused and the fit gains two seasons. The claim
    # this test protects is unchanged: a refused season must be NAMED, never
    # silently absent — an empty refusal list with five seasons used is the
    # healthy state, and any future refusal must reappear in this list.
    assert doc["seasons_refused_different_scoring_table"] == []
    assert doc["seasons_used"] == [2021, 2022, 2023, 2024, 2025]
    assert doc["scoring_fingerprint_by_season"]
