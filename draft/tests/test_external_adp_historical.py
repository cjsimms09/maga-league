# TERRITORY: C
"""EXTERNAL ADP HISTORICAL — offline. `capture_year` and `fetch_all` are
`pragma: no cover` (real egress); `cross_year_distinctness` is pure and tested
here. The catch-clause contract (`SystemExit` too, not just `Exception`) is
tested by calling `capture_year` with a FAKE `adp` module that raises exactly
what the real one raises, no network involved.

Run: python3 -m pytest draft/tests/test_external_adp_historical.py -q
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "backtest"))

import external_adp_historical as M  # noqa: E402


# ── cross_year_distinctness: pure ────────────────────────────────────────────

def _cap(status, rows=None, reason=None):
    d = {"status": status}
    if rows is not None:
        d["rows"] = rows
    if reason is not None:
        d["reason"] = reason
    return d


def test_TWO_DISTINCT_YEARS_ARE_DISTINCT():
    captures = {
        2023: {"ffc": _cap("captured", {"1": {"adp": 5.0}, "2": {"adp": 40.0}})},
        2024: {"ffc": _cap("captured", {"1": {"adp": 3.0}, "2": {"adp": 55.0}})},
    }
    out = M.cross_year_distinctness(captures)
    assert out["2023_vs_2024_ffc"]["status"] == "distinct"
    assert out["2023_vs_2024_ffc"]["shared"] == 2
    assert out["2023_vs_2024_ffc"]["identical"] == 0


def test_TWO_IDENTICAL_YEARS_ARE_FLAGGED_SUSPECT():
    """⚠ THE WHOLE POINT. If the `year` query parameter is silently ignored,
    two 'different' fetches return the same board and would otherwise look
    like two successful, independent captures.

    MUTATION: report `distinct` regardless of the identical fraction, and an
    endpoint that ignores `year` reads as four genuine historical seasons."""
    rows = {"1": {"adp": 5.0}, "2": {"adp": 40.0}, "3": {"adp": 90.0},
           "4": {"adp": 12.0}}
    captures = {
        2023: {"ffc": _cap("captured", rows)},
        2024: {"ffc": _cap("captured", dict(rows))},   # byte-identical
    }
    out = M.cross_year_distinctness(captures)
    assert out["2023_vs_2024_ffc"]["status"] == "suspect_identical"
    assert out["2023_vs_2024_ffc"]["identical_fraction"] == 1.0


def test_ORDINARY_MARKET_STABILITY_ON_A_FEW_PLAYERS_IS_NOT_FLAGGED():
    """A consensus #1 overall sitting at the same ADP two years running is
    real market behaviour, not evidence the fetch is broken — the bar is a
    FRACTION of shared players, not "any player agrees at all"."""
    rows_a = {"1": {"adp": 1.0}, "2": {"adp": 40.0}, "3": {"adp": 90.0},
             "4": {"adp": 12.0}, "5": {"adp": 60.0}}
    rows_b = {"1": {"adp": 1.0}, "2": {"adp": 55.0}, "3": {"adp": 30.0},
             "4": {"adp": 88.0}, "5": {"adp": 20.0}}
    captures = {2023: {"ffc": _cap("captured", rows_a)},
               2024: {"ffc": _cap("captured", rows_b)}}
    out = M.cross_year_distinctness(captures)
    assert out["2023_vs_2024_ffc"]["status"] == "distinct"
    assert out["2023_vs_2024_ffc"]["identical"] == 1


def test_A_VOID_HALF_IS_unmeasured_EVEN_IF_ITS_ROWS_WERE_NOT_CLEARED():
    """The guard checks STATUS explicitly rather than inferring VOID from an
    empty `rows` dict. A caller that flips status to VOID without clearing a
    stray `rows` (a defensive case, not one this module's own `capture_year`
    produces) must still read as unmeasured — trusting emptiness alone would
    silently accept stale rows from a run that failed.

    MUTATION: drop the status check and rely on `rows` being empty — this
    fixture's stray row makes the two diverge, which a fixture with no rows
    on the VOID side cannot."""
    captures = {2023: {"ffc": _cap("captured", {"1": {"adp": 5.0}})},
               2024: {"ffc": {"status": "VOID", "reason": "egress failed",
                              "rows": {"1": {"adp": 5.0}}}}}
    out = M.cross_year_distinctness(captures)
    assert out["2023_vs_2024_ffc"]["status"] == "unmeasured"


def test_NO_SHARED_PLAYERS_IS_unmeasured_not_a_false_distinct():
    captures = {2023: {"ffc": _cap("captured", {"1": {"adp": 5.0}})},
               2024: {"ffc": _cap("captured", {"9": {"adp": 5.0}})}}
    out = M.cross_year_distinctness(captures)
    assert out["2023_vs_2024_ffc"]["status"] == "unmeasured"
    assert out["2023_vs_2024_ffc"]["shared"] == 0


def test_FFC_AND_FANTASYPROS_ARE_COMPARED_SEPARATELY_never_pooled():
    """A named-for-what-it-holds bug the whole module exists to fix: FFC and
    FantasyPros must never share one key that hides which source is which."""
    captures = {
        2023: {"ffc": _cap("captured", {"1": {"adp": 5.0}}),
              "fantasypros": _cap("captured", {"1": {"adp": 8.0}})},
        2024: {"ffc": _cap("captured", {"1": {"adp": 5.0}}),
              "fantasypros": _cap("captured", {"1": {"adp": 40.0}})},
    }
    out = M.cross_year_distinctness(captures)
    assert "2023_vs_2024_ffc" in out and "2023_vs_2024_fantasypros" in out
    assert out["2023_vs_2024_ffc"]["identical"] == 1       # ffc agrees
    assert out["2023_vs_2024_fantasypros"]["identical"] == 0  # fp does not


# ── capture_year: the catch clause, against a FAKE adp module (no network) ──

class _FakeADPRaisesSystemExit:
    """`build_adp_table` really does `raise SystemExit(...)` on a broken
    accounting identity — SystemExit is a BaseException, not an Exception."""
    @staticmethod
    def build_adp_table(players, *, fmt, teams, year):
        raise SystemExit("REFUSING the ADP anchor: accounting mismatch")

    @staticmethod
    def build_fantasypros_table(players, *, year):
        return None, {"reason": "only 3 FP rows parsed (< 150); keeping FFC anchor"}


def test_capture_year_CATCHES_SystemExit_not_just_Exception():
    """⚠ FOUND BY READING `adp.build_adp_table`'S OWN CODE, THEN VERIFIED, NOT
    ASSUMED — after `external_source_projections.py` crashed this session on a
    RAISE its author had not anticipated. `SystemExit` is a `BaseException`; a
    bare `except Exception` does not catch it and the whole capture run would
    die instead of voiding one year's FFC arm cleanly.

    MUTATION: catch only `Exception` and this test's SystemExit propagates
    uncaught — pytest reports it as an error, not a clean VOID."""
    out = M.capture_year(_FakeADPRaisesSystemExit(), {"1": {}}, 2023)
    assert out["ffc"]["status"] == "VOID", out
    assert "accounting mismatch" in out["ffc"]["reason"]
    assert out["ffc"]["error_type"] == "SystemExit"


def test_capture_year_A_THIN_FANTASYPROS_FETCH_IS_VOID_WITH_THE_DIAG():
    out = M.capture_year(_FakeADPRaisesSystemExit(), {"1": {}}, 2023)
    assert out["fantasypros"]["status"] == "VOID"
    assert "keeping FFC anchor" in out["fantasypros"]["reason"]


class _FakeADPBothSucceed:
    @staticmethod
    def build_adp_table(players, *, fmt, teams, year):
        return {"adp": {"1": {"adp": 5.0, "adp_source": "ffc"}},
               "report": {"matched": 1}}

    @staticmethod
    def build_fantasypros_table(players, *, year):
        return {"1": {"adp": 4.5, "adp_source": "fantasypros"}}, {"fp_matched": 1}


def test_capture_year_BOTH_ARMS_CAPTURED_ARE_NAMED_SEPARATELY():
    out = M.capture_year(_FakeADPBothSucceed(), {"1": {}}, 2023)
    assert out["ffc"]["status"] == "captured" and out["ffc"]["matched"] == 1
    assert out["fantasypros"]["status"] == "captured" and out["fantasypros"]["matched"] == 1
    assert out["ffc"]["rows"]["1"]["adp_source"] == "ffc"
    assert out["fantasypros"]["rows"]["1"]["adp_source"] == "fantasypros"
