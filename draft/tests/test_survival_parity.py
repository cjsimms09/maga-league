# TERRITORY: A
"""TWO IMPLEMENTATIONS OF ONE MODEL MUST NOT DRIFT — enforced by PARSING the other.

Routed by C, 2026-08-13. `survival.js` moved its ADP-dispersion rate from 0.22 to
0.15 and added a cap; `keepers.py` kept 0.22 and no cap. ONE HALF OF A TWO-PLACE
CHANGE, and it ran for weeks because nothing compared the two.

Measured cost at a 20-pick gap, python vs the engine Cory drafts with:

    Ladd McConkey    adp  44.3     2.0%  vs  0.1%     15.3x
    Brian Thomas     adp  73.0    10.7%  vs  3.4%      3.1x
    Patrick Mahomes  adp 101.0    18.4%  vs  9.1%      2.0x
    Brian Robinson   adp 141.7    26.1%  vs  9.1%      2.9x

`optimize_keepers` prices a keeper as surplus over what the forfeited pick
returns, and survival decides whether you would have got that player back
anyway. Overestimating survival makes a keeper look LESS valuable, so the
optimizer systematically undervalued keepers — and that decision locks
2026-08-20.

── WHY THIS TEST PARSES survival.js INSTEAD OF HARDCODING 0.15 ───────────────

A test asserting `ADP_SD_RATE == 0.15` in both files passes the day someone
changes both to 0.18 and fails the day someone changes one to 0.18 — which
sounds right, and is exactly wrong. It would ALSO pass if survival.js were
edited to 0.18 and this file's literal updated to match, with keepers.py left
behind, because nothing here would have read keepers.py's actual behaviour.

So the assertion is BEHAVIOURAL and CROSS-LANGUAGE: extract the constants from
survival.js as text, compute survival in JS terms, and compare against what
keepers.py actually returns. The only way to pass is for the two to agree.

This is the same shape as refusal_matches_source.test.js — two independent
routes to one number — and the same reason: a constant maintained in two places
is a defect waiting for a deadline.
"""
from __future__ import annotations

import re
import sys
from pathlib import Path
from statistics import NormalDist

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "draft"))

import keepers as K  # noqa: E402

SURVIVAL_JS = ROOT / "public" / "js" / "draft" / "survival.js"


def _js_const(name: str) -> float:
    """Pull one CFG constant out of survival.js by name.

    Refuses rather than defaulting: a missing constant means the JS was
    restructured, and silently substituting a default would make this suite
    green against a file it can no longer read — the vacuous-pass failure this
    whole line of work keeps turning up.
    """
    src = SURVIVAL_JS.read_text(encoding="utf-8")
    m = re.search(rf"\b{name}\s*:\s*([0-9]+(?:\.[0-9]+)?)", src)
    assert m, f"{name} not found in survival.js — the parser is stale, not the code"
    return float(m.group(1))


def test_the_js_constants_are_still_parseable():
    """The control. If this fails, every other test here is vacuous."""
    assert _js_const("ADP_SD_FLOOR") > 0
    assert _js_const("ADP_SD_RATE") > 0
    assert _js_const("ADP_SD_CAP") > 0


def test_python_dispersion_constants_equal_the_js_ones():
    assert K.ADP_SD_FLOOR == _js_const("ADP_SD_FLOOR")
    assert K.ADP_SD_RATE == _js_const("ADP_SD_RATE")
    assert K.ADP_SD_CAP == _js_const("ADP_SD_CAP")


def _js_sd(adp: float) -> float:
    """survival.js adpSd(), transcribed: min(CAP, max(FLOOR, RATE * adp))."""
    return min(_js_const("ADP_SD_CAP"),
               max(_js_const("ADP_SD_FLOOR"), _js_const("ADP_SD_RATE") * adp))


def test_the_fallback_sd_agrees_across_the_whole_adp_range():
    """Every integer ADP from 1 to 250, not three convenient samples."""
    for adp in range(1, 251):
        assert abs(K.adp_sd_for(float(adp)) - _js_sd(float(adp))) < 1e-9, \
            f"dispersion diverges at adp {adp}"


def test_survival_agrees_on_the_four_players_C_measured():
    """The exact rows from C's report, which is what regression means here."""
    cases = [(44.3, 0.001), (73.0, 0.034), (101.0, 0.091), (141.7, 0.091)]
    for adp, expected_js in cases:
        got = K.survival_probability(adp, adp + 20)
        want = 1.0 - NormalDist(mu=adp, sigma=_js_sd(adp)).cdf(adp + 20)
        assert abs(got - want) < 1e-9, f"adp {adp}: python {got:.4f} vs js {want:.4f}"
        assert abs(got - expected_js) < 0.002, \
            f"adp {adp}: {got:.4f} is not C's measured js value {expected_js}"


def test_a_SOURCE_PROVIDED_sd_still_wins_over_the_formula():
    """The fallback is a fallback. A real measurement must override it in both."""
    assert K.adp_sd_for(100.0, 7.5) == 7.5
    assert K.adp_sd_for(100.0) == _js_sd(100.0)


def test_THE_MUTATION_THIS_SUITE_EXISTS_TO_CATCH():
    """Restore the old python-only rate and prove the suite goes red.

    A parity test that has never been shown to FAIL on a real divergence is a
    parity test nobody should trust. This drives the exact historical defect.
    """
    old_floor, old_rate, old_cap = K.ADP_SD_FLOOR, K.ADP_SD_RATE, K.ADP_SD_CAP
    try:
        K.ADP_SD_RATE = 0.22          # the pre-fix python value
        K.ADP_SD_CAP = float("inf")   # and no cap
        diverged = [adp for adp in range(1, 251)
                    if abs(K.adp_sd_for(float(adp)) - _js_sd(float(adp))) >= 1e-9]
        assert diverged, "the mutation changed nothing — this suite cannot detect drift"
        # And it must be visible at the ADPs that actually cost the keeper call.
        assert 44 in diverged and 101 in diverged
    finally:
        K.ADP_SD_FLOOR, K.ADP_SD_RATE, K.ADP_SD_CAP = old_floor, old_rate, old_cap
    # Restored, and the restoration itself is asserted rather than assumed.
    assert K.adp_sd_for(100.0) == _js_sd(100.0)
