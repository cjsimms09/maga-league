"""Derived evidence weighting — pure, no egress. Proves the weight is a FUNCTION of
precision and measured transferability, that league gains weight as its interval tightens,
that external is discounted by measured (not assumed) transferability, and that the
crossover is computed per question.

Run: python -m pytest draft/tests/test_evidence_weight.py -q
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backtest"))
import evidence_weight as W  # noqa: E402


def test_precision_and_se_from_ci():
    assert W.precision(0.5) == 4.0
    assert W.precision(0.25) == 16.0        # tighter se -> more precision
    assert W.precision(0) == 0.0 and W.precision(None) == 0.0
    se = W.se_from_ci(0.0, 3.92)
    assert abs(se - 1.0) < 1e-9


def test_league_gains_weight_as_its_interval_tightens():
    ext = {"estimate": 1.0, "se": 0.05, "n": 1_000_000}     # huge external n, tiny se
    # thin league (wide se): external dominates
    thin = W.combine({"estimate": 0.0, "se": 1.0, "n": 27}, ext, transferability=0.9)
    # rich league (tight se): league should gain a lot of weight
    rich = W.combine({"estimate": 0.0, "se": 0.1, "n": 500}, ext, transferability=0.9)
    assert rich["weights"]["league"] > thin["weights"]["league"]


def test_transferability_discounts_external_and_is_measured():
    league = {"estimate": 0.0, "se": 0.3, "n": 27}
    ext = {"estimate": 1.0, "se": 0.05, "n": 1_000_000}
    hi = W.combine(league, ext, transferability=0.9)
    lo = W.combine(league, ext, transferability=0.2)
    assert hi["weights"]["external"] > lo["weights"]["external"]   # transfers well -> more weight
    # measured from checks, not assumed
    checks = [{"predicted_dir": 1, "our_dir": 1}, {"predicted_dir": 1, "our_dir": 1},
              {"predicted_dir": -1, "our_dir": 1}, {"predicted_dir": 0, "our_dir": 0}]
    t = W.measured_transferability(checks)
    assert t == round(2 / 3, 3)             # 2 of 3 gradeable directions agreed


def test_unchecked_source_is_a_flagged_placeholder_not_full_weight():
    league = {"estimate": 0.0, "se": 0.3, "n": 27}
    ext = {"estimate": 1.0, "se": 0.05, "n": 1_000_000}
    c = W.combine(league, ext, transferability=None)
    assert c["transferability_is_placeholder"] is True
    # even a huge-n external source, unchecked, does not simply dominate on precision alone
    assert c["transferability"] is None


def test_crossover_is_computed_per_question():
    ext = {"se": 0.05}
    # a well-transferring external source needs our interval very tight to be overtaken;
    # a poorly-transferring one is overtaken sooner (larger allowable league se)
    se_needed_hi_t = W.crossover_se(ext, transferability=0.9)
    se_needed_lo_t = W.crossover_se(ext, transferability=0.2)
    assert se_needed_lo_t > se_needed_hi_t


def test_trajectory_appends_a_row():
    league = {"estimate": 0.0, "se": 0.3, "n": 27}
    ext = {"estimate": 1.0, "se": 0.05, "n": 1_000_000}
    c = W.combine(league, ext, transferability=0.5)
    log = W.append_trajectory([], "2026-01", c)
    log = W.append_trajectory(log, "2027-01", c)
    assert len(log) == 2 and log[0]["stamp"] == "2026-01"
    assert "weights" in log[0]
