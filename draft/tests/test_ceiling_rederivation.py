# TERRITORY: A
"""THE CEILING RE-DERIVATION, AND THE SUMMARISER THAT ALMOST BURIED IT.

`exp_ceiling_replicate.py` re-ran on 2026-08-17 against the first board in this
project's history whose `proj_ceiling` was not `proj_mean x a constant`
(CEILING-REDERIVATION-PREREG.md). Its verdict function had two defects that only
a result could expose:

  1. it scored the whole experiment on the `w=1.0` column ALONE, and on the fixed
     board the column that clears the preregistered bar is `w=0.65` — so the
     honest reading ("replicates, separable in 3/3") would have been published as
     "leans positive, separable in only 1/3";
  2. every branch spoke of "the live ceiling weight 0.65", while
     MEASURED_WEIGHTS.ceiling is and was 0.0. "Keep 0.65" named a setting that
     does not exist.

The judgement was reachable only through a 3.5-minute simulation, so the branch
that decides whether a weight ships had never run against a case it should
REFUSE. That is why `summarise()` is a function now, and why this file drives all
four of its branches directly.

Run: python3 -m pytest draft/tests/test_ceiling_rederivation.py
"""
from __future__ import annotations
import json
import os
import sys

import pytest

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE)) if os.path.basename(HERE) != "tests" else \
    os.path.dirname(os.path.dirname(HERE))
BACKTEST = os.path.join(os.path.dirname(HERE), "backtest")
sys.path.insert(0, BACKTEST)

import exp_ceiling_replicate as E  # noqa: E402

RESULT = os.path.join(BACKTEST, "exp_ceiling_replicate.json")
DOC = os.path.join(BACKTEST, "EXP-CEILING-REPLICATE.md")
ARCHIVE = os.path.join(BACKTEST, "archive_exp_ceiling_replicate_pre_dispersion_fix.json")


def row(seed, **cells):
    """cells: {"0.65": (edge, separable), ...} -> a per_seed record."""
    out = {"seed": seed}
    for w, (edge, sep) in cells.items():
        out[f"w{w}"] = {"edge": edge, "ci95": [0.0, 0.0], "separable": sep}
    return out


def three(**per_weight):
    """per_weight: {"0.65": [(edge,sep)]*3, ...} -> three seed rows."""
    return [row(i, **{w: vals[i] for w, vals in per_weight.items()}) for i in range(3)]


# ----------------------------------------------------------------- the branches
def test_replicates_names_the_column_that_actually_cleared_the_bar():
    """The real shape: the winner is NOT w=1.0, which the old logic could not see."""
    ps = three(**{"0.65": [(28, True), (52, True), (27, True)],
                  "1.0": [(14, False), (41, True), (9, False)],
                  "1.5": [(16, False), (35, True), (9, False)]})
    verdict, cols = E.summarise(ps)
    assert verdict.startswith("REPLICATES at w=0.65"), verdict
    assert cols[0.65]["n_sep"] == 3 and cols[1.0]["n_sep"] == 1


def test_the_old_one_column_logic_would_have_reported_the_opposite():
    """CONTROL FOR THE FIX ITSELF. Not a hypothetical: this is the old rule, run
    on the real data, and it must disagree — otherwise the correction changed
    nothing and the commit claiming it did is wrong."""
    ps = three(**{"0.65": [(28, True), (52, True), (27, True)],
                  "1.0": [(14, False), (41, True), (9, False)],
                  "1.5": [(16, False), (35, True), (9, False)]})
    w1 = [s["w1.0"] for s in ps]
    old_all_pos = all(x["edge"] > 0 for x in w1)
    old_n_sep = sum(1 for x in w1 if x["separable"])
    old_says_replicates = old_all_pos and old_n_sep >= 2
    assert old_says_replicates is False          # the old rule: "leans positive"
    assert E.summarise(ps)[0].startswith("REPLICATES")


