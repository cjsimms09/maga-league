# TERRITORY: A
"""Gates for the position-weight transfer study.

Prereg: draft/backtest/POSITION-WEIGHT-TRANSFER-PREREG.md (committed first).
Verdict: draft/audit/position_weight_transfer_2026-08-17.md.

EVERY GATE HERE IS TWO-ARMED. A test that can only pass is not a gate — this
study's whole claim is that it would have found a positive if one existed, so
each mechanism is shown refusing as well as accepting.
"""
import json
import random
import sys
from pathlib import Path

import pytest

BT = Path(__file__).resolve().parents[1] / "backtest"
sys.path.insert(0, str(BT))
import position_weight_transfer as PWT  # noqa: E402

ARTIFACT = BT / "position_weight_transfer.json"


# ── the licence: parity with the committed probe ────────────────────────────

def test_the_licence_accepts_an_exact_reproduction():
    want = {"a": {"1": 1.0, "2": 2.0}, "b": {"1": 3.0}}
    got = {"a": {"1": 1.0, "2": 2.0}, "b": {"1": 3.0}}
    d = PWT.diff_models(want, got, {"1": 9.0}, {"1": 9.0})
    assert d["exact"] and d["disagreements"] == 0 and d["values_compared"] == 3


def test_the_licence_refuses_a_value_that_drifted():
    want = {"a": {"1": 1.0}}
    got = {"a": {"1": 1.0 + 1e-6}}
    d = PWT.diff_models(want, got, {"1": 9.0}, {"1": 9.0})
    assert not d["exact"], "a drifted value must fail the licence, not round away"


def test_the_licence_refuses_a_changed_population():
    # The subtler failure: same values, different players. A study built on a
    # different population is a different study.
    d = PWT.diff_models({"a": {"1": 1.0}}, {"a": {"1": 1.0, "2": 5.0}},
                        {"1": 9.0}, {"1": 9.0})
    assert not d["exact"]
    d2 = PWT.diff_models({"a": {"1": 1.0}}, {"a": {"1": 1.0}},
                         {"1": 9.0}, {"1": 9.0, "2": 4.0})
    assert not d2["exact"], "a changed GRADED population must fail too"


def test_the_licence_refuses_a_missing_arm():
    d = PWT.diff_models({"a": {"1": 1.0}, "b": {"1": 1.0}}, {"a": {"1": 1.0}},
                        {"1": 9.0}, {"1": 9.0})
    assert not d["exact"]


# ── the weighting itself ────────────────────────────────────────────────────

def test_inverse_mse_weight_favours_the_more_accurate_arm():
    # A is exactly twice as accurate as B in RMSE -> 4x in MSE -> w = 4/5.
    rows = [(y + 1.0, y + 2.0, float(y)) for y in range(50)]
    w = PWT.inverse_mse_weight(rows)
    assert w is not None and abs(w - 0.8) < 1e-9


def test_inverse_mse_weight_is_symmetric_when_the_arms_are_equally_wrong():
    rows = [(y + 1.0, y - 1.0, float(y)) for y in range(50)]
    assert abs(PWT.inverse_mse_weight(rows) - 0.5) < 1e-9


def test_inverse_mse_weight_refuses_a_degenerate_fit_rather_than_returning_one():
    # A zero MSE means an arm reproduced the answer exactly — a data defect, not
    # a weight of 1.0. Returning 1.0 here would silently ship the leak.
    perfect = [(float(y), y + 3.0, float(y)) for y in range(50)]
    assert PWT.inverse_mse_weight(perfect) is None
    assert PWT.inverse_mse_weight([]) is None


# ── the negative control has to actually be a control ───────────────────────

def test_the_shuffle_has_no_fixed_point():
    """If any position mapped to itself, that cell's 'control' would be the real
    arm and the control would silently agree with what it is meant to falsify."""
    assert set(PWT.SHUFFLE) == set(PWT.POSITIONS)
    assert set(PWT.SHUFFLE.values()) == set(PWT.POSITIONS)
    assert all(k != v for k, v in PWT.SHUFFLE.items())


# ── the bootstrap ───────────────────────────────────────────────────────────

def _cells_where_x_is_better():
    """Rigged: arm A is the truth plus small noise, B is near-useless. A scheme
    weighting A heavily must beat one weighting B heavily, in every position."""
    rng = random.Random(7)
    cells = {}
    for pos in PWT.POSITIONS:
        n = 60
        truth = [float(i) for i in range(n)]
        a = [t + rng.uniform(-1, 1) for t in truth]
        b = [rng.uniform(0, n) for _ in truth]
        cells[pos] = ([str(i) for i in range(n)], a, b, truth)
    return cells


