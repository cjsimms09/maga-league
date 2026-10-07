"""PROJECTIONS AND STATS MUST NOT BE FETCHED FROM /v1.

MEASURED 2026-10-07 in CI, same second, same runner, the prefix the only
difference:

    https://api.sleeper.app/projections/nfl/2026/5?season_type=regular
        -> 9,420 rows,  972 with projections
    https://api.sleeper.app/v1/projections/nfl/2026/5?season_type=regular
        -> 7,630 rows,    0 with projections

The /v1 surface answers 200 with a well-formed body and no numbers in it. So
both 2027-gradeable captures saw "7630 rows, 0 with stats", correctly refused
to bank an empty week, and went red every run since kickoff. The weekly
projection archive — the artifact the January-2027 experiment is graded on —
holds ONE file: week 1, captured three weeks BEFORE the season started.

⚠️ IT HID IN THE LOG LINE. `_best_payload` printed the PATH and not the URL, so
its output read character-for-character like a request that works. Four
hypotheses died on that before anyone read the constant: a URL fault, a
retention window, a transient upstream, a User-Agent.

This pins the surface split so it cannot quietly revert, and pins the logging
that hid it.

Run: python3 -m pytest draft/tests/test_sleeper_projection_surface.py -q
"""
from __future__ import annotations

import inspect
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "draft"))

import sleeper_import as SI  # noqa: E402

SRC = (ROOT / "draft" / "sleeper_import.py").read_text(encoding="utf8")


def _source_of(fn: str) -> str:
    """A function's source READ FROM THE FILE, never from the live module.

    Another test module monkeypatches `sleeper_import._get` at import time, so
    anything inspecting live attributes here samples that stub when the suite
    runs together and the real code when this file runs alone. A test that
    passes alone and fails in CI for reasons unrelated to its subject is worse
    than no test.
    """
    start = SRC.index(f"def {fn}(")
    nxt = SRC.find("\ndef ", start + 1)
    return SRC[start:nxt if nxt != -1 else len(SRC)]


def test_there_are_two_surfaces_and_only_one_of_them_is_v1():
    assert SI.BASE.endswith("/v1"), SI.BASE
    assert not SI.DATA_BASE.endswith("/v1"), SI.DATA_BASE
    assert SI.DATA_BASE and SI.BASE.startswith(SI.DATA_BASE), \
        "DATA_BASE should be BASE without the /v1 suffix"


@pytest.mark.parametrize("fn", ["fetch_projections", "fetch_stats"])
def test_the_two_data_surfaces_are_fetched_OFF_v1(fn):
    """The whole fix, asserted where it cannot drift back."""
    body = _source_of(fn)
    assert "DATA_BASE" in body, (
        f"{fn} no longer passes base=DATA_BASE, so it is back on /v1 — the "
        "surface that returns rows with no projections in them")


def test_the_OTHER_endpoints_stay_on_v1():
    """Not a blanket swap. League, rosters, users, state and draft genuinely are
    /v1 resources and all of them work; moving them would trade one outage for
    a larger one."""
    for fn in ("fetch_league", "fetch_rosters", "fetch_users"):
        if not hasattr(SI, fn):
            continue
        assert "DATA_BASE" not in _source_of(fn), \
            f"{fn} was moved off /v1 — only projections and stats should be"


def test_the_cache_key_SEPARATES_the_two_surfaces():
    """Without this the bug survives its own fix.

    The on-disk cache is keyed by path. Both surfaces share the path
    `/projections/nfl/2026/5`, so a stat-less /v1 body cached before the fix
    would be served to the corrected caller and the capture would go on
    writing nothing — with the code looking right.
    """
    # ⚠️ READ THE FILE, NOT THE LIVE ATTRIBUTE. test_sleeper_import_week_shape
    # monkeypatches SI._get at import time, so inspecting the attribute here
    # samples ITS stub when the suite runs together and the real function when
    # this file runs alone — green in isolation, red in CI, for a reason that
    # has nothing to do with the code under test. The source file cannot be
    # monkeypatched.
    body = SRC[SRC.index("def _get("):SRC.index("def fetch_league(")]
    assert "base" in body, "_get no longer takes a base"
    assert ("v1_" in body and "data_" in body), \
        "the cache key does not distinguish the surfaces, so a pre-fix cached " \
        "response can still be served to the fixed code path"


def test_the_LOG_LINE_prints_the_FULL_url_not_just_the_path():
    """The line that hid this for seven weeks.

    `projections /projections/nfl/2026/5?season_type=regular: 7630 rows, 0 with
    stats` is indistinguishable from a working request. Had it printed the base,
    the /v1 would have been visible in the first failure anyone read.
    """
    body = SRC[SRC.index("def _best_payload("):SRC.index("def fetch_projections(")]
    assert "{(base or BASE)}{path}" in body or "(base or BASE)" in body, \
        "the probe log prints a bare path again — the exact thing that made a " \
        "wrong-surface request look like a correct one"


def test_CONTROL_the_paths_themselves_are_unchanged():
    """The fix is the BASE, not the paths. If someone 'fixes' this by editing
    the path templates instead, the season-shaped-payload guard above them
    (which cost a real incident) stops lining up with reality."""
    assert "/projections/nfl/{season}/{week}?season_type=regular" in SI._PROJECTION_PATHS
    assert "/stats/nfl/{season}/{week}?season_type=regular" in SI._STATS_PATHS


def test_CONTROL_this_file_would_have_FAILED_before_the_fix():
    """Rule 3e — an assertion that has only ever seen the fixed state is
    untested. Before 2026-10-07 there was no DATA_BASE at all, so the first
    assertion here could not have passed."""
    assert "DATA_BASE" in SRC
    assert SRC.count("DATA_BASE") >= 3, \
        "DATA_BASE should be defined and used by both fetchers"