def test_edge_of_grid_is_declared_when_the_winner_is_the_smallest_tested():
    ps = three(**{"0.65": [(28, True), (52, True), (27, True)],
                  "1.0": [(14, False), (41, True), (9, False)],
                  "1.5": [(16, False), (35, True), (9, False)]})
    assert "DOES NOT BRACKET THE OPTIMUM" in E.summarise(ps)[0]


def test_no_edge_of_grid_claim_when_the_winner_is_interior():
    """The warning must DISCRIMINATE. A message that fires on every replication
    is decoration, not information."""
    ps = three(**{"0.65": [(5, False), (4, False), (6, False)],
                  "1.0": [(30, True), (28, True), (31, True)],
                  "1.5": [(9, False), (8, False), (7, False)]})
    verdict, _ = E.summarise(ps)
    assert verdict.startswith("REPLICATES at w=1.0"), verdict
    assert "DOES NOT BRACKET" not in verdict


def test_leans_when_positive_everywhere_but_rarely_separable():
    ps = three(**{"0.65": [(5, False), (4, False), (6, False)],
                  "1.0": [(9, False), (8, True), (7, False)],
                  "1.5": [(3, False), (2, False), (1, False)]})
    verdict, _ = E.summarise(ps)
    assert verdict.startswith("LEANS positive"), verdict
    assert "the shipped 0.0 stands" in verdict


def test_unsignable_when_any_sign_flips():
    ps = three(**{"0.65": [(28, True), (-52, True), (27, True)],
                  "1.0": [(-14, False), (41, True), (9, False)],
                  "1.5": [(16, False), (-35, True), (9, False)]})
    verdict, _ = E.summarise(ps)
    assert verdict.startswith("UNSIGNABLE"), verdict
    assert "The shipped 0.0 stands" in verdict
    # A negative mean must read "-$3.3", never "+$-3.3". The failure branch is
    # the one nobody proofreads, so it is the one worth pinning.
    assert "+$-" not in verdict, verdict
    assert "-$3.3" in verdict, verdict


def test_a_favourable_seed_cannot_carry_a_column_on_its_own():
    """Seed-shopping is the failure mode the prereg named. One huge separable
    seed beside two negatives must not clear the bar."""
    ps = three(**{"0.65": [(999, True), (-1, False), (-2, False)],
                  "1.0": [(999, True), (-1, False), (-2, False)],
                  "1.5": [(999, True), (-1, False), (-2, False)]})
    assert E.summarise(ps)[0].startswith("UNSIGNABLE")


def test_the_live_weight_quoted_is_the_one_engine_js_ships():
    """The defect that made 'keep 0.65' readable as reassurance. Read the engine
    rather than trusting a second literal."""
    src = open(os.path.join(os.path.dirname(os.path.dirname(HERE)),
                            "public", "js", "draft", "engine.js"), encoding="utf8").read()
    i = src.index("const MEASURED_WEIGHTS")
    block = src[i:i + 200]
    assert "ceiling: 0.0" in block, block
    assert E.LIVE_CEILING_WEIGHT == 0.0


# ------------------------------------------------------------- the stored result
def test_the_stored_verdict_is_derived_not_written():
    """The artifact's verdict must recompute from its own per_seed. A verdict
    edited by hand after the fact is the thing preregistration exists to stop."""
    d = json.load(open(RESULT))
    assert E.summarise(d["per_seed"])[0] == d["verdict"]


def test_the_result_is_stamped_with_a_non_degenerate_board():
    """1 distinct ceiling/mean ratio VOIDS the experiment regardless of verdict —
    a constant-multiple ceiling is rank-identical to proj_mean, so the run cannot
    separate the ceiling weight from the value weight."""
    d = json.load(open(RESULT))
    assert d["board_distinct_ceiling_ratios"] > 1, d["board_distinct_ceiling_ratios"]