def test_bootstrap_detects_a_real_difference_and_excludes_zero():
    cells = _cells_where_x_is_better()
    heavy_a = {p: 0.95 for p in PWT.POSITIONS}
    heavy_b = {p: 0.05 for p in PWT.POSITIONS}
    got = PWT.paired_bootstrap(cells, heavy_a, heavy_b, random.Random(1))
    assert got["delta"] > 0 and got["excludes_zero"], got


def test_bootstrap_reports_no_difference_when_the_schemes_are_identical():
    cells = _cells_where_x_is_better()
    same = {p: 0.6 for p in PWT.POSITIONS}
    got = PWT.paired_bootstrap(cells, same, dict(same), random.Random(1))
    assert got["delta"] == 0.0 and not got["excludes_zero"], got


# ── FDR ─────────────────────────────────────────────────────────────────────

def test_bh_keeps_a_real_signal_and_drops_pure_noise():
    keep = PWT.benjamini_hochberg([0.0001, 0.0002, 0.4, 0.6, 0.9])
    assert keep[0] and keep[1] and not any(keep[2:])
    assert not any(PWT.benjamini_hochberg([0.3, 0.4, 0.5, 0.6, 0.9]))


# ── the committed artifact ──────────────────────────────────────────────────

@pytest.mark.skipif(not ARTIFACT.exists(), reason="study not run")
class TestArtifact:
    doc = json.loads(ARTIFACT.read_text()) if ARTIFACT.exists() else {}

    def test_the_licence_actually_passed_on_real_data(self):
        lic = self.doc["licence"]
        assert lic["exact"] and lic["disagreements"] == 0
        assert lic["values_compared"] > 1000, (
            "a licence that compared almost nothing is not a licence")

    def test_the_holdout_is_a_season_holdout(self):
        d = self.doc["design"]
        assert d["graded"] == 2025 and sorted(d["fit_seasons"]) == [2023, 2024]
        assert d["graded"] not in d["fit_seasons"], (
            "the graded season must not be one of the fit seasons — that is the "
            "answer key Amendment 2 (b) refused")

    def test_the_headline_pair_is_the_one_the_prereg_declared(self):
        assert sorted(self.doc["design"]["headline_pair"]) == sorted(PWT.HEADLINE_PAIR)
        assert self.doc["headline"]["is_headline"] is True

    def test_the_decision_rule_has_all_three_clauses_on_every_pair(self):
        for p in [self.doc["headline"]] + self.doc["secondary_pairs"]:
            c = p["clauses"]
            assert set(c) == {"wins_ge_3", "ci_excludes_zero_positive",
                              "control_does_not_also_clear"}
            # SUPPORTED iff all three, both directions — so a future edit cannot
            # drop a clause and still call something supported.
            assert (p["verdict"] == "SUPPORTED") == all(c.values())

    def test_the_leaking_arm_is_named_as_leaking_everywhere_it_appears(self):
        for p in [self.doc["headline"]] + self.doc["secondary_pairs"]:
            for cell in p["cells"].values():
                assert "answer_key_LEAKS" in cell, (
                    "the answer-key ceiling must carry its leak in its own key "
                    "name — a reader scanning a table will not consult a footnote")

    def test_every_reported_cell_cleared_min_n(self):
        for p in [self.doc["headline"]] + self.doc["secondary_pairs"]:
            for pos, cell in p["cells"].items():
                assert cell["n"] >= PWT.MIN_N, (pos, cell["n"])

    def test_the_control_is_reported_even_though_it_undercuts_the_idea(self):
        h = self.doc["headline"]
        assert "shuffled_control_wins" in h
        for cell in h["cells"].values():
            assert "shuffled_control" in cell

    def test_nothing_ships(self):
        assert self.doc["ship"]["changes_proj_mean"] is False
        assert self.doc["ship"]["why_no_ship"]

    def test_the_limitations_travel_with_the_artifact(self):
        lims = self.doc["limitations"]
        assert len(lims) >= 6
        joined = " ".join(lims).lower()
        for must in ("sleeper", "correlated", "board_ages", "rebuilt"):
            assert must in joined, f"limitation about {must} was dropped"

    def test_the_published_verdict_is_the_null_the_numbers_support(self):
        # The one gate that pins the ANSWER: if a future rerun turns this
        # positive, this test fails and forces the write-up to be revisited
        # rather than left contradicting its own artifact.
        h = self.doc["headline"]
        assert h["verdict"] == "NULL"
        assert self.doc["ship"]["position_weighting_supported"] is False
        assert self.doc["secondary_fdr_survivors"] == []
