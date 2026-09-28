"""THE VERSION-GATED UNDERDOG PATH MUST NOT COME BACK.

`beta/v5` started answering HTTP 426 `upgrade_required` on 2026-09-06 and this
repo's free props writer failed on EVERY run for twenty-two days — the props
arm, which the in-season edge plan ranks first, ran three game weeks on a
2026-09-04 file. Measured 2026-09-28 by `draft/tools/underdog_426_probe.py`
(with a known-positive control on Sleeper, so the row of refusals is a finding
and not a runner without network):

    beta/v5, writer's headers ................. 426 upgrade_required
    beta/v5 + client-type ..................... 426 upgrade_required
    beta/v5 + client-version .................. 426 upgrade_required
    beta/v5 + client-type & client-version .... 426 upgrade_required
    beta/v5 + X-Client-Type / X-Client-Version  426 upgrade_required
    beta/v5 + app-style User-Agent ............ 426 upgrade_required
    beta/v6, writer's headers ................. 426 upgrade_required
    beta/v6 + client-type & client-version .... 426 upgrade_required
    v1,     writer's headers .................. 200  ✅

The gate is on the versioned `beta/*` paths, not on our client. This pins that
conclusion in the one place that matters: the URL the writer actually calls.

Run: python3 -m pytest draft/tests/test_underdog_endpoint_not_version_gated.py -q
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "draft" / "tools"))

TOOL = ROOT / "draft" / "tools" / "fetch_free_props.py"
SRC = TOOL.read_text(encoding="utf8")


def _url():
    import fetch_free_props as F
    return F.UNDERDOG_LINES


def test_the_writer_calls_underdog_on_a_path_that_is_not_version_gated():
    url = _url()
    assert "underdogfantasy.com" in url, url
    assert "/beta/v" not in url, (
        f"the writer is back on a version-gated Underdog path ({url}). Every "
        "beta/v5 and beta/v6 arm returned 426 upgrade_required on 2026-09-28 "
        "regardless of headers; v1 returned 200 on the same headers.")


def test_the_reason_is_written_down_where_the_url_is():
    """A bare URL swap with no explanation is how it gets swapped back.

    Not a style check: the next person to see `v1` next to a vendor whose docs
    advertise v5 will assume it is stale and 'fix' it.
    """
    m = re.search(r"UNDERDOG_LINES\s*=", SRC)
    assert m, "UNDERDOG_LINES is gone — this guard needs rewriting, not deleting"
    preamble = SRC[:m.start()]
    tail = preamble[-3000:]
    assert "426" in tail and "upgrade_required" in tail, \
        "the 426 finding is not recorded beside the URL it explains"
    assert "504" in tail, "register 504 is not cited beside the line that closes it"


def test_the_NFL_FILTER_is_still_there_because_v1_carries_other_sports():
    """v1 returns 76 distinct display_stat values — tennis aces, batter walks,
    three-pointers. The parser's sport filter is the only thing keeping a
    tennis line out of a football projection, and it became load-bearing the
    moment the endpoint changed."""
    import fetch_free_props as F
    src = Path(F.__file__).read_text(encoding="utf8")
    body = src[src.index("def parse_underdog"):]
    body = body[:body.index("\ndef ", 10)]
    assert "sport" in body, \
        "parse_underdog no longer filters by sport — v1 carries non-NFL markets"
    assert "NFL" in body, "the NFL filter's literal is gone from parse_underdog"


def test_CONTROL_this_file_would_FAIL_on_the_old_url():
    """Rule 3e — an assertion that has only ever seen the fixed state is untested."""
    old = "https://api.underdogfantasy.com/beta/v5/over_under_lines"
    assert "/beta/v" in old, "the control fixture is not the gated shape"
    assert "/beta/v" not in _url(), "live URL matches the shape the control rejects"
