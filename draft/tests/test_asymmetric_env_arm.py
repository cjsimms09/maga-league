# TERRITORY: D
"""THE PLACEBO IS WHAT MAKES THIS ARM'S POSITIVE READABLE, SO IT IS PINNED.

DEFECT GUARDED: the preregistered bar passed BOTH arms of this study. A
negative control the prereg did not require then killed one outright
(game_total, p=0.377) and cut the other by 59% (team_implied, +0.0832 ->
+0.0343 net).

So the artifact must never be read without it. These guards fail if:
  - a verdict is quoted while the oracle gate did not pass;
  - an arm is called real without beating its own placebo p95;
  - the placebo is thinned to fewer draws than the write-up claims;
  - the null arm quietly turns into a finding.

Everything here is pure logic over one committed artifact -- no regeneration,
no board, no repo state -- so it belongs INSIDE the publication gate.

draft/audit/asymmetric_env_arm_2026-08-18.md
Run: python -m pytest draft/tests/test_asymmetric_env_arm.py -q
"""
from __future__ import annotations

import json
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
ARTIFACT = ROOT / "draft" / "backtest" / "asymmetric_env_arm.json"

#: The verdict this repo's prose is allowed to carry, per arm. Changing an
#: entry here is a deliberate act; drifting into it is not.
EXPECTED = {
    "game_total": {"real": False, "reason": "does not beat its own placebo p95"},
    "team_implied": {"real": True, "reason": "p=0.0164, net of placebo +0.0343"},
}

MIN_PLACEBO_DRAWS = 60
MIN_JOIN_SURVIVAL = 0.90


def _doc() -> dict:
    return json.loads(ARTIFACT.read_text())


def test_the_oracle_gate_passed():
    """A VOID run may not be reported as a finding.

    The gate is the known-positive: identical machinery on the signal 18b
    already measured a large asymmetry in. Without it a null here says nothing.
    """
    doc = _doc()
    gate = doc["gate_control"]
    assert gate["passed"], gate
    assert gate["fits_low_above_high"], gate
    assert gate["beats_symmetric_out_of_sample"], gate
    assert doc["status"] == "graded", doc["status"]


def test_every_arm_carries_a_placebo_of_the_declared_size():
    """A thinner placebo is an easier one."""
    for arm, d in _doc()["arms"].items():
        assert "placebo" in d, arm
        assert d["placebo"]["draws"] >= MIN_PLACEBO_DRAWS, (arm, d["placebo"])


@pytest.mark.parametrize("arm", sorted(EXPECTED))
def test_each_arms_verdict_matches_its_placebo(arm):
    """The claim in the audit doc, re-derived from the artifact beside it."""
    placebo = _doc()["arms"][arm]["placebo"]
    assert placebo["beats_p95"] is EXPECTED[arm]["real"], (
        f"{arm}: placebo says beats_p95={placebo['beats_p95']}, the write-up "
        f"says real={EXPECTED[arm]['real']} ({EXPECTED[arm]['reason']}). "
        "See draft/audit/asymmetric_env_arm_2026-08-18.md."
    )


def test_the_null_arm_is_still_a_null():
    """KNOWN-NEGATIVE CONTROL — game_total is the proof the harness can fail.

    If this ever goes real, the machinery stopped being able to produce a null
    and every positive it reports needs re-examining before it is believed.
    """
    placebo = _doc()["arms"]["game_total"]["placebo"]
    assert placebo["p_value"] > 0.05, placebo
    assert placebo["gain_net_of_placebo"] < 0.010, placebo


def test_the_prereg_bar_alone_would_have_passed_both_arms():
    """The methodological finding, pinned so it cannot be softened later.

    This is the study's most transferable result: a preregistered bar with a
    magnitude, out-of-sample and 5 of 5 positive, still passed an arm with no
    information in it.
    """
    arms = _doc()["arms"]
    for arm in EXPECTED:
        verdict = arms[arm]["all_five_seasons"]["verdict"]
        assert verdict["clears"] is True, (arm, verdict)


def test_the_join_was_counted_and_survived():
    """Absent stays absent -- a null (or a positive) over an unknown population
    is not a finding. Register 18 is why this is checked rather than assumed."""
    for arm, d in _doc()["arms"].items():
        for season, pop in d["population"].items():
            assert pop["join_survival"] >= MIN_JOIN_SURVIVAL, (arm, season, pop)
            assert pop["fold_valid"], (arm, season, pop)
            assert pop["joined"] + pop["dropped_no_team"] + pop["dropped_no_line"] \
                == pop["eligible_rows"], (arm, season, pop)


def test_only_out_of_sample_numbers_carry_a_verdict():
    """The leak protocol is the design; in-sample cells are labelled and must
    never acquire a verdict key."""
    for arm, d in _doc()["arms"].items():
        assert "in_sample" in d, arm
        assert "verdict" not in d["in_sample"], arm
        assert "clears" not in json.dumps(d["in_sample"]), arm
        for block in ("primary_2023_25", "all_five_seasons"):
            for season, fold in d[block]["leave_one_out"].items():
                assert int(season) not in fold["fitted_on"], (arm, season, fold)
