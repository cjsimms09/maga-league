# TERRITORY: C
"""Three guards against the three ways a plausible number came out wrong today.

`mutation_gate` covers the class where a CHECK silently did not run. These cover
the class where the check ran fine and the ANSWER was wrong anyway.

  population_divergence — the statistic over the full set AND over the cut, with
      the divergence made visible. FOUR TIMES today I reported one population's
      answer to another population's question: `usage` on all 602 rows said 71%
      committee where draftable depth said 0%; `expected_games` on all 582 said
      the median player sits 5.2 games from his position constant where inside
      the draft it is 1.0. Both were arithmetically correct. The tell was always
      there — the two answers diverge — and nothing computed both, so nothing
      showed it.

  agreement — a derived join key checked against an INDEPENDENT derivation
      before it is used. The `proj_sd` comparison fed `band_of` the OVERALL
      `consensus_rank` where it wanted a within-position projection rank, and
      produced bands holding 1-7 players that should hold dozens. Recomputing the
      rank and finding 576/576 against `pos_rank` is what made it trustworthy;
      doing that FIRST is what makes it a method rather than a rescue.

  num — absence formats as UNMEASURED, never as a number. Two bugs in one
      reporting block: `players_of(load())` returned {} and printed
      "Decode: 0.0%", and `(rate or 0)` turned an honest None into 0.0. Both in
      lines written to report honestly.
"""
from __future__ import annotations

from statistics import median as _median

#: Same ABSENT set as `field-population/v1`, so one notion of absence is used
#: everywhere rather than two that disagree at the edges.
ABSENT = (None, "", "NA")

#: How far the cut and the full population may differ before it must be stated.
#: Declared from the failures it is for — the smallest real divergence I shipped
#: was 71% against 0%, and the subtlest was 5.2 against 1.0 — not tuned.
DIVERGENCE_RATIO = 1.25


def population_divergence(full, cut, *, name="value", stat=None) -> dict:
    """The statistic over BOTH populations, and whether they disagree.

    Reporting one alone is a claim about a population nobody asked about, and it
    reads identically to the right answer. So both are computed and the
    divergence is stated; the caller still chooses which one answers the
    question, but can no longer do it without seeing the other.
    """
    stat = stat or _median
    full = [v for v in (full or []) if v is not None]
    cut = [v for v in (cut or []) if v is not None]
    out = {"name": name, "n_full": len(full), "n_cut": len(cut),
           "full": None, "cut": None, "ratio": None, "diverges": None, "note": None}
    if not full:
        return dict(out, note="UNMEASURED — the full population has no rows")
    out["full"] = stat(full)
    if not cut:
        # A CUT THAT SELECTED NOTHING IS NOT AGREEMENT. `diverges: False` here
        # would read as "checked, and consistent" for the exact case where the
        # filter is broken.
        return dict(out, note="UNMEASURED — the cut selected no rows, so it "
                              "agrees with nothing and disagrees with nothing")
    out["cut"] = stat(cut)
    lo, hi = sorted((abs(out["full"]), abs(out["cut"])))
    out["ratio"] = (hi / lo) if lo else (None if hi == 0 else float("inf"))
    out["diverges"] = bool(out["ratio"] is None or out["ratio"] >= DIVERGENCE_RATIO)
    if out["diverges"]:
        out["note"] = ("%s differs by population: %s over %d rows, %s over the %d-row "
                       "cut. Say which population the question is about before "
                       "quoting either." % (name, out["full"], out["n_full"],
                                            out["cut"], out["n_cut"]))
    return out


def agreement(mine: dict, theirs: dict, *, name="key", require=1.0,
              listed=5) -> dict:
    """Check a derived key against an independent derivation before joining on it.

    `ok` is True only at `require` (1.0 by default). A MAJORITY IS NOT A
    VERIFICATION: 75% agreement on a rank looks like rounding and is what a
    different quantity looks like too, which is precisely the mistake it exists
    to stop.
    """
    keys = set(mine or {}) & set(theirs or {})
    out = {"name": name, "compared": len(keys), "agree": 0, "rate": None,
           "ok": None, "disagreements": [], "note": None}
    if not keys:
        # AN EMPTY OVERLAP IS WHAT A WRONG KEY PRODUCES. Certifying it would
        # bless a join that was never tested.
        return dict(out, note="UNVERIFIED — no keys in common, so nothing was "
                              "compared; an empty overlap is what a wrong key "
                              "looks like")
    bad = [(k, mine[k], theirs[k]) for k in sorted(keys) if mine[k] != theirs[k]]
    out["agree"] = len(keys) - len(bad)
    out["rate"] = out["agree"] / len(keys)
    out["ok"] = out["rate"] >= require
    out["disagreements"] = bad[:listed]
    if not out["ok"]:
        out["note"] = ("%s agrees on %d/%d (%.1f%%) — below %.0f%%. A majority is "
                       "not a verification: this is what a DIFFERENT QUANTITY "
                       "looks like, not what rounding looks like."
                       % (name, out["agree"], len(keys), 100 * out["rate"],
                          100 * require))
    return out


def num(value, fmt="%s", *, scale=1, absent="UNMEASURED") -> str:
    """Format a number, or say UNMEASURED — never let absence print as zero.

    `(rate or 0)` and `value or 0` are the bug: they turn an honest None into a
    measured-looking 0, and they do it in exactly the lines written to report
    honestly. A MEASURED ZERO STILL PRINTS AS ZERO, which is why this tests
    against the ABSENT set rather than truthiness.
    """
    if any(value is a if a is None else value == a for a in ABSENT):
        return absent
    # NO except HERE, AND THE MUTATION GATE IS WHY. The first cut wrapped this in
    # `except (TypeError, ValueError): return absent`, and mutating the ABSENT
    # check to `if False:` still passed the None test — because `None * 100`
    # raised and the except returned "UNMEASURED" anyway. The test was green for
    # the wrong reason, and the guard was resting on an accident.
    #
    # It is also the same bug one level up: a malformed call is a PROGRAMMING
    # ERROR, and reporting it as "UNMEASURED" claims we looked and found nothing.
    # Absence is decided above, by the ABSENT set, and nowhere else.
    return fmt % (value * scale) if scale != 1 else fmt % value
