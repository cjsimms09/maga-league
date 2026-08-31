# TERRITORY: A
"""NO STORED VERDICT MAY SAY SOMETHING FALSE ABOUT ITS OWN INTERVAL.

Three separate instances of one bug were fixed in this repo, the last two on
2026-08-17:

  · frontier.py            "parked: CI includes $0" over [-109.33, -25.5]
  · cory_conditional.py    the same predicate, the same false claim
  · stack_sweep.py         the mirror image — a MISSING branch, so an interval
                           entirely ABOVE zero was labelled as containing it

Each was found by reading code. The third was missed by the first two fixes
because grepping for the CORRECTED predicate (`lo <= 0 <= hi`) only finds files
that already think about the question, and stack_sweep did not — its bug was an
absent branch, which no grep for a predicate can see.

SO THIS CHECKS THE OUTPUT INSTEAD OF THE CODE. A mislabelled verdict is
detectable from the artifact alone, whatever shape the generator's mistake took,
and it stays detectable when a future study invents a fourth shape.

── HONEST SCOPE, BECAUSE THE FIRST VERSION OF THIS CLAIM WAS TOO BROAD ──────

It checks every dict that carries BOTH a two-element CI and a verdict string AS
SIBLINGS. Measured 2026-08-25: 40 such pairs across 6 artifacts (cory-conditional, exp33b,
exp34, exp_participation, frontier, stack-sweep).

It does NOT cover the 21 other artifacts that carry a `ci95` somewhere: those
either state no claim beside it, or separate the claim from the interval by
nesting — `exp_ceiling_freshseed.json` has a top-level verdict over per-seed
CIs, and which interval a summary refers to is not inferable from structure.
Those are covered by their own dedicated tests, which recompute the verdict from
the data (see test_ceiling_rederivation.py). **This file is not a proof that
every stored claim in the repo is sound. It is a proof about co-located pairs,
and saying otherwise would be the same overclaim it exists to catch.**

Run: python -m pytest draft/tests/test_verdicts_match_their_intervals.py
"""
from __future__ import annotations

import glob
import json
import os
import re

BACKTEST = os.path.join(os.path.dirname(os.path.dirname(
    os.path.abspath(__file__))), "backtest")

CI_KEYS = ("ci95", "ci", "ci_95", "interval", "ci95_paired")
#: A string is a VERDICT if it makes a claim about separability from zero.
VERDICT = re.compile(r"includes? \$?0|excludes? 0|separable|LOSER|WINNER|HARMFUL"
                     r"|parked|inconclusive")
#: ...and these say which direction it claims.
SAYS_CONTAINS = re.compile(r"includes? \$?0|includes 0")
SAYS_EXCLUDES = re.compile(r"excludes? 0|LOSER|WINNER|HARMFUL")


def pairs(obj, path=""):
    """Yield (path, [lo, hi], verdict) for every co-located pair."""
    if isinstance(obj, dict):
        ci = next((obj[k] for k in CI_KEYS
                   if isinstance(obj.get(k), list) and len(obj[k]) == 2), None)
        verd = next((v for v in obj.values()
                     if isinstance(v, str) and VERDICT.search(v)), None)
        if ci is not None and verd is not None:
            yield path, ci, verd
        for k, v in obj.items():
            yield from pairs(v, f"{path}.{k}" if path else k)
    elif isinstance(obj, list):
        for i, v in enumerate(obj):
            yield from pairs(v, f"{path}[{i}]")


#: A verdict whose LEADING label is one of these makes no separability claim at
#: all — it says the instrument cannot answer the question. Leading only: a
#: refusal word buried mid-sentence must not exempt a verdict that then goes on
#: to claim separation.
REFUSAL_HEAD = re.compile(r"^\s*(INSTRUMENT-LIMITED|not separable|inconclusive|"
                          r"unmeasurable|VOID)\b", re.I)
#: Text inside parentheses is an ASIDE, not this row's claim. See below.
PARENTHETICAL = re.compile(r"\([^()]*\)")


def inconsistency(ci, verdict):
    """The false claim, or None. Zero is inside [lo, hi] only when lo <= 0 <= hi.

    ⚠️ THE DETECTOR READ A CROSS-REFERENCE AS A CLAIM, and it took a moving
    interval to expose it. `exp_participation.build_up_from_core.stack` has
    carried the same verdict since 08-18:

        "INSTRUMENT-LIMITED — grade_room has no within-team weekly correlation —
         the stack mechanism is absent, so this arm can't reward it. Sound
         instrument = exp6/stack_sweep (WINNER +$196 @ dose 0.5)."

    That is an honest refusal about THIS arm plus a pointer to a DIFFERENT study.
    The `WINNER` belongs to `exp6/stack_sweep`. But the detector matched
    `SAYS_EXCLUDES` anywhere in the string, so it read the borrowed word as this
    row's claim — and stayed quiet for a week only because the interval happened
    to exclude zero and agree with it: **[-49.75, -11.62] -> [-22.88, -7.44] ->
    [-17.56, 9.75]**, straddling zero for the first time in the 08-25 Lab report.
    Register 342.

    So two things are excluded from the SEPARABILITY check, and only from it —
    `SAYS_CONTAINS` still scans the whole string, because "parked: CI includes $0"
    puts its false claim in the tail:

      * a LEADING refusal label, which by construction makes no claim to separate
      * text inside parentheses, which is an aside and not the row's verdict

    WHAT THIS GIVES UP, stated rather than glossed: a verdict that leads with
    INSTRUMENT-LIMITED and then genuinely claims separation is no longer caught.
    That is the label lying, not the interval, and this file cannot see it — the
    docstring at the top already says this is a proof about co-located pairs and
    not about every stored claim in the repo.
    """
    lo, hi = ci
    if not isinstance(lo, (int, float)) or not isinstance(hi, (int, float)):
        return None
    contains = lo <= 0 <= hi
    if SAYS_CONTAINS.search(verdict) and not contains:
        return "claims 0 is INSIDE an interval that excludes it"
    # "not separable"/"inconclusive" are the honest words for containing zero;
    # only a positive claim of separation is wrong when zero is inside. They now
    # exempt only as a LEADING label: the old test searched them ANYWHERE, so
    # "WINNER — dose pays, though not separable elsewhere" escaped. MEASURED
    # before tightening — 0 of the 40 stored pairs relied on the anywhere-match,
    # so closing it costs nothing on the real population. Register 342.
    own_claim = PARENTHETICAL.sub(" ", verdict)
    if (SAYS_EXCLUDES.search(own_claim) and contains
            and not REFUSAL_HEAD.search(verdict)):
        return "claims separability for an interval that CONTAINS 0"
    return None