def test_the_archived_pre_fix_run_is_kept_and_is_distinguishable():
    """The comparison is the point, and the script overwrites its own outputs."""
    old = json.load(open(ARCHIVE))
    new = json.load(open(RESULT))
    assert old["per_seed"] != new["per_seed"]
    assert old["seeds"] == new["seeds"], "same seeds, or it is not a like-for-like comparison"


# --------------------------------------------------------------- the bracket run
BRACKET = os.path.join(BACKTEST, "exp_ceiling_bracket.json")


def test_the_bracket_run_passed_its_anchor_control():
    """The bracket carries w=0.65 over from the re-derivation and must reproduce
    its edges exactly. A flat grid produced by a DRIFTED instrument looks the
    same as a flat grid produced by a flat effect; this is the only thing that
    tells them apart, so the artifact may not be trusted without it."""
    d = json.load(open(BRACKET))
    assert d["anchor_control"]["reproduced"] is True, d["anchor_control"]


def test_the_bracket_anchor_matches_the_published_rederivation_edges():
    """And the control's target must be the number actually published, not a
    value quietly relaxed to make the control pass."""
    b = json.load(open(BRACKET))
    r = json.load(open(RESULT))
    published = {s["seed"]: s["w0.65"]["edge"] for s in r["per_seed"]}
    expected = {int(k): v for k, v in b["anchor_control"]["expected"].items()}
    assert expected == published, {"control_targets": expected, "published": published}


def test_every_non_zero_weight_in_the_bracket_beats_the_shipped_zero():
    """The claim the write-up rests on: it is a zero-versus-non-zero result, not
    a claim about which non-zero value."""
    d = json.load(open(BRACKET))
    for w, c in d["columns"].items():
        assert c["n_pos"] == 3, (w, c)
        assert c["n_sep"] == 3, (w, c)


def test_the_flat_plateau_is_genuinely_within_noise():
    """Guards the write-up's refusal to name an optimum. If 0.30/0.45/0.65 ever
    separate by more than a fraction of their own CI width, 'indistinguishable'
    stops being true and the prose must change with it."""
    d = json.load(open(BRACKET))
    means = [d["columns"][w]["mean"] for w in ("0.3", "0.45", "0.65")]
    spread = max(means) - min(means)
    widths = [s[f"w{w}"]["ci95"][1] - s[f"w{w}"]["ci95"][0]
              for s in d["per_seed"] for w in ("0.3", "0.45", "0.65")]
    typical = sorted(widths)[len(widths) // 2]
    assert spread < 0.1 * typical, {"spread": spread, "typical_ci_width": typical}


def test_the_bracket_is_stamped_with_a_non_degenerate_board():
    d = json.load(open(BRACKET))
    assert d["board_distinct_ceiling_ratios"] > 1, d["board_distinct_ceiling_ratios"]


def test_the_bracket_verdict_is_derived_not_written():
    d = json.load(open(BRACKET))
    assert E.summarise(d["per_seed"], weights=d["weights"])[0] == d["verdict"]


def test_adding_grid_arms_cannot_move_an_arm_they_share():
    """The property the anchor control depends on, asserted against the code
    rather than inferred from the two runs agreeing: every room's RNG state is a
    function of (seed, room) only. If `race` ever derives a state from the arm
    set, the control silently becomes a tautology."""
    import inspect
    src = inspect.getsource(E.race)
    assert "random.Random(seed + s)" in src
    assert "random.Random(seed * 7 + s)" in src
    # and the states are taken BEFORE the per-arm loop, not inside it
    assert src.index("grade_state = ") < src.index("for k, ch in arms.items()")


@pytest.mark.parametrize("w", ["0.65", "1.0", "1.5"])
def test_the_generated_doc_matches_the_stored_numbers(w):
    d = json.load(open(RESULT))
    doc = open(DOC, encoding="utf8").read()
    for s in d["per_seed"]:
        assert f"{s[f'w{w}']['edge']:+.0f}" in doc
    assert str(d["board_distinct_ceiling_ratios"]) in doc
