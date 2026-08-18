# TERRITORY: C
"""THE BAND SPLIT MUST BE MEASURABLE WITHOUT EDITING THE MODULE — AND UNCHANGED BY DEFAULT.

Register 4q, 2026-08-17. `BAND_EDGES = (3, 8, 16, 32)` puts **935 of 1,304
graded players into a single `33+` cell per position** while ranks 1-32 get four
bands. Ranks 33 to 300+ therefore share one number — every player Cory drafts
from round 4 on — and inside a cell `proj_ceiling` is a constant multiple of
`proj_mean`. That is why the board reports a DECLINING ceiling/mean ratio by ADP
band (1.640 -> 1.317) and tells him a round-12 flier is more predictable than a
first-rounder.

Cory: "this goes against every fantasy footbal theory ever and doesnt make sense."
He is right, and this is the constant behind it.

The refit must run where Sleeper is reachable (Actions; the sandbox returns 403),
and a workflow cannot vary a module constant. `PROJECTION_BAND_EDGES` lets one
run use finer edges into a SIDE artifact so both slopes can be compared before
anything ships. **Shipping the split is Cory's call — this only makes measuring
it possible.**

Run: python3 -m pytest draft/tests/test_projection_band_override.py -q
"""
from __future__ import annotations

import importlib
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "draft" / "backtest"))


@pytest.fixture(autouse=True)
def _restore_declared_edges():
    """RELOADING A MODULE IN-PROCESS LEAKS, AND THIS FILE CAUSED THAT.

    Every test here reloads `projection_error` to exercise an import-time env
    var. Without this fixture the LAST reload wins for the rest of the pytest
    session, so `test_projection_error.py::test_BAND_EDGES_produce_the_
    boundaries_...` failed in the full suite while passing in isolation —
    a test that is green alone and red together, which is the most expensive
    kind to debug.

    Caught by running the whole gate rather than the file. Restores the
    declared edges after every test in this module, so the pollution cannot
    escape it."""
    yield
    import os
    os.environ.pop("PROJECTION_BAND_EDGES", None)
    import projection_error as PE
    importlib.reload(PE)


def _reload(monkeypatch, value):
    if value is None:
        monkeypatch.delenv("PROJECTION_BAND_EDGES", raising=False)
    else:
        monkeypatch.setenv("PROJECTION_BAND_EDGES", value)
    import projection_error as PE
    return importlib.reload(PE)


def test_the_default_is_untouched(monkeypatch):
    """The one assertion that protects the live model. Every other test here is
    about an experiment; this one is about the board Cory drafts on."""
    PE = _reload(monkeypatch, None)
    assert PE.BAND_EDGES == (3, 8, 16, 32)
    assert PE.band_of(40) == "33+"


def test_the_split_actually_splits(monkeypatch):
    PE = _reload(monkeypatch, "3,8,16,32,48,72,100,150")
    assert PE.BAND_EDGES == (3, 8, 16, 32, 48, 72, 100, 150)
    for rank, band in ((40, "33-48"), (60, "49-72"), (90, "73-100"),
                       (120, "101-150"), (200, "151+")):
        assert PE.band_of(rank) == band, f"rank {rank}"


@pytest.mark.parametrize("bad,why", [
    ("3,oops,16", "a non-integer"),
    ("16,8,3", "edges out of order"),
    ("3,3,8", "a duplicate edge"),
    ("0,8", "a zero edge"),
    ("", "an empty string"),
    ("   ", "whitespace only"),
])
def test_A_BAD_VALUE_KEEPS_THE_DECLARED_EDGES_never_rebands_silently(monkeypatch, bad, why):
    """FAIL ARMS, and they matter more than the happy path.

    This env var can reband the entire model. A typo in a workflow file must
    leave the declared edges standing, because a SILENTLY rebanded calibration
    would move every ceiling and floor on the board with nothing in the output
    saying so — the exact class of defect the register is full of."""
    PE = _reload(monkeypatch, bad)
    assert PE.BAND_EDGES == (3, 8, 16, 32), f"{why} must not reband the model"


def test_MIN_N_still_governs_so_an_overreaching_split_degrades_honestly(monkeypatch):
    """A finer split is safe to TRY because a thin cell reports `unmeasurable`
    rather than a confident wrong number. If MIN_N ever stopped guarding that,
    over-splitting would start inventing precision instead of refusing it."""
    PE = _reload(monkeypatch, "3,8,16,32,48,72,100,150")
    assert PE.MIN_N >= 8, "the thin-cell refusal is what makes finer bands safe to try"
