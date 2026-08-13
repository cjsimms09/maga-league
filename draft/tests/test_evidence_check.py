# TERRITORY: C
"""THREE GUARDS AGAINST THE THREE WAYS I GOT A PLAUSIBLE NUMBER WRONG TODAY.

The mutation gate covers the class where a CHECK silently did not run. These
cover the classes where the check ran fine and the ANSWER was wrong anyway,
because it was computed over the wrong rows, joined on an unverified key, or
printed through a fallback that turned absence into zero.

  1. SAMPLE CUT — four times. `usage` on all 602 said 71% committee; on
     draftable depth, 0%. `expected_games` on all 582 said the median player is
     5.2 games from his position constant; inside the draft it is 1.0. Both
     numbers were arithmetically correct and neither answered the question. The
     tell was always available: the cut and the uncut answers DIVERGE. Nothing
     computed both, so nothing showed the divergence.

  2. UNVERIFIED JOIN KEY — the `proj_sd` comparison fed `band_of` the OVERALL
     `consensus_rank` where it wanted a WITHIN-POSITION projection rank, and
     produced a table with 1-7 players in bands that should hold dozens. What
     caught it was checking my computed rank against an independent one
     (`pos_rank`, 576/576). What should catch it is doing that first, always.

  3. NULL AS ABSENCE — twice in one reporting block. `players_of(load())`
     returned {} and printed "Decode: 0.0%"; `(rate or 0)` turned an honest None
     into 0.0. Both in lines written to report honestly.

Run: python3 -m pytest draft/tests/test_evidence_check.py -q
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "backtest"))

import evidence_check as EC  # noqa: E402


# ── 1. the cut and the uncut answer, always both ───────────────────────────
def test_a_DIVERGENT_cut_is_flagged_and_the_uncut_answer_is_KEPT():
    """THE FOUR-TIME ERROR. Deep one-game careers drag the full-population median
    to 5.2 while the draftable median is 1.0. Reporting either alone is a claim
    about a population nobody asked about.

    MUTATION: return the cut statistic only — the divergence that is the whole
    signal becomes invisible, which is exactly the state I kept shipping from."""
    full = [12.0] * 400 + [1.0] * 100          # tail-heavy
    cut = [1.0] * 100
    r = EC.population_divergence(full, cut, name="games gap")
    assert r["full"] == 12.0 and r["cut"] == 1.0
    assert r["diverges"] is True
    assert r["n_full"] == 500 and r["n_cut"] == 100
    assert "population" in r["note"].lower()


def test_an_AGREEING_cut_says_so_rather_than_warning_anyway():
    """An instrument that always warns is not an instrument. MUTATION: flag every
    cut — the warning stops meaning anything by its second use."""
    r = EC.population_divergence([5.0] * 50, [5.0] * 10, name="x")
    assert r["diverges"] is False and r["note"] is None


def test_an_EMPTY_cut_is_UNMEASURED_not_agreement():
    """Rule 13f, and the dangerous direction: a cut that selected nothing would
    otherwise report `diverges: False`, which reads as "checked, and consistent".

    MUTATION: return diverges False for an empty cut — the exact case where the
    filter is broken reports the cleanest result."""
    r = EC.population_divergence([1.0, 2.0], [], name="x")
    assert r["diverges"] is None and r["cut"] is None
    assert "no rows" in r["note"].lower()


# ── 2. never join on a key you have not checked ────────────────────────────
def test_a_KEY_THAT_DISAGREES_with_its_independent_derivation_is_REFUSED():
    """The proj_sd error. MUTATION: report the rate and let the caller decide —
    I did decide, and I decided wrong, because 12% looked like a rounding issue
    rather than a different quantity."""
    mine = {"a": 1, "b": 2, "c": 3, "d": 99}
    theirs = {"a": 1, "b": 2, "c": 3, "d": 4}
    r = EC.agreement(mine, theirs, name="proj rank vs pos_rank")
    assert r["agree"] == 3 and r["compared"] == 4
    assert r["ok"] is False, "75% is not a verified key"
    assert r["disagreements"][:1] == [("d", 99, 4)]


def test_FULL_AGREEMENT_passes_and_records_the_evidence():
    """576/576 is what let me trust the recomputed rank. MUTATION: pass on a
    majority — the check becomes a vote rather than a verification."""
    m = {k: i for i, k in enumerate("abcdefgh")}
    r = EC.agreement(m, dict(m), name="k")
    assert r["ok"] is True and r["rate"] == 1.0 and r["compared"] == 8


def test_NO_OVERLAP_is_UNVERIFIED_not_agreement():
    """Two dicts that share no keys agree on nothing and disagree on nothing.
    Returning ok=True would certify a join that was never tested — and an empty
    overlap is what a WRONG key produces.

    MUTATION: treat zero comparisons as full agreement."""
    r = EC.agreement({"a": 1}, {"b": 2}, name="k")
    assert r["ok"] is None and r["compared"] == 0
    assert "no keys in common" in r["note"].lower()


# ── 3. absence must not print as zero ──────────────────────────────────────
def test_NONE_formats_as_UNMEASURED_and_never_as_a_number():
    """Both of my reporting bugs in one line: `(rate or 0)` printed 0.0% for a
    None, and an empty decode key printed "Decode: 0.0%".

    MUTATION: format None as 0 — absence and a measured zero become the same
    string, in the line written to report honestly."""
    assert EC.num(None, "%.1f%%", scale=100) == "UNMEASURED"
    assert EC.num(0.0, "%.1f%%", scale=100) == "0.0%"
    assert EC.num(0.964, "%.1f%%", scale=100) == "96.4%"


def test_a_MEASURED_ZERO_still_prints_as_zero():
    """The other side of the same line: 0 is a measurement and must survive.
    MUTATION: treat falsey as absent — `or` semantics, which is the bug itself."""
    assert EC.num(0, "%d") == "0"
    assert EC.num(0.0, "%.2f") == "0.00"


def test_the_EMPTY_STRING_and_NA_are_absent_too():
    """Matching `field-population/v1`'s ABSENT set, so one notion of absence is
    used everywhere rather than two that disagree at the edges."""
    assert EC.num("", "%s") == "UNMEASURED"
    assert EC.num("NA", "%s") == "UNMEASURED"
