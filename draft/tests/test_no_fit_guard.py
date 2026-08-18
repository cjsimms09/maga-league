# TERRITORY: A
"""THE NO-FITTING RULE MUST REFUSE, NOT WARN. BREAK IT AND WATCH.

EVIDENCE CLASS: CORRECTNESS of an enforcement mechanism. It establishes that the
guard refuses the shapes §11 forbids. It establishes NOTHING about whether any
particular mechanism sentence is true — no code can do that, and the guard's own
docstring says so.

Cory: *"do not fit!!!! ENFORCE IT!!!!"* — so the rule lives in code that raises,
written BEFORE the harness exists, so the harness must be built through it
rather than around it.

── WHY A GUARD AND NOT A DOCUMENT ─────────────────────────────────────────────

§11 already states the rule in prose. This project has now established FOUR
separate times — the ledger KINDS omissions — that remembering is not a
mechanism. A test is.

── THE HONEST LIMIT, ASSERTED RATHER THAN CLAIMED ─────────────────────────────

The mechanism check is a keyword screen. It raises the cost of laundering a
score into a sentence; it cannot stop a determined author, and
test_a_determined_author_can_still_defeat_the_screen proves that on purpose. A
guard whose limits are asserted is honest; one whose limits are only mentioned
in a comment is decorative.
"""
import pathlib
import sys

import pytest

ROOT = pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "draft" / "backtest"))

from no_fit_guard import (  # noqa: E402
    FittingRefused, ReplayResult, record, summarise, validate_mechanism,
)


def _r(**kw):
    base = dict(label="TOOL vs BASELINE", arm="full-system",
                seasons=[2023, 2024, 2025], value=42.0, configs_tried=1)
    base.update(kw)
    return ReplayResult(**base)


# ── CONTROL: the sanctioned path works, or every refusal below is vacuous ──

def test_control_a_plain_pre_declared_result_is_accepted():
    art = record(_r())
    assert art["configs_tried"] == 1
    assert art["evidence_class"].startswith("PRE-DECLARED")
    assert art["may_change_production"] is False


def test_control_a_diagnostic_sweep_is_accepted_and_LABELLED_as_one():
    """A sweep is allowed. What is refused is PROMOTING from it."""
    art = record(_r(configs_tried=10000))
    assert art["evidence_class"].startswith("DIAGNOSTIC")
    assert "not a selection" in art["evidence_class"]


# ── THE FOUR REFUSALS ─────────────────────────────────────────────────────

def test_REFUSES_promotion_with_no_mechanism():
    with pytest.raises(FittingRefused, match="NO MECHANISM"):
        record(_r(promotable=True))


def test_REFUSES_promotion_selected_from_a_search():
    with pytest.raises(FittingRefused, match="PROMOTION FROM A SEARCH"):
        record(_r(promotable=True, selected_from_search=True,
                  mechanism="The bye guard reads a field the replay never "
                            "populates, so a player on bye was startable."))


def test_REFUSES_promotion_after_many_configurations():
    with pytest.raises(FittingRefused, match="PROMOTION AFTER TRYING"):
        record(_r(promotable=True, configs_tried=10000,
                  mechanism="The bye guard reads a field the replay never "
                            "populates, so a player on bye was startable."))


@pytest.mark.parametrize("bad", [0, -1, None, "3", 1.5])
def test_REFUSES_a_result_that_does_not_declare_configs_tried(bad):
    """No default is allowed. A default would silently read 1 for a search of
    ten thousand, which is the precise lie the rule forbids."""
    with pytest.raises(FittingRefused, match="configs_tried"):
        record(_r(configs_tried=bad))


# ── THE ONE THAT MATTERS MOST: the score wearing a sentence ───────────────

@pytest.mark.parametrize("fit_talk", [
    "Config 4712 scored best across the three seasons.",
    "This configuration performed better and won more money overall.",
    "It produced the highest total and outperformed every other setting.",
])
def test_REFUSES_a_mechanism_that_merely_restates_the_score(fit_talk):
    with pytest.raises(FittingRefused):
        validate_mechanism(fit_talk)


@pytest.mark.parametrize("real", [
    "Week 9 started a player on bye because the bye guard reads a field the "
    "replay never populates.",
    "The waiver arm compared rest-of-season projections against a denominator "
    "that counted only rostered players, so free agents were never eligible.",
    "adjusted_adp counts selections and pick_no counts board slots, so the "
    "delta was off by the number of keeper slots before that pick.",
])
def test_ACCEPTS_a_mechanism_that_names_a_cause(real):
    assert validate_mechanism(real) == real.strip()


def test_REFUSES_a_mechanism_too_short_to_say_anything():
    with pytest.raises(FittingRefused, match="TOO SHORT"):
        validate_mechanism("bug in the bye guard")


def test_REFUSES_a_long_sentence_that_names_no_cause():
    with pytest.raises(FittingRefused, match="NAMES NO CAUSE"):
        validate_mechanism(
            "We looked at this carefully over several sessions and formed the "
            "considered view that this setting is the one we ought to adopt.")


# ── THE GUARD'S OWN LIMIT, ASSERTED SO IT IS NOT OVERSOLD ────────────────

def test_a_determined_author_can_still_defeat_the_screen():
    """DELIBERATE. The check is a keyword screen and its job is to raise the
    cost of laundering a number, not to make it impossible. Anyone reading this
    suite should know the guard's reach exactly, so it is never cited as proof
    that a mechanism is sound. THAT judgement is a reviewer's — human or the
    independent reviewer — and this is precisely the class of claim it exists
    to attack: a sentence shaped like a cause, asserting an outcome."""
    laundered = ("Config 4712 is preferable because the ordering it produces "
                 "reads more sensibly to me across the seasons examined.")
    assert validate_mechanism(laundered) == laundered  # accepted, and it is weak
    # The point of the assertion is that it PASSES. If a future tightening makes
    # it fail, that is an improvement — update this test and say what changed.


# ── THE CAVEAT CANNOT BE LOST BY QUOTING THE NUMBER ALONE ────────────────

def test_the_config_count_rides_on_the_artifact_and_the_summary():
    arts = [record(_r(label="A", configs_tried=1)),
            record(_r(label="B", configs_tried=10000))]
    out = summarise(arts)
    assert "configs=1" in out and "configs=10000" in out
    assert "DIAGNOSTIC" in out and "PRE-DECLARED" in out
    for a in arts:
        assert "evidence_class" in a and "may_change_production" in a
