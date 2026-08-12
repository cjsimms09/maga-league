# TERRITORY: C
"""THE FOUR FALSE RESULTS THIS MODULE EXISTS FOR, EACH AS A TEST.

Written break-first: every assertion below is a real wrong answer this lane
produced in a single day, replayed through `verdict()` to show it comes back
UNCOUNTED rather than as the finding it imitated.

Run: python3 -m pytest draft/tests/test_positive_control.py -q
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "backtest"))

import positive_control as PC  # noqa: E402


# ── THE FOUR, REPLAYED ──────────────────────────────────────────────────────
def test_the_worktree_with_no_node_modules_is_UNCOUNTED_not_RED():
    """60+ suites 'failed'. Every one failed to LOAD — a worktree has no
    node_modules. MUTATION: report `state != FOUND` as the finding, which is what
    a reader does by default and what I did."""
    v = PC.verdict(observed=[], control=[], what="passing suites",
                   control_is="a suite known to pass")
    assert v["state"] == PC.UNCOUNTED
    assert not PC.is_reportable_negative(v)


def test_two_concurrent_suite_runs_is_UNCOUNTED():
    """17 suites 'red' because two full runs were racing for ports. The control —
    running one suite alone — passes, which is what makes the 17 meaningless."""
    v = PC.verdict(observed=[], control=["bank_arithmetic passed alone"],
                   what="genuine failures")
    assert v["state"] == PC.ABSENT, "one suite passing alone IS the control"


def test_a_dirty_tree_reporting_REBASE_CONFLICT_is_UNCOUNTED():
    """The harness wrote $GITHUB_OUTPUT inside the repo. No control ran, so the
    'conflict' was a statement about the harness."""
    v = PC.verdict(observed=[], control=None, what="a real rebase conflict")
    assert v["state"] == PC.UNCOUNTED
    assert "COULD NOT LOOK" in v["why"]


def test_git_init_without_main_is_UNCOUNTED():
    """The fast-forward reproduction merged feat into feat because the default
    branch was master. It 'proved' a bug that the setup had manufactured."""
    v = PC.verdict(observed=0, control=0, what="a wrong rollback target")
    assert v["state"] == PC.UNCOUNTED


# ── the contract ────────────────────────────────────────────────────────────
def test_a_NON_EMPTY_observation_is_FOUND_whatever_the_control_says():
    """MUTATION: require the control even when the thing was found. Finding it
    PROVES the instrument works; demanding a control there would refuse real
    results and teach everyone to bypass the function."""
    v = PC.verdict(observed=[1, 2, 3], control=[])
    assert v["state"] == PC.FOUND and v["n"] == 3


def test_an_EMPTY_observation_WITH_a_live_control_is_a_REAL_negative():
    """The case the whole module exists to still permit. MUTATION: return
    UNCOUNTED always — then no negative is ever reportable and the function is
    just a mute."""
    v = PC.verdict(observed=[], control=[1])
    assert v["state"] == PC.ABSENT
    assert PC.is_reportable_negative(v)


def test_a_MISSING_control_argument_cannot_produce_a_clean_negative():
    """The forgetting case, and it must fail SAFE. MUTATION: default `control` to
    something truthy — then omitting it silently produces ABSENT, which is the
    exact failure with extra steps."""
    v = PC.verdict(observed=[], control=None)
    assert v["state"] == PC.UNCOUNTED


def test_None_observed_is_NOT_treated_as_zero():
    """`None` is 'no observation', not 'observed nothing' — the null-as-absence
    defect this project has hit a dozen times. MUTATION: `_size(None) -> 0`."""
    assert PC._size(None) is None
    assert PC._size([]) == 0
    assert PC._size(0) == 0


def test_False_is_a_real_observation_of_zero_not_a_missing_one():
    """A boolean probe that answers False HAS looked. MUTATION: treat False like
    None and every boolean negative becomes UNCOUNTED — an instrument that can
    never report a negative, which is the opposite failure."""
    assert PC._size(False) == 0
    v = PC.verdict(observed=False, control=True)
    assert v["state"] == PC.ABSENT


def test_a_scalar_count_works_as_well_as_a_collection():
    v = PC.verdict(observed=0, control=7)
    assert v["state"] == PC.ABSENT and v["control_n"] == 7


def test_UNCOUNTED_says_it_is_about_THE_RUN_not_about_the_world():
    """Rule 13f's actual sentence. MUTATION: word it as 'not found' — the reader
    then files it as a negative, which is how all four of these happened."""
    v = PC.verdict(observed=[], control=[], what="matched leagues")
    assert "THIS RUN" in v["why"]
    assert "matched leagues" in v["why"]


def test_is_reportable_negative_is_TRUE_ONLY_for_ABSENT():
    """MUTATION: `state != FOUND`. That is the natural thing to type and it
    reintroduces the bug exactly — UNCOUNTED would read as a finding."""
    assert PC.is_reportable_negative({"state": PC.ABSENT}) is True
    assert PC.is_reportable_negative({"state": PC.UNCOUNTED}) is False
    assert PC.is_reportable_negative({"state": PC.FOUND}) is False


def test_the_line_makes_UNCOUNTED_LOUD():
    """A summary line that renders UNCOUNTED like a tidy negative gets skimmed."""
    assert PC.line(PC.verdict([], [])).startswith("UNCOUNTED")
    assert PC.line(PC.verdict([], [1])).startswith("ABSENT")


def test_THE_CONTROL_IS_REQUIRED_BY_THE_SIGNATURE():
    """FOUND BY A SURVIVING MUTATION: giving `control` a truthy default passed
    every test above, because each one passes a control explicitly. Nothing
    asserted that you CANNOT FORGET IT — which is the module's whole claim.

    "A function makes the control a PARAMETER: you cannot call it without
    deciding what a positive would look like." That sentence is in the docstring;
    this is what makes it true rather than aspirational.

    MUTATION: `def verdict(observed, control=1, ...)`."""
    import pytest
    with pytest.raises(TypeError):
        PC.verdict(observed=[])


def test_and_the_signature_has_no_default_for_control():
    """Belt and braces on the same thing, read off the signature rather than
    inferred from a raise — a later refactor could swallow the TypeError."""
    import inspect
    sig = inspect.signature(PC.verdict)
    assert sig.parameters["control"].default is inspect.Parameter.empty