def _all_pairs():
    out = []
    for f in sorted(glob.glob(os.path.join(BACKTEST, "*.json"))):
        try:
            doc = json.load(open(f, encoding="utf8"))
        except Exception:
            continue                      # not every json here is a study result
        for path, ci, verd in pairs(doc):
            out.append((os.path.basename(f), path, ci, verd))
    return out


def test_CONTROL_the_detector_catches_all_three_historical_bugs():
    """KNOWN-POSITIVE. A sweep that has only ever returned zero is not evidence.
    These are the real intervals and labels from the three fixed instances."""
    # frontier.py, as shipped on main today
    assert inconsistency([-99.5, -29.33], "parked: CI includes $0")
    # cory_conditional.py, the original
    assert inconsistency([-109.33, -25.5], "parked: CI includes $0")
    # stack_sweep.py, the mirror image — interval entirely above zero
    assert inconsistency([0.5, 3.0], "parked: CI includes $0")
    # and the opposite error: claiming separation while straddling zero
    assert inconsistency([-10.0, 10.0], "WINNER — dose pays")


def test_CONTROL_the_detector_passes_correct_labels():
    """The other direction. A detector that flagged everything would make the
    sweep below vacuous in the noisiest possible way."""
    assert inconsistency([-99.5, -29.33], "LOSER — significantly worse than the control") is None
    assert inconsistency([-10.0, 10.0], "parked: CI includes $0") is None
    assert inconsistency([266.46, 422.29], "WINNER — dose pays") is None
    assert inconsistency([-10.0, 10.0], "not separable (CI includes 0)") is None


def test_CONTROL_a_cross_reference_is_not_this_rows_claim():
    """Register 342, both directions. The exemptions must be exactly as narrow as
    they are described, or they are a hole rather than a fix."""
    cited = ("INSTRUMENT-LIMITED — grade_room has no within-team weekly "
             "correlation — the stack mechanism is absent, so this arm can't "
             "reward it. Sound instrument = exp6/stack_sweep (WINNER +$196 @ "
             "dose 0.5).")
    # the real row: an honest refusal quoting somebody else's WINNER
    assert inconsistency([-17.56, 9.75], cited) is None
    # ...and the SAME row must still be caught claiming 0 is inside when it is not
    assert inconsistency([-49.75, -11.62], "INSTRUMENT-LIMITED — parked: CI "
                         "includes $0")

    # A REFUSAL WORD MID-SENTENCE MUST NOT EXEMPT ANYTHING. Leading only.
    assert inconsistency([-10.0, 10.0],
                         "WINNER — dose pays, though not separable elsewhere"), \
        "a refusal phrase mid-sentence exempted a real separability claim"
    assert inconsistency([-10.0, 10.0], "WINNER — dose pays; instrument-limited "
                         "in the 2023 arm"), \
        "a refusal word buried mid-sentence exempted a real separability claim"

    # A PARENTHETICAL IS AN ASIDE; A BARE CLAIM IS NOT.
    assert inconsistency([-10.0, 10.0], "dose pays (WINNER in exp6)") is None
    assert inconsistency([-10.0, 10.0], "dose pays — WINNER in exp6"), \
        "stripping parentheses must not swallow an unparenthesised claim"


def test_CONTROL_the_sweep_actually_reaches_the_artifacts():
    """The failure mode this file is most likely to develop: a path or key
    change makes it scan nothing and report clean. Pinned to the measured
    population so a silent collapse to zero goes red."""
    found = _all_pairs()
    # FLOOR LOOSENED 40 -> 25 on 2026-08-17, same day it was written, because 40
    # was fitted to the exact count on one branch and main's Lab regenerated an
    # artifact with one row fewer — 39. That is the "bound tuned to today's data
    # fires on ordinary variation" mistake this session flagged on the snap-count
    # join floor, committed here in the guard that flagged it. The real
    # non-vacuity check is the named-artifact assertion below; this number only
    # has to catch a COLLAPSE.
    assert len(found) >= 25, f"only {len(found)} verdict/interval pairs found — the sweep stopped reaching the artifacts"
    names = {n for n, _, _, _ in found}
    for expected in ("frontier.json", "stack-sweep.json", "cory-conditional.json"):
        assert expected in names, (expected, sorted(names))


def test_no_stored_verdict_contradicts_its_own_interval():
    bad = [(n, p, ci, v, why) for n, p, ci, v in _all_pairs()
           if (why := inconsistency(ci, v))]
    assert not bad, "\n".join(
        f"{n} {p}\n    CI {ci} -> {v!r}\n    {why}" for n, p, ci, v, why in bad)
