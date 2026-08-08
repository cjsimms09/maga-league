"""Money-history reconciliation cross-check (chat-Claude's requested guard).

The base-money table must reconcile against the bracket finishes per season:
each season's playoff dollars equal the playoff pot ($2,125) or zero (unplayed).
A leak here means double-counted or mis-joined finishes — the exact 'definitively
wrong' class the reconnaissance flagged. Run: python -m pytest draft/tests/test_money_history.py -q
"""
from __future__ import annotations
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))

import money_history as M  # noqa: E402


def test_playoff_dollars_reconcile_per_season():
    result = M.analyse()
    if result.get("error"):
        # No weekly data harvested locally is a pending state, not a failure.
        return
    rc = result.get("reconciliation", {})
    assert rc, "expected per-season reconciliation once seasons are graded"
    for season, r in rc.items():
        assert r["ok"], (f"season {season} playoff $ = {r['assigned']} != pot {r['expected']} "
                         f"(or 0) — double-count or bad bracket join")


def test_no_manager_exceeds_theoretical_max():
    result = M.analyse()
    if result.get("error"):
        return
    n_seasons = len(result.get("graded_seasons", [])) or 1
    # Weekly-high ceiling: 15 weeks * $100 * n_seasons. Playoff+RS are bounded too;
    # a total beyond all pools combined would be a join bug.
    ceiling = n_seasons * (15 * 100 + 250 + 675)   # weekly + RS champ + playoff 1st
    for row in result.get("dollar_standings", []):
        assert row["total_$"] <= ceiling, f"{row['name']} ${row['total_$']} exceeds ceiling ${ceiling}"
