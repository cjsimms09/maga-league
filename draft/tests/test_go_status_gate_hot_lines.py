# TERRITORY: relay (draft/tools/go_status.py) — added 2026-09-05, register 488.
"""THE SWEEP SHOWED ONE OVERDUE ROW WHEN 21 WERE OVERDUE, PICKED BY SORT ORDER ALONE.

`go_status.py`'s gate-health block used to print `(hot or lines)[-1]` — the LAST
line of a gate tool's output that looked actionable — as its whole account of
why the gate failed. Found 2026-09-05 rolling register 444: `go_status.py`
reported register_recheck_check.js red because of row 444 alone, but running
the gate directly showed 21 rows past their own recheck date the same day,
444 among them only because it happened to sort last. The other 20 were real
and were invisible to the one line "go"'s own agenda is built from.

`gate_hot_lines(lines)` is the extracted, testable seam: given the gate's
output lines, it returns every actionable line and the one to show inline.
The FAIL ARM here is the point (Rule 3e) — pinned against the exact shape of
the original defect: many overdue rows, one of which is not last by sort
order, must all be counted rather than only the last one printed.

Run: python3 -m pytest draft/tests/test_go_status_gate_hot_lines.py -q
"""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "draft" / "tools"))

import go_status as G  # noqa: E402


def test_a_single_overdue_row_is_reported_alone():
    lines = [
        "REGISTER RECHECKS",
        "  🔴 PAST ITS OWN RECHECK DATE AND STILL OPEN:",
        "     444   due 2026-09-04   444 some finding",
    ]
    hot, tail = G.gate_hot_lines(lines)
    assert len(hot) == 1
    assert "444" in tail


def test_TWENTY_ONE_OVERDUE_ROWS_ARE_ALL_COUNTED_NOT_JUST_THE_LAST():
    """The fail arm on the original defect: 21 overdue rows, several of
    which do not sort last, must all land in `hot` — not just row 435,
    which happened to print last on 2026-09-05."""
    lines = ["REGISTER RECHECKS", "  🔴 PAST ITS OWN RECHECK DATE AND STILL OPEN:"]
    ids = [283, 265, 124, 99, 97, 76, 275, 258, 268, 307, 309,
           330, 333, 344, 345, 352, 356, 365, 387, 428, 435]
    lines += [f"     {i}   due 2026-09-04   {i} some finding" for i in ids]
    hot, tail = G.gate_hot_lines(lines)
    assert len(hot) == len(ids), f"expected {len(ids)} actionable lines, got {len(hot)}"
    # the last one printed is still what shows inline when only one fits —
    # count_note in go_status.py is what tells the reader there are others.
    assert "435" in tail


def test_an_ambiguous_dual_recheck_date_line_counts_as_actionable():
    """register_recheck_check.js's 'MORE THAN ONE live recheck date' block
    does not print the word 'due' — `id  date  and  date` — so the original
    filter (`OVERDUE`, `due 20`, `✗`) silently dropped it from the count."""
    lines = [
        "REGISTER RECHECKS",
        "  🔴 1 OPEN row(s) carry MORE THAN ONE live recheck date,",
        "     444   2026-09-04  and  2026-09-12",
    ]
    hot, tail = G.gate_hot_lines(lines)
    assert len(hot) == 1
    assert "444" in tail


def test_no_actionable_lines_falls_back_to_the_last_line_of_output():
    lines = ["REGISTER RECHECKS", "  ✅ no finding is past its own recheck date."]
    hot, tail = G.gate_hot_lines(lines)
    assert hot == []
    assert tail == "✅ no finding is past its own recheck date."
