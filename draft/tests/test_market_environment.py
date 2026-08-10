"""Signal B — the environment gap, with the known-answer case stated as arithmetic.

The expected values are hand-computed and written out here so they can be checked
without running anything, rather than copied from the implementation (which would
assert only that the code agrees with itself):

    total 48.5, favourite by 4.5
      48.5 / 2 = 24.25
      favourite 24.25 + 4.5/2 = 24.25 + 2.25 = 26.5
      underdog  24.25 - 4.5/2 = 24.25 - 2.25 = 22.0
      and 26.5 + 22.0 = 48.5, which is the conservation check

This is the whole of Signal B's input side. No props, no scoring conversion, no
coverage artifact — which is why it is first.
"""
import sys
from pathlib import Path

import pytest

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "backtest"))

import market_environment as E  # noqa: E402


# ── the known-answer case ───────────────────────────────────────────────────
def test_the_worked_example_from_the_brief():
    s = E.implied_team_totals(48.5, 4.5)
    assert s["favourite"] == 26.5 and s["underdog"] == 22.0


def test_the_two_sides_sum_to_the_game_total():
    """Arithmetic conservation: if these do not sum to the total, the split is
    wrong however plausible each half looks."""
    for total, spread in ((48.5, 4.5), (41.0, 0.0), (54.5, 13.5), (37.5, 2.5)):
        s = E.implied_team_totals(total, spread)
        assert E.conserves(s), (total, spread, s)


def test_a_pick_em_splits_evenly():
    s = E.implied_team_totals(44.0, 0.0)
    assert s["favourite"] == 22.0 and s["underdog"] == 22.0


# ── refusals: a sign convention is never guessed ────────────────────────────
def test_a_negative_spread_is_REFUSED_not_flipped():
    """Silently flipping it swaps which team the gap is measured against — a sign
    error that yields two plausible numbers and no error anywhere."""
    s = E.implied_team_totals(48.5, -4.5)
    assert s["ok"] is False and "negative spread" in s["why"]


def test_a_missing_input_is_a_refusal_not_a_zero():
    assert E.implied_team_totals(None, 4.5)["ok"] is False
    assert E.implied_team_totals(48.5, None)["ok"] is False


def test_a_non_positive_total_is_refused():
    assert E.implied_team_totals(0, 3)["ok"] is False


# ── the gap, and its direction ──────────────────────────────────────────────
def test_gap_direction_is_model_minus_market():
    """Fixed here so no caller re-derives it. Positive = our model expects MORE."""
    g = E.environment_gap(27.0, 22.0)
    assert g["gap_points"] == 5.0 and g["direction"] == "model_higher"


def test_underweighting_an_offence_shows_as_NEGATIVE():
    """The brief's case: we project 21, the market implies 27.5."""
    g = E.environment_gap(21.0, 27.5)
    assert g["gap_points"] == -6.5 and g["direction"] == "model_lower"


def test_a_zero_market_total_gives_no_percentage_rather_than_infinity():
    assert E.environment_gap(21.0, 0)["gap_pct"] is None


# ── the observation record ──────────────────────────────────────────────────
def _obs(**kw):
    args = dict(team="BAL", opponent="CIN", total=48.5, spread=4.5, is_favourite=True,
                model_team_points=21.0, captured_at="2026-09-05T12:00:00Z",
                source="odds-api.io/draftkings")
    args.update(kw)
    return E.observation(**args)


def test_an_observation_carries_the_full_derivation():
    o = _obs()
    assert o["market_team_points"] == 26.5
    assert o["gap_points"] == round(21.0 - 26.5, 2)
    assert o["source"] and o["captured_at"]


def test_the_underdog_side_uses_the_other_half():
    assert _obs(is_favourite=False)["market_team_points"] == 22.0


def test_a_capture_TIMESTAMP_IS_REQUIRED():
    """Signal C is meaningless without it, and a Signal-B record with no capture
    time can never become the first half of a movement pair."""
    with pytest.raises(ValueError):
        _obs(captured_at=None)
    with pytest.raises(ValueError):
        _obs(captured_at="")


def test_every_record_is_labelled_read_only_and_post_draft():
    o = _obs()
    assert o["read_only"] is True and o["visibility"] == "post_draft_only"


def test_a_bad_line_produces_a_refusal_record_not_a_number():
    o = _obs(spread=-3)
    assert o["ok"] is False and "negative spread" in o["why"]


# ── the naming rule, enforced ───────────────────────────────────────────────
def test_nothing_here_claims_market_implied_FANTASY_points():
    """That term is reserved for a value whose every component is priced. Team
    points are fully priced by the total and spread; a props-derived number is
    not, and must be called a COMPONENT EXPECTATION instead."""
    # STRIP DOCSTRINGS AND COMMENTS FIRST. The first cut of this guard failed on
    # the module's OWN prose explaining the rule — the same shape as a guard that
    # passes because it matched a comment, just pointing the other way. Only
    # executable text can violate a naming rule.
    import ast
    src_path = HERE.parent / "backtest" / "market_environment.py"
    tree = ast.parse(src_path.read_text())
    for node in ast.walk(tree):
        if isinstance(node, (ast.Module, ast.FunctionDef, ast.ClassDef)) \
                and ast.get_docstring(node) is not None:
            node.body = node.body[1:]
    code = ast.unparse(tree).lower()
    assert "fantasy" not in code, "the module names a fantasy quantity in code"
    for k in _obs():
        assert "fantasy" not in k
