# TERRITORY: D
"""BEST-OF-K MUST FIND A REAL WINNER AND MUST NOT INVENT ONE.

BLEND-SEARCH-DESIGN.md §3 calls this "the one this program does not yet have
and needs most". A null that cannot fire is worse than no null, because it
launders every future winner -- so the controls here are the point of the file,
not decoration around it.

  KNOWN-POSITIVE   one arm made genuinely better must be detected
  KNOWN-NEGATIVE   K arms of identical skill must NOT be detected, at the
                   advertised rate
  DIRECTION        the free margin over the FIELD must GROW with K. The first
                   version of best_of_k.py used margin-over-runner-up, which
                   SHRINKS with K -- the opposite of the risk the design doc
                   describes. That inversion is pinned so it cannot come back.

Run: python -m pytest draft/tests/test_best_of_k.py -q
"""
from __future__ import annotations

import json
import random
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "draft" / "backtest"))

import best_of_k as B  # noqa: E402

ARTIFACT = ROOT / "draft" / "backtest" / "best_of_k.json"


def _arms(k: int, n: int, better: float = 0.0, seed: int = 7) -> dict:
    """K arms of identical skill, optionally with arm_0 made `better` points
    more accurate on every row."""
    rng = random.Random(seed)
    rows = [abs(rng.gauss(0.0, 5.0)) for _ in range(n)]
    out = {}
    for i in range(k):
        shift = -better if i == 0 else 0.0
        out[f"arm_{i}"] = [max(0.0, r + shift + rng.gauss(0.0, 1.0)) for r in rows]
    return out


def test_KNOWN_POSITIVE_a_genuinely_better_arm_is_detected():
    """If this fails the null is inert and every future champion is laundered."""
    res = B.best_of_k(_arms(5, 800, better=1.0), permutations=400)
    assert res["winner"] == "arm_0", res["mae"]
    assert res["survives"], res
    assert res["field_p_value"] < 0.05, res


def test_KNOWN_NEGATIVE_equally_good_arms_do_not_produce_a_winner():
    """The failure mode this file exists for: K arms with no skill difference
    still produce a 'winner', and it must not survive."""
    fired = 0
    for seed in range(12):
        res = B.best_of_k(_arms(5, 800, better=0.0, seed=seed), permutations=400)
        if res["survives"]:
            fired += 1
    assert fired <= 2, (
        f"{fired}/12 no-skill panels produced a surviving winner — the null is "
        "too loose and would launder a coin flip."
    )


def test_the_free_margin_over_the_field_GROWS_with_K():
    """The whole point of the statistic, and the inversion the first version of
    best_of_k.py had backwards."""
    cal = json.loads(ARTIFACT.read_text())["calibration_field_sd1"]
    at_500 = [cal[f"k={k}"]["n=500"] for k in (2, 3, 5, 8, 10, 15, 20)]
    assert at_500 == sorted(at_500), at_500
    assert at_500[-1] > 2 * at_500[0], at_500


def test_the_runner_up_margin_SHRINKS_with_K_and_is_kept_as_secondary():
    """Both statistics ship; a reader must not confuse them."""
    cal = json.loads(ARTIFACT.read_text())["calibration_runner_up_sd1"]
    at_500 = [cal[f"k={k}"]["n=500"] for k in (2, 3, 5, 8, 10, 15, 20)]
    assert at_500 == sorted(at_500, reverse=True), at_500


def test_it_refuses_arms_scored_on_different_rows():
    """Comparing arms on different populations is the defect this repo keeps
    finding; here it is an error rather than a silently smaller number."""
    bad = {"a": [1.0, 2.0, 3.0], "b": [1.0, 2.0]}
    with pytest.raises(ValueError, match="SAME rows"):
        B.best_of_k(bad)
    with pytest.raises(ValueError, match="at least two"):
        B.best_of_k({"a": [1.0, 2.0]})


def test_the_calibration_scales_with_the_error_sd():
    """It is published per unit of sd, so a study can multiply. If that scaling
    is not linear the published table cannot be used the way it says."""
    one = B.expected_margin(5, 500, sd=1.0, draws=200)
    two = B.expected_margin(5, 500, sd=2.0, draws=200)
    assert two == pytest.approx(2 * one, rel=0.15), (one, two)
